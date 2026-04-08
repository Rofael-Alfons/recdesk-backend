import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  EmailProcessingService,
  NormalizedEmail,
  NormalizedAttachment,
  SyncResult,
} from './email-processing.service';

/**
 * Outlook-specific email monitoring service.
 * Uses Microsoft Graph delta queries for incremental sync
 * and delegates processing to the shared EmailProcessingService.
 *
 * Note: OutlookGraphService is injected via forwardRef string token
 * to avoid circular file-level imports (OutlookGraphService -> OutlookMonitorService -> OutlookGraphService).
 */
@Injectable()
export class OutlookMonitorService {
  private readonly logger = new Logger(OutlookMonitorService.name);
  private readonly pollingConnections = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private integrationsService: IntegrationsService,
    private emailProcessingService: EmailProcessingService,
    @Inject('OutlookGraphService')
    private outlookGraphService: any,
  ) {}

  /**
   * Poll emails for a specific Outlook connection using delta queries.
   */
  async pollEmailsForConnection(
    connectionId: string,
    companyId?: string,
  ): Promise<SyncResult> {
    // Prevent concurrent polls
    if (this.pollingConnections.has(connectionId)) {
      this.logger.debug(
        `Skipping poll for Outlook connection ${connectionId} — already in progress`,
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
        throw new Error('Email connection not found');
      }

      if (companyId && connection.companyId !== companyId) {
        throw new Error('Connection does not belong to this company');
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
        this.logger.log(
          `Polling Outlook emails for ${connection.email} (connection: ${connectionId})`,
        );

        // Fetch new messages via delta query
        const { messages, deltaLink } =
          await this.outlookGraphService.fetchNewMessages(connectionId);

        this.logger.log(
          `Found ${messages.length} new Outlook emails for connection ${connectionId}`,
        );

        // Process each message
        for (const graphMessage of messages) {
          // Skip deleted/removed messages from delta response
          if (graphMessage['@removed']) {
            continue;
          }

          try {
            const normalized = await this.normalizeOutlookMessage(
              connectionId,
              graphMessage,
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
            result.errors.push(
              `Message ${graphMessage.id}: ${errorMsg}`,
            );
            this.logger.error(
              `Error processing Outlook email ${graphMessage.id}:`,
              error,
            );
          }
        }

        // Update last sync and delta link
        const updateData: any = { lastSyncAt: new Date() };
        if (deltaLink) {
          updateData.lastHistoryId = deltaLink;
        }

        await this.prisma.emailConnection.update({
          where: { id: connectionId },
          data: updateData,
        });

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
          `Failed to poll Outlook emails for connection ${connectionId}:`,
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
   * Normalize a Microsoft Graph message to a NormalizedEmail.
   * Downloads attachments if the message has them.
   */
  private async normalizeOutlookMessage(
    connectionId: string,
    graphMessage: any,
  ): Promise<NormalizedEmail> {
    const from = graphMessage.from?.emailAddress || {};
    const senderEmail = from.address || '';
    const senderName = from.name || '';

    // Extract body text
    let bodyText = '';
    let bodyHtml = '';

    if (graphMessage.body) {
      if (graphMessage.body.contentType === 'html') {
        bodyHtml = graphMessage.body.content || '';
        // Strip HTML tags for bodyText fallback
        bodyText = bodyHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        bodyText = graphMessage.body.content || '';
      }
    }

    // Extract relevant internet headers for prefilter
    const headers: Record<string, string> = {};
    const relevantHeaders = [
      'list-unsubscribe',
      'x-mailer',
      'x-auto-response-suppress',
      'auto-submitted',
    ];

    if (graphMessage.internetMessageHeaders) {
      for (const header of graphMessage.internetMessageHeaders) {
        if (
          header.name &&
          relevantHeaders.includes(header.name.toLowerCase())
        ) {
          headers[header.name.toLowerCase()] = header.value || '';
        }
      }
    }

    // Download attachments if present
    const attachments: NormalizedAttachment[] = [];
    if (graphMessage.hasAttachments) {
      try {
        const rawAttachments =
          await this.outlookGraphService.fetchMessageAttachments(
            connectionId,
            graphMessage.id,
          );

        for (const att of rawAttachments) {
          attachments.push({
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            data: att.data,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch attachments for Outlook message ${graphMessage.id}:`,
          error,
        );
      }
    }

    return {
      messageId: graphMessage.id,
      subject: graphMessage.subject || '',
      senderEmail,
      senderName,
      bodyText,
      bodyHtml,
      receivedAt: graphMessage.receivedDateTime
        ? new Date(graphMessage.receivedDateTime)
        : new Date(),
      headers,
      attachments,
      // Outlook delta query on Inbox folder only returns inbox messages
      isInbox: true,
    };
  }

  /**
   * Sync all Outlook connections for a company.
   */
  async syncAllConnectionsForCompany(companyId: string): Promise<{
    results: SyncResult[];
    totalImported: number;
  }> {
    const connections = await this.prisma.emailConnection.findMany({
      where: {
        companyId,
        isActive: true,
        provider: 'OUTLOOK',
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
   * Refresh an Outlook connection token.
   */
  async refreshConnectionToken(connectionId: string): Promise<void> {
    await this.integrationsService.refreshOutlookToken(connectionId);
  }
}
