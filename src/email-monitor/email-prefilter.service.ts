import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SKIP_PATTERNS,
  JOB_APPLICATION_PATTERNS,
  CV_FILE_EXTENSIONS,
  CV_MIME_TYPES,
} from './prefilter-rules';

export type PrefilterAction = 'skip' | 'auto_classify' | 'needs_ai';

export interface PrefilterResult {
  action: PrefilterAction;
  reason: string;
  confidence?: number;
  detectedPosition?: string | null;
}

export interface EmailData {
  subject: string;
  senderEmail: string;
  senderName: string | null;
  bodyText: string;
  bodyHtml?: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
  }>;
  headers?: Record<string, string>;
  companyDomain?: string;
}

@Injectable()
export class EmailPrefilterService {
  private readonly logger = new Logger(EmailPrefilterService.name);
  private readonly enabled: boolean;
  private readonly autoClassifyEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('prefilter.enabled', true);
    this.autoClassifyEnabled = this.configService.get<boolean>(
      'prefilter.autoClassifyEnabled',
      true,
    );
  }

  /**
   * Pre-filter an email to determine if it needs AI classification
   */
  prefilterEmail(email: EmailData): PrefilterResult {
    if (!this.enabled) {
      return {
        action: 'needs_ai',
        reason: 'Prefilter disabled',
      };
    }

    // Step 1: Check if it should be skipped (obviously NOT a job application)
    const skipResult = this.checkSkipPatterns(email);
    if (skipResult) {
      this.logger.debug(`Email skipped: ${skipResult.reason}`);
      return skipResult;
    }

    // Step 2: Check if it's obviously a job application (auto-classify)
    if (this.autoClassifyEnabled) {
      const autoClassifyResult = this.checkJobApplicationPatterns(email);
      if (autoClassifyResult) {
        this.logger.debug(
          `Email auto-classified: ${autoClassifyResult.reason}`,
        );
        return autoClassifyResult;
      }
    }

    // Step 3: Uncertain - needs AI classification
    return {
      action: 'needs_ai',
      reason: 'Email requires AI classification',
    };
  }

  /**
   * Check if email matches skip patterns (NOT a job application)
   */
  private checkSkipPatterns(email: EmailData): PrefilterResult | null {
    const {
      subject,
      senderEmail,
      bodyText,
      bodyHtml,
      attachments,
      companyDomain,
    } = email;
    const body = bodyText || bodyHtml || '';

    // Check auto-reply patterns in subject
    for (const pattern of SKIP_PATTERNS.autoReplySubjectPatterns) {
      if (pattern.test(subject)) {
        return {
          action: 'skip',
          reason: `Auto-reply detected: subject matches "${pattern.source}"`,
        };
      }
    }

    // Check no-reply sender patterns
    for (const pattern of SKIP_PATTERNS.noReplySenderPatterns) {
      if (pattern.test(senderEmail)) {
        return {
          action: 'skip',
          reason: `No-reply sender: ${senderEmail}`,
        };
      }
    }

    // Check if sender is from the same company (internal email)
    if (
      companyDomain &&
      senderEmail.toLowerCase().endsWith(`@${companyDomain.toLowerCase()}`)
    ) {
      return {
        action: 'skip',
        reason: `Internal email from company domain: ${companyDomain}`,
      };
    }

    // Check newsletter patterns in body
    let newsletterIndicators = 0;
    for (const pattern of SKIP_PATTERNS.newsletterBodyPatterns) {
      if (pattern.test(body)) {
        newsletterIndicators++;
      }
    }
    // If 2+ newsletter indicators, likely a newsletter
    if (newsletterIndicators >= 2) {
      return {
        action: 'skip',
        reason: `Newsletter detected: ${newsletterIndicators} indicators found`,
      };
    }

    // Check system email patterns
    for (const pattern of SKIP_PATTERNS.systemEmailPatterns) {
      if (pattern.test(subject) || pattern.test(body)) {
        return {
          action: 'skip',
          reason: `System/automated email detected`,
        };
      }
    }

    // Check List-Unsubscribe header (mailing list)
    if (email.headers?.['list-unsubscribe']) {
      return {
        action: 'skip',
        reason: 'Mailing list detected (List-Unsubscribe header)',
      };
    }

    // Check if no attachments AND no job-related keywords
    const hasCvAttachment = this.hasCvAttachment(attachments);
    const hasJobKeywords = this.hasJobKeywords(subject, body);

    if (!hasCvAttachment && !hasJobKeywords) {
      return {
        action: 'skip',
        reason: 'No CV attachment and no job-related keywords',
      };
    }

    return null;
  }

  /**
   * Check if email matches job application patterns (high confidence)
   */
  private checkJobApplicationPatterns(
    email: EmailData,
  ): PrefilterResult | null {
    const { subject, bodyText, bodyHtml, attachments } = email;
    const body = bodyText || bodyHtml || '';

    const hasCvAttachment = this.hasCvAttachment(attachments);

    // Strong signal: CV attachment + job application subject
    if (hasCvAttachment) {
      for (const pattern of JOB_APPLICATION_PATTERNS.subjectPatterns) {
        if (pattern.test(subject)) {
          return {
            action: 'auto_classify',
            reason: 'CV attachment + job application subject pattern',
            confidence: 90,
            detectedPosition: this.extractPosition(subject, body),
          };
        }
      }
    }

    // Strong signal: CV attachment + job application body patterns
    if (hasCvAttachment) {
      for (const pattern of JOB_APPLICATION_PATTERNS.bodyPatterns) {
        if (pattern.test(body)) {
          return {
            action: 'auto_classify',
            reason: 'CV attachment + job application body pattern',
            confidence: 85,
            detectedPosition: this.extractPosition(subject, body),
          };
        }
      }
    }

    // Check for CV attachment with CV-like filename
    if (hasCvAttachment) {
      const cvNamedAttachment = attachments.some((att) => {
        const filename = att.filename.toLowerCase();
        return JOB_APPLICATION_PATTERNS.cvAttachmentPatterns.some((pattern) =>
          pattern.test(filename),
        );
      });

      if (cvNamedAttachment) {
        // CV attachment with CV-like name, likely a job application
        return {
          action: 'auto_classify',
          reason: 'CV attachment with CV-like filename',
          confidence: 80,
          detectedPosition: this.extractPosition(subject, body),
        };
      }
    }

    return null;
  }

  /**
   * Check if email has CV attachment
   */
  private hasCvAttachment(
    attachments: Array<{ filename: string; mimeType: string }>,
  ): boolean {
    return attachments.some((att) => {
      const ext = att.filename
        .toLowerCase()
        .slice(att.filename.lastIndexOf('.'));
      return (
        CV_FILE_EXTENSIONS.includes(ext) || CV_MIME_TYPES.includes(att.mimeType)
      );
    });
  }

  /**
   * Check if text contains job-related keywords
   */
  private hasJobKeywords(subject: string, body: string): boolean {
    const text = `${subject} ${body}`.toLowerCase();

    const jobKeywords = [
      'job',
      'position',
      'role',
      'vacancy',
      'opening',
      'application',
      'applying',
      'apply',
      'candidate',
      'cv',
      'resume',
      'curriculum vitae',
      'hiring',
      'recruitment',
      'opportunity',
    ];

    return jobKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Try to extract position from subject/body
   */
  private extractPosition(subject: string, body: string): string | null {
    const text = `${subject} ${body}`;

    // Common patterns for position extraction
    const positionPatterns = [
      /(?:application|applying|apply)\s+(?:for|to)\s+(?:the\s+)?(?:position\s+(?:of\s+)?)?([^.,\n]+)/i,
      /(?:position|role|job)\s*(?:of|:)?\s*([^.,\n]+)/i,
      /interested\s+in\s+(?:the\s+)?([^.,\n]+)\s+(?:position|role|job)/i,
    ];

    for (const pattern of positionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const position = match[1].trim();
        // Clean up and validate
        if (position.length > 3 && position.length < 100) {
          return position;
        }
      }
    }

    return null;
  }

  /**
   * Check if prefilter is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if auto-classify is enabled
   */
  isAutoClassifyEnabled(): boolean {
    return this.autoClassifyEnabled;
  }
}
