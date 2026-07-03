import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { StorageService } from '../storage/storage.service';
import { EmailPrefilterService, EmailData } from './email-prefilter.service';
import * as path from 'path';
import { NotificationType, UsageType } from '@prisma/client';

/**
 * Provider-agnostic email structure, normalized from Gmail or Outlook messages.
 */
export interface NormalizedEmail {
  messageId: string;
  subject: string;
  senderEmail: string;
  senderName: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
  headers: Record<string, string>;
  attachments: NormalizedAttachment[];
  /** Whether this message is in the inbox (used for Gmail label filtering) */
  isInbox?: boolean;
}

export interface NormalizedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  /** Pre-downloaded attachment data. Must be populated before calling processCvAttachment. */
  data: Buffer;
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
export class EmailProcessingService {
  private readonly logger = new Logger(EmailProcessingService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private fileProcessingService: FileProcessingService,
    private emailPrefilterService: EmailPrefilterService,
    private notificationsService: NotificationsService,
    private billingService: BillingService,
    private storageService: StorageService,
  ) {}

  /**
   * Process a normalized email through prefilter -> classify -> import pipeline.
   * Returns { imported: true } if a candidate was created.
   */
  async processNormalizedEmail(
    email: NormalizedEmail,
    connection: any,
  ): Promise<{ imported: boolean }> {
    // Skip messages not in inbox (Gmail-specific, Outlook always inbox from delta query)
    if (email.isInbox === false) {
      this.logger.log(
        `Email ${email.messageId} not in INBOX, skipping`,
      );
      return { imported: false };
    }

    // Check if already processed
    const existingImport = await this.prisma.emailImport.findUnique({
      where: { messageId: email.messageId },
    });

    if (existingImport) {
      this.logger.log(`Email ${email.messageId} already processed, skipping`);
      return { imported: false };
    }

    // Skip emails sent BY the connected account
    if (email.senderEmail.toLowerCase() === connection.email.toLowerCase()) {
      this.logger.log(
        `Email ${email.messageId} sent by connected account ${connection.email}, skipping`,
      );
      return { imported: false };
    }

    // Build attachment info for prefilter
    const attachmentInfo = email.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
    }));

    // Build email data for prefilter
    const emailData: EmailData = {
      subject: email.subject,
      senderEmail: email.senderEmail,
      senderName: email.senderName,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      attachments: attachmentInfo,
      headers: email.headers,
      companyDomain: connection.company?.domain || undefined,
    };

    // Run prefilter
    const prefilterResult =
      this.emailPrefilterService.prefilterEmail(emailData);

    this.logger.log(
      `Prefilter result for email ${email.messageId}: ${prefilterResult.action} - ${prefilterResult.reason}`,
    );

    // Handle skip
    if (prefilterResult.action === 'skip') {
      await this.prisma.emailImport.create({
        data: {
          messageId: email.messageId,
          subject: email.subject,
          senderEmail: email.senderEmail,
          senderName: email.senderName,
          receivedAt: email.receivedAt,
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

    // Determine classification
    let classification: {
      isJobApplication: boolean;
      confidence: number;
      detectedPosition: string | null;
    };

    if (prefilterResult.action === 'auto_classify') {
      classification = {
        isJobApplication: true,
        confidence: prefilterResult.confidence || 85,
        detectedPosition: prefilterResult.detectedPosition || null,
      };
      this.logger.log(
        `Email ${email.messageId} auto-classified by prefilter (${classification.confidence}% confidence)`,
      );
    } else {
      const aiClassification = await this.aiService.classifyEmail(
        email.subject,
        email.bodyText,
        email.senderEmail,
        email.senderName,
      );
      classification = {
        isJobApplication: aiClassification.isJobApplication,
        confidence: aiClassification.confidence,
        detectedPosition: aiClassification.detectedPosition,
      };

      await this.billingService.trackUsage(
        connection.companyId,
        UsageType.AI_PARSING_CALL,
      );
    }

    // Create email import record
    const emailImport = await this.prisma.emailImport.create({
      data: {
        messageId: email.messageId,
        subject: email.subject,
        senderEmail: email.senderEmail,
        senderName: email.senderName,
        receivedAt: email.receivedAt,
        isJobApplication: classification.isJobApplication,
        confidence: classification.confidence,
        detectedPosition: classification.detectedPosition,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        status: 'PENDING',
        skipReason:
          prefilterResult.action === 'auto_classify'
            ? `Auto-classified: ${prefilterResult.reason}`
            : null,
        emailConnectionId: connection.id,
      },
    });

    // Auto-import if high confidence job application
    if (
      connection.autoImport &&
      classification.isJobApplication &&
      classification.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD
    ) {
      this.logger.log(
        `Email ${email.messageId} classified as job application (${classification.confidence}% confidence)`,
      );

      await this.prisma.emailImport.update({
        where: { id: emailImport.id },
        data: { status: 'PROCESSING' },
      });

      try {
        const cvAttachments = email.attachments.filter((a) =>
          CV_MIME_TYPES.includes(a.mimeType),
        );

        if (cvAttachments.length > 0) {
          await this.processCvAttachment(
            cvAttachments[0].data,
            cvAttachments[0].filename,
            cvAttachments[0].mimeType,
            emailImport,
            connection.companyId,
            classification.detectedPosition,
          );
        } else {
          await this.createCandidateFromEmail(
            emailImport,
            connection.companyId,
            email.senderEmail,
            email.senderName,
            { detectedPosition: classification.detectedPosition },
          );
        }

        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'IMPORTED',
            processedAt: new Date(),
            bodyText: null,
            bodyHtml: null,
          },
        });

        await this.billingService.trackUsage(
          connection.companyId,
          UsageType.EMAIL_IMPORTED,
        );

        return { imported: true };
      } catch (error) {
        this.logger.error(`Failed to import email ${email.messageId}:`, error);
        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'FAILED',
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
            processedAt: new Date(),
            bodyText: null,
            bodyHtml: null,
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
          bodyText: null,
          bodyHtml: null,
        },
      });
      return { imported: false };
    }
  }

  /**
   * Process a CV attachment buffer: upload, extract text, AI parse, create candidate.
   */
  async processCvAttachment(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    emailImport: any,
    companyId: string,
    detectedPosition?: string | null,
  ): Promise<void> {
    // Upload file to S3
    const uploadResult = await this.storageService.uploadFile(
      fileBuffer,
      filename,
      mimeType,
      companyId,
      'cvs',
    );

    this.logger.debug(
      `Attachment uploaded: ${filename} -> ${uploadResult.key} (local: ${uploadResult.isLocal})`,
    );

    // Extract text from CV
    const extraction = await this.fileProcessingService.extractText(
      fileBuffer,
      filename,
    );

    if (!extraction.text || extraction.confidence < 30) {
      throw new Error('Could not extract text from CV attachment');
    }

    // Parse CV using AI
    let parsedData;
    let aiSummary = null;

    try {
      parsedData = await this.aiService.parseCV(extraction.text, filename);
      aiSummary = parsedData.summary || null;

      await this.billingService.trackUsage(
        companyId,
        UsageType.AI_PARSING_CALL,
      );
    } catch (error) {
      this.logger.error('AI parsing error:', error);
      parsedData = this.extractBasicDataFromFilename(filename);
    }

    // Use sender info as fallback
    const fullName =
      parsedData.personalInfo?.fullName ||
      emailImport.senderName ||
      this.extractNameFromFilename(filename);

    const email =
      parsedData.personalInfo?.email?.toLowerCase() ||
      emailImport.senderEmail.toLowerCase();

    // Check for duplicate
    const existing = await this.prisma.candidate.findFirst({
      where: { companyId, email },
    });

    if (existing) {
      this.logger.warn(`Duplicate candidate with email ${email}, skipping`);
      return;
    }

    // Find matching job
    let jobId: string | null = null;
    if (detectedPosition) {
      const job = await this.prisma.job.findFirst({
        where: {
          companyId,
          title: { contains: detectedPosition, mode: 'insensitive' },
          status: 'ACTIVE',
        },
      });
      if (job) {
        jobId = job.id;
      }
    }

    // Create candidate
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
        cvFileUrl: uploadResult.url,
        cvFileName: filename,
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

    if (jobId) {
      await this.scoreCandidate(candidate.id, jobId);
    }
  }

  /**
   * Create candidate from email body (no CV attachment).
   */
  async createCandidateFromEmail(
    emailImport: any,
    companyId: string,
    senderEmail: string,
    senderName: string,
    classification: { detectedPosition?: string | null },
  ): Promise<void> {
    const existing = await this.prisma.candidate.findFirst({
      where: { companyId, email: senderEmail.toLowerCase() },
    });

    if (existing) {
      this.logger.warn(
        `Duplicate candidate with email ${senderEmail}, skipping`,
      );
      return;
    }

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

    await this.prisma.candidate.create({
      data: {
        fullName: senderName || senderEmail.split('@')[0],
        email: senderEmail.toLowerCase(),
        source: 'EMAIL',
        status: 'NEW',
        cvFileUrl: '',
        aiSummary: `Candidate applied via email. Subject: ${emailImport.subject}`,
        companyId,
        jobId,
        emailImportId: emailImport.id,
      },
    });

    this.logger.log(`Created candidate from email body (no CV attachment)`);
  }

  /**
   * Score a candidate against a job.
   */
  async scoreCandidate(candidateId: string, jobId: string) {
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
        description: job.description ?? undefined,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experienceLevel: job.experienceLevel,
        requirements: (job.requirements as Record<string, any>) || {},
      });

      await this.billingService.trackUsage(
        candidate.companyId,
        UsageType.AI_SCORING_CALL,
      );

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
   * Send import complete notification for a connection.
   */
  async sendImportNotification(
    companyId: string,
    connectionId: string,
    email: string,
    importCount: number,
  ): Promise<void> {
    if (importCount > 0) {
      await this.notificationsService.createNotification({
        type: NotificationType.EMAIL_IMPORT_COMPLETE,
        companyId,
        title: 'Email Import Complete',
        message: `${importCount} new candidate(s) imported from ${email}.`,
        metadata: {
          connectionId,
          email,
          count: importCount,
        },
      });
    }
  }

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
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(' ') || 'Unknown Candidate'
    );
  }

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
}
