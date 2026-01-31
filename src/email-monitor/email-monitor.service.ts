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
import { AiService } from '../ai/ai.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { EmailPrefilterService, EmailData } from './email-prefilter.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { NotificationType, UsageType } from '@prisma/client';

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

export interface SyncResult {
  connectionId: string;
  email: string;
  emailsProcessed: number;
  emailsImported: number;
  emailsSkipped: number;
  errors: string[];
}

const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 80;
const CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class EmailMonitorService {
  private readonly logger = new Logger(EmailMonitorService.name);
  private oauth2Client;
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private integrationsService: IntegrationsService,
    private aiService: AiService,
    private fileProcessingService: FileProcessingService,
    private emailPrefilterService: EmailPrefilterService,
    private notificationsService: NotificationsService,
    private billingService: BillingService,
  ) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri = this.configService.get<string>('google.redirectUri');

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    
    // For local development, store files in a local directory
    this.uploadDir = path.join(process.cwd(), 'uploads', 'cvs');
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create upload directory:', error);
    }
  }

  /**
   * Poll emails for a specific connection
   */
  async pollEmailsForConnection(
    connectionId: string,
    companyId?: string,
  ): Promise<SyncResult> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
      include: { company: true },
    });

    if (!connection) {
      throw new NotFoundException('Email connection not found');
    }

    if (companyId && connection.companyId !== companyId) {
      throw new BadRequestException('Connection does not belong to this company');
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
      const accessToken = await this.integrationsService.getValidAccessToken(connectionId);
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Fetch new emails
      const messages = await this.fetchNewEmails(gmail, connection.lastHistoryId);

      this.logger.log(
        `Found ${messages.length} new emails for connection ${connectionId}`,
      );

      // Process each email
      for (const message of messages) {
        try {
          const processed = await this.processEmail(gmail, connection, message);
          result.emailsProcessed++;

          if (processed.imported) {
            result.emailsImported++;
          } else {
            result.emailsSkipped++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
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
      if (result.emailsImported > 0) {
        await this.notificationsService.createNotification({
          type: NotificationType.EMAIL_IMPORT_COMPLETE,
          companyId: connection.companyId,
          title: 'Email Import Complete',
          message: `${result.emailsImported} new candidate(s) imported from ${connection.email}.`,
          metadata: {
            connectionId: connection.id,
            email: connection.email,
            count: result.emailsImported,
          },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to poll emails for connection ${connectionId}:`, error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
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
    } catch (error) {
      this.logger.error(`Failed to get message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Process a single email message
   */
  private async processEmail(
    gmail: gmail_v1.Gmail,
    connection: any,
    message: GmailMessage,
  ): Promise<{ imported: boolean }> {
    // Check if already processed
    const existingImport = await this.prisma.emailImport.findUnique({
      where: { messageId: message.id },
    });

    if (existingImport) {
      this.logger.log(`Email ${message.id} already processed, skipping`);
      return { imported: false };
    }

    // Extract email data
    const { subject, from, bodyText, bodyHtml, headers } = this.extractEmailData(message);

    const senderEmail = this.extractEmail(from);
    const senderName = this.extractName(from);

    // Extract attachments early for prefilter
    const attachments = await this.extractAttachments(gmail, message);
    const attachmentInfo = attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
    }));

    // Build email data for prefilter
    const emailData: EmailData = {
      subject,
      senderEmail,
      senderName,
      bodyText,
      bodyHtml,
      attachments: attachmentInfo,
      headers,
      companyDomain: connection.company?.domain || undefined,
    };

    // Run prefilter to check if we need AI classification
    const prefilterResult = this.emailPrefilterService.prefilterEmail(emailData);
    
    this.logger.log(
      `Prefilter result for email ${message.id}: ${prefilterResult.action} - ${prefilterResult.reason}`,
    );

    // Handle prefilter result
    if (prefilterResult.action === 'skip') {
      // Create email import record with SKIPPED status
      // Note: bodyText/bodyHtml intentionally omitted to save storage (~95% reduction)
      await this.prisma.emailImport.create({
        data: {
          messageId: message.id,
          subject,
          senderEmail,
          senderName,
          receivedAt: new Date(parseInt(message.internalDate)),
          isJobApplication: false,
          confidence: 0,
          status: 'SKIPPED',
          skipReason: prefilterResult.reason,
          processedAt: new Date(),
          emailConnectionId: connection.id,
        },
      });
      return { imported: false };
    }

    // Determine classification (either from prefilter auto-classify or AI)
    let classification: {
      isJobApplication: boolean;
      confidence: number;
      detectedPosition: string | null;
    };

    if (prefilterResult.action === 'auto_classify') {
      // Use prefilter classification (skip AI call)
      classification = {
        isJobApplication: true,
        confidence: prefilterResult.confidence || 85,
        detectedPosition: prefilterResult.detectedPosition || null,
      };
      this.logger.log(
        `Email ${message.id} auto-classified by prefilter (${classification.confidence}% confidence)`,
      );
    } else {
      // Use AI classification
      const aiClassification = await this.aiService.classifyEmail(
        subject,
        bodyText,
        senderEmail,
        senderName,
      );
      classification = {
        isJobApplication: aiClassification.isJobApplication,
        confidence: aiClassification.confidence,
        detectedPosition: aiClassification.detectedPosition,
      };
      
      // Track AI classification call (counts as AI_PARSING_CALL)
      await this.billingService.trackUsage(connection.companyId, UsageType.AI_PARSING_CALL);
    }

    // Create email import record
    const emailImport = await this.prisma.emailImport.create({
      data: {
        messageId: message.id,
        subject,
        senderEmail,
        senderName,
        receivedAt: new Date(parseInt(message.internalDate)),
        isJobApplication: classification.isJobApplication,
        confidence: classification.confidence,
        detectedPosition: classification.detectedPosition,
        bodyText,
        bodyHtml,
        status: 'PENDING',
        skipReason: prefilterResult.action === 'auto_classify' 
          ? `Auto-classified: ${prefilterResult.reason}` 
          : null,
        emailConnectionId: connection.id,
      },
    });

    // If high confidence job application and auto-import is enabled
    if (
      connection.autoImport &&
      classification.isJobApplication &&
      classification.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD
    ) {
      this.logger.log(
        `Email ${message.id} classified as job application (${classification.confidence}% confidence)`,
      );

      // Update status to processing
      await this.prisma.emailImport.update({
        where: { id: emailImport.id },
        data: { status: 'PROCESSING' },
      });

      try {
        const cvAttachments = attachments.filter((a) =>
          CV_MIME_TYPES.includes(a.mimeType),
        );

        if (cvAttachments.length > 0) {
          // Process CV attachment
          await this.processAttachment(
            gmail,
            cvAttachments[0],
            message.id,
            emailImport,
            connection.companyId,
            classification.detectedPosition,
          );
        } else {
          // Create candidate from email body
          await this.createCandidateFromEmail(
            emailImport,
            connection.companyId,
            senderEmail,
            senderName,
            { detectedPosition: classification.detectedPosition },
          );
        }

        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'IMPORTED',
            processedAt: new Date(),
          },
        });

        // Track email imported usage
        await this.billingService.trackUsage(connection.companyId, UsageType.EMAIL_IMPORTED);

        return { imported: true };
      } catch (error) {
        this.logger.error(`Failed to import email ${message.id}:`, error);
        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            processedAt: new Date(),
          },
        });
        throw error;
      }
    } else {
      // Not a job application or low confidence
      await this.prisma.emailImport.update({
        where: { id: emailImport.id },
        data: {
          status: 'SKIPPED',
          processedAt: new Date(),
          skipReason: classification.isJobApplication
            ? `Low confidence (${classification.confidence}%)`
            : 'AI determined not a job application',
        },
      });
      return { imported: false };
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
      messageHeaders.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('subject');
    const from = getHeader('from');

    // Build headers object for prefilter (only relevant headers)
    const headers: Record<string, string> = {};
    const relevantHeaders = ['list-unsubscribe', 'x-mailer', 'x-auto-response-suppress', 'auto-submitted'];
    for (const header of messageHeaders) {
      if (header.name && relevantHeaders.includes(header.name.toLowerCase())) {
        headers[header.name.toLowerCase()] = header.value || '';
      }
    }

    let bodyText = '';
    let bodyHtml = '';

    // Extract body from parts
    // Note: Gmail returns MIME types with charset (e.g., "text/plain; charset=utf-8")
    // so we use startsWith() instead of exact match
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
   * Extract attachments from email
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
   * Process a CV attachment
   */
  async processAttachment(
    gmail: gmail_v1.Gmail,
    attachment: EmailAttachment,
    messageId: string,
    emailImport: any,
    companyId: string,
    detectedPosition?: string | null,
  ): Promise<void> {
    // Download attachment data
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachment.attachmentId,
    });

    if (!response.data.data) {
      throw new Error('Failed to download attachment');
    }

    const fileBuffer = Buffer.from(response.data.data, 'base64');

    // Save file locally
    const fileId = uuidv4();
    const ext = path.extname(attachment.filename);
    const savedFileName = `${fileId}${ext}`;
    const filePath = path.join(this.uploadDir, savedFileName);

    await fs.writeFile(filePath, fileBuffer);

    // Extract text from CV
    const extraction = await this.fileProcessingService.extractText(
      fileBuffer,
      attachment.filename,
    );

    if (!extraction.text || extraction.confidence < 30) {
      throw new Error('Could not extract text from CV attachment');
    }

    // Parse CV using AI
    let parsedData;
    let aiSummary = null;

    try {
      parsedData = await this.aiService.parseCV(extraction.text, attachment.filename);
      aiSummary = parsedData.summary || null;
      
      // Track AI parsing usage
      await this.billingService.trackUsage(companyId, UsageType.AI_PARSING_CALL);
    } catch (error) {
      this.logger.error('AI parsing error:', error);
      parsedData = this.extractBasicDataFromFilename(attachment.filename);
    }

    // Use sender info as fallback
    const fullName =
      parsedData.personalInfo?.fullName ||
      emailImport.senderName ||
      this.extractNameFromFilename(attachment.filename);

    const email =
      parsedData.personalInfo?.email?.toLowerCase() ||
      emailImport.senderEmail.toLowerCase();

    // Check for duplicate by email
    const existing = await this.prisma.candidate.findFirst({
      where: {
        companyId,
        email,
      },
    });

    if (existing) {
      this.logger.warn(`Duplicate candidate with email ${email}, skipping`);
      return;
    }

    // Find matching job if position detected
    let jobId: string | null = null;
    if (detectedPosition) {
      const job = await this.prisma.job.findFirst({
        where: {
          companyId,
          title: {
            contains: detectedPosition,
            mode: 'insensitive',
          },
          status: 'ACTIVE',
        },
      });
      if (job) {
        jobId = job.id;
      }
    }

    // Create candidate record
    const candidate = await this.prisma.candidate.create({
      data: {
        fullName,
        email,
        phone: parsedData.personalInfo?.phone,
        location: parsedData.personalInfo?.location,
        linkedinUrl: parsedData.personalInfo?.linkedinUrl,
        githubUrl: parsedData.personalInfo?.githubUrl,
        portfolioUrl: parsedData.personalInfo?.portfolioUrl,
        source: 'EMAIL',
        status: 'NEW',
        cvFileUrl: `/uploads/cvs/${savedFileName}`,
        cvFileName: attachment.filename,
        cvText: extraction.text,
        extractionConfidence: extraction.confidence,
        education: parsedData.education || [],
        experience: parsedData.experience || [],
        skills: parsedData.skills || [],
        projects: parsedData.projects || [],
        certifications: parsedData.certifications || [],
        languages: parsedData.languages || [],
        aiSummary,
        companyId,
        jobId,
        emailImportId: emailImport.id,
      },
    });

    this.logger.log(`Created candidate ${candidate.id} from email attachment`);

    // Score candidate if job assigned
    if (jobId) {
      await this.scoreCandidate(candidate.id, jobId);
    }
  }

  /**
   * Create candidate from email body (no CV attachment)
   */
  private async createCandidateFromEmail(
    emailImport: any,
    companyId: string,
    senderEmail: string,
    senderName: string,
    classification: { detectedPosition?: string | null },
  ): Promise<void> {
    // Check for duplicate
    const existing = await this.prisma.candidate.findFirst({
      where: {
        companyId,
        email: senderEmail.toLowerCase(),
      },
    });

    if (existing) {
      this.logger.warn(`Duplicate candidate with email ${senderEmail}, skipping`);
      return;
    }

    // Find matching job
    let jobId: string | null = null;
    if (classification.detectedPosition) {
      const job = await this.prisma.job.findFirst({
        where: {
          companyId,
          title: {
            contains: classification.detectedPosition,
            mode: 'insensitive',
          },
          status: 'ACTIVE',
        },
      });
      if (job) {
        jobId = job.id;
      }
    }

    // Create basic candidate record
    await this.prisma.candidate.create({
      data: {
        fullName: senderName || senderEmail.split('@')[0],
        email: senderEmail.toLowerCase(),
        source: 'EMAIL',
        status: 'NEW',
        cvFileUrl: '', // No CV file
        aiSummary: `Candidate applied via email. Subject: ${emailImport.subject}`,
        companyId,
        jobId,
        emailImportId: emailImport.id,
      },
    });

    this.logger.log(`Created candidate from email body (no CV attachment)`);
  }

  /**
   * Score a candidate against a job
   */
  private async scoreCandidate(candidateId: string, jobId: string) {
    try {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: candidateId },
      });

      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!candidate || !job) return;

      const parsedCV = {
        personalInfo: {
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          linkedinUrl: candidate.linkedinUrl,
          githubUrl: candidate.githubUrl,
          portfolioUrl: candidate.portfolioUrl,
        },
        education: (candidate.education as any[]) || [],
        experience: (candidate.experience as any[]) || [],
        skills: (candidate.skills as any) || [],
        projects: (candidate.projects as any[]) || [],
        certifications: (candidate.certifications as any[]) || [],
        languages: (candidate.languages as any[]) || [],
        summary: candidate.aiSummary,
      };

      const scoreResult = await this.aiService.scoreCandidate(parsedCV, {
        title: job.title,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experienceLevel: job.experienceLevel,
        requirements: (job.requirements as Record<string, any>) || {},
      });

      // Track AI scoring usage
      await this.billingService.trackUsage(candidate.companyId, UsageType.AI_SCORING_CALL);

      // Save score
      await this.prisma.candidateScore.create({
        data: {
          candidateId,
          jobId,
          overallScore: scoreResult.overallScore,
          skillsMatchScore: scoreResult.skillsMatchScore,
          experienceScore: scoreResult.experienceScore,
          educationScore: scoreResult.educationScore,
          growthScore: scoreResult.growthScore,
          bonusScore: scoreResult.bonusScore,
          recommendation: scoreResult.recommendation,
          scoreExplanation: scoreResult.scoreExplanation,
        },
      });

      // Update candidate overall score
      await this.prisma.candidate.update({
        where: { id: candidateId },
        data: {
          overallScore: scoreResult.overallScore,
          scoreBreakdown: scoreResult.scoreExplanation,
        },
      });
    } catch (error) {
      this.logger.error('Scoring error:', error);
    }
  }

  /**
   * Extract name from filename
   */
  private extractNameFromFilename(fileName: string): string {
    let name = path.basename(fileName, path.extname(fileName));
    name = name
      .replace(/[-_]/g, ' ')
      .replace(/cv|resume|curriculum|vitae/gi, '')
      .replace(/\d+/g, '')
      .trim();

    return (
      name
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ') || 'Unknown Candidate'
    );
  }

  /**
   * Extract basic data from filename
   */
  private extractBasicDataFromFilename(fileName: string) {
    return {
      personalInfo: {
        fullName: this.extractNameFromFilename(fileName),
        email: null,
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
      },
      education: [],
      experience: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      summary: null,
    };
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
