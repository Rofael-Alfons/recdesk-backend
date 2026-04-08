import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  EmailProcessingService,
  NormalizedEmail,
  NormalizedAttachment,
  SyncResult,
} from './email-processing.service';
import { NotificationType } from '@prisma/client';

export type { SyncResult } from './email-processing.service';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: gmail_v1.Schema$MessagePart;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  data?: Buffer;
}

@Injectable()
export class EmailMonitorService {
  private readonly logger = new Logger(EmailMonitorService.name);
  private readonly pollingConnections = new Set<string>();
  private oauth2Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private integrationsService: IntegrationsService,
    private emailProcessingService: EmailProcessingService,
  ) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri = this.configService.get<string>('google.redirectUri');

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  /**
   * Poll emails for a specific connection
   */
  async pollEmailsForConnection(
    connectionId: string,
    companyId?: string,
  ): Promise<SyncResult> {
    // Prevent concurrent polls for the same connection (Pub/Sub retries, cron overlap)
    if (this.pollingConnections.has(connectionId)) {
      this.logger.debug(
        `Skipping poll for connection ${connectionId} — already in progress`,
      );
      return {
        connectionId,
        email: '',
        emailsProcessed: 0,
        emailsImported: 0,
        emailsSkipped: 0,
        errors: [],
      };
    }

    this.pollingConnections.add(connectionId);

    try {
      const connection = await this.prisma.emailConnection.findUnique({
        where: { id: connectionId },
        include: { company: true },
      });

      if (!connection) {
        throw new NotFoundException('Email connection not found');
      }

      if (companyId && connection.companyId !== companyId) {
        throw new BadRequestException(
          'Connection does not belong to this company',
        );
      }

      const result: SyncResult = {
        connectionId,
        email: connection.email,
        emailsProcessed: 0,
        emailsImported: 0,
        emailsSkipped: 0,
        errors: [],
      };

      try {
        // Get valid access token
        const accessToken =
          await this.integrationsService.getValidAccessToken(connectionId);
        this.oauth2Client.setCredentials({ access_token: accessToken });

        this.logger.log(
          `Polling emails for ${connection.email} (connection: ${connectionId}, lastHistoryId: ${connection.lastHistoryId || 'none'}, token: ${accessToken ? accessToken.substring(0, 10) + '...' : 'MISSING'})`,
        );

        const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

        // Fetch new emails
        const messages = await this.fetchNewEmails(
          gmail,
          connection.lastHistoryId,
        );

        this.logger.log(
          `Found ${messages.length} new emails for connection ${connectionId}`,
        );

        // Process each email
        for (const message of messages) {
          try {
            // Normalize Gmail message and download attachments
            const normalized = await this.normalizeGmailMessage(
              gmail,
              message,
            );
            const processed =
              await this.emailProcessingService.processNormalizedEmail(
                normalized,
                connection,
              );
            result.emailsProcessed++;

            if (processed.imported) {
              result.emailsImported++;
            } else {
              result.emailsSkipped++;
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Message ${message.id}: ${errorMsg}`);
            this.logger.error(`Error processing email ${message.id}:`, error);
          }
        }

        // Update last sync time and history ID
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          await this.prisma.emailConnection.update({
            where: { id: connectionId },
            data: {
              lastSyncAt: new Date(),
              lastHistoryId: lastMessage.historyId,
            },
          });
        } else {
          await this.prisma.emailConnection.update({
            where: { id: connectionId },
            data: { lastSyncAt: new Date() },
          });
        }

        // Send notification if candidates were imported
        await this.emailProcessingService.sendImportNotification(
          connection.companyId,
          connection.id,
          connection.email,
          result.emailsImported,
        );

        return result;
      } catch (error) {
        this.logger.error(
          `Failed to poll emails for connection ${connectionId}:`,
          error,
        );
        result.errors.push(
          error instanceof Error ? error.message : 'Unknown error',
        );
        return result;
      }
    } finally {
      this.pollingConnections.delete(connectionId);
    }
  }

  /**
   * Normalize a Gmail message into a provider-agnostic NormalizedEmail.
   * Downloads attachment data inline.
   */
  private async normalizeGmailMessage(
    gmail: gmail_v1.Gmail,
    message: GmailMessage,
  ): Promise<NormalizedEmail> {
    const { subject, from, bodyText, bodyHtml, headers } =
      this.extractEmailData(message);

    const senderEmail = this.extractEmail(from);
    const senderName = this.extractName(from);

    // Extract and download attachments
    const rawAttachments = await this.extractAttachments(gmail, message);
    const attachments: NormalizedAttachment[] = [];

    for (const att of rawAttachments) {
      try {
        const response = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: message.id,
          id: att.attachmentId,
        });

        if (response.data.data) {
          attachments.push({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            data: Buffer.from(response.data.data, 'base64'),
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to download attachment ${att.filename} from message ${message.id}:`,
          error,
        );
      }
    }

    return {
      messageId: message.id,
      subject,
      senderEmail,
      senderName,
      bodyText,
      bodyHtml,
      receivedAt: new Date(parseInt(message.internalDate)),
      headers,
      attachments,
      isInbox: message.labelIds?.includes('INBOX') ?? false,
    };
  }

  /**
   * Fetch new emails from Gmail
   */
  private async fetchNewEmails(
    gmail: gmail_v1.Gmail,
    lastHistoryId?: string | null,
  ): Promise<GmailMessage[]> {
    const messages: GmailMessage[] = [];

    try {
      // If we have a history ID, use history API for incremental sync
      if (lastHistoryId) {
        const historyResponse = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: lastHistoryId,
          historyTypes: ['messageAdded'],
          labelId: 'INBOX',
        });

        const messageIds = new Set<string>();
        historyResponse.data.history?.forEach((h) => {
          h.messagesAdded?.forEach((m) => {
            if (m.message?.id) {
              messageIds.add(m.message.id);
            }
          });
        });

        for (const messageId of messageIds) {
          const message = await this.getMessageDetails(gmail, messageId);
          if (message) {
            messages.push(message);
          }
        }
      } else {
        // Initial sync - fetch recent unread emails
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread',
          maxResults: 50, // Limit initial sync
        });

        for (const msg of listResponse.data.messages || []) {
          if (msg.id) {
            const message = await this.getMessageDetails(gmail, msg.id);
            if (message) {
              messages.push(message);
            }
          }
        }
      }

      return messages;
    } catch (error: any) {
      // If history ID is invalid, fall back to list
      if (error.code === 404 || error.message?.includes('historyId')) {
        this.logger.warn('Invalid history ID, falling back to message list');
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread',
          maxResults: 20,
        });

        for (const msg of listResponse.data.messages || []) {
          if (msg.id) {
            const message = await this.getMessageDetails(gmail, msg.id);
            if (message) {
              messages.push(message);
            }
          }
        }

        return messages;
      }
      throw error;
    }
  }

  /**
   * Get full message details
   */
  private async getMessageDetails(
    gmail: gmail_v1.Gmail,
    messageId: string,
  ): Promise<GmailMessage | null> {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      return response.data as GmailMessage;
    } catch (error: any) {
      const errorCode =
        error?.response?.data?.error?.code || error?.code || 'N/A';
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        'Unknown error';
      this.logger.error(
        `Failed to get message ${messageId}: [${errorCode}] ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Extract email data from message
   */
  private extractEmailData(message: GmailMessage): {
    subject: string;
    from: string;
    bodyText: string;
    bodyHtml: string;
    headers: Record<string, string>;
  } {
    const messageHeaders = message.payload?.headers || [];

    const getHeader = (name: string) =>
      messageHeaders.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || '';

    const subject = getHeader('subject');
    const from = getHeader('from');

    // Build headers object for prefilter (only relevant headers)
    const headers: Record<string, string> = {};
    const relevantHeaders = [
      'list-unsubscribe',
      'x-mailer',
      'x-auto-response-suppress',
      'auto-submitted',
    ];
    for (const header of messageHeaders) {
      if (header.name && relevantHeaders.includes(header.name.toLowerCase())) {
        headers[header.name.toLowerCase()] = header.value || '';
      }
    }

    let bodyText = '';
    let bodyHtml = '';

    const extractBody = (part: gmail_v1.Schema$MessagePart, depth = 0) => {
      const mimeType = part.mimeType?.toLowerCase() || '';

      this.logger.debug(
        `[extractBody] depth=${depth}, mimeType=${part.mimeType}, hasData=${!!part.body?.data}, partsCount=${part.parts?.length || 0}`,
      );

      if (mimeType.startsWith('text/plain') && part.body?.data) {
        bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
        this.logger.debug(
          `[extractBody] Extracted text/plain body (${bodyText.length} chars)`,
        );
      } else if (mimeType.startsWith('text/html') && part.body?.data) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
        this.logger.debug(
          `[extractBody] Extracted text/html body (${bodyHtml.length} chars)`,
        );
      }

      if (part.parts) {
        part.parts.forEach((p) => extractBody(p, depth + 1));
      }
    };

    if (message.payload) {
      extractBody(message.payload);
    }

    return { subject, from, bodyText, bodyHtml, headers };
  }

  /**
   * Extract email address from "Name <email@example.com>" format
   */
  private extractEmail(from: string): string {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  }

  /**
   * Extract name from "Name <email@example.com>" format
   */
  private extractName(from: string): string {
    const match = from.match(/^([^<]+)</);
    return match ? match[1].trim().replace(/"/g, '') : '';
  }

  /**
   * Extract attachments from email (metadata only, no download)
   */
  async extractAttachments(
    gmail: gmail_v1.Gmail,
    message: GmailMessage,
  ): Promise<EmailAttachment[]> {
    const attachments: EmailAttachment[] = [];

    const findAttachments = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        part.parts.forEach(findAttachments);
      }
    };

    if (message.payload) {
      findAttachments(message.payload);
    }

    return attachments;
  }

  /**
   * Sync all connections for a company
   */
  async syncAllConnectionsForCompany(companyId: string): Promise<{
    results: SyncResult[];
    totalImported: number;
  }> {
    const connections = await this.prisma.emailConnection.findMany({
      where: {
        companyId,
        isActive: true,
        provider: 'GMAIL',
      },
    });

    const results: SyncResult[] = [];
    let totalImported = 0;

    for (const connection of connections) {
      const result = await this.pollEmailsForConnection(connection.id);
      results.push(result);
      totalImported += result.emailsImported;
    }

    return { results, totalImported };
  }

  /**
   * Get sync status for all connections
   */
  async getSyncStatus(companyId: string) {
    const connections = await this.prisma.emailConnection.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        isActive: true,
        autoImport: true,
        lastSyncAt: true,
        lastHistoryId: true,
        _count: {
          select: {
            emailImports: true,
          },
        },
      },
    });

    return connections.map((c) => ({
      id: c.id,
      email: c.email,
      isActive: c.isActive,
      autoImport: c.autoImport,
      lastSyncAt: c.lastSyncAt,
      totalEmailsProcessed: c._count.emailImports,
    }));
  }

  /**
   * Get sync status for a specific connection
   */
  async getConnectionSyncStatus(connectionId: string, companyId: string) {
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id: connectionId, companyId },
      include: {
        _count: {
          select: {
            emailImports: true,
          },
        },
        emailImports: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            subject: true,
            senderEmail: true,
            isJobApplication: true,
            confidence: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Email connection not found');
    }

    return {
      id: connection.id,
      email: connection.email,
      isActive: connection.isActive,
      autoImport: connection.autoImport,
      lastSyncAt: connection.lastSyncAt,
      totalEmailsProcessed: connection._count.emailImports,
      recentEmails: connection.emailImports,
    };
  }

  /**
   * Refresh connection token
   */
  async refreshConnectionToken(connectionId: string): Promise<void> {
    await this.integrationsService.refreshAccessToken(connectionId);
  }
}
