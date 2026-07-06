import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import {
  TemplateEngineService,
  PersonalizationContext,
} from './template-engine.service';
import { BillingService } from '../billing/billing.service';
import { SendEmailDto, BulkSendEmailDto, PreviewEmailDto } from './dto';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface CalendarAttachment {
  /** Raw .ics file content */
  content: string;
  /** iCalendar METHOD, mirrored on the inline calendar part */
  method: 'REQUEST' | 'CANCEL';
  /** Attachment filename */
  filename?: string;
}

export interface SendResult {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class EmailSendingService {
  private readonly logger = new Logger(EmailSendingService.name);
  private readonly fromEmail: string;
  private readonly isConfigured: boolean;
  private readonly sesClient?: SESv2Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailTemplatesService: EmailTemplatesService,
    private templateEngine: TemplateEngineService,
    private billingService: BillingService,
  ) {
    const region = this.configService.get<string>('ses.region');
    const accessKeyId = this.configService.get<string>('ses.accessKeyId');
    const secretAccessKey = this.configService.get<string>(
      'ses.secretAccessKey',
    );
    this.fromEmail =
      this.configService.get<string>('ses.fromEmail') || 'noreply@recdesk.io';

    if (region && accessKeyId && secretAccessKey) {
      this.sesClient = new SESv2Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.isConfigured = true;
      this.logger.log('AWS SES configured successfully');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'AWS SES not configured - emails will be logged only',
      );
    }
  }

  /**
   * Send a single email to a candidate
   */
  async sendEmail(
    dto: SendEmailDto,
    userId: string,
    companyId: string,
  ): Promise<SendResult> {
    // Get candidate with job info
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, companyId },
      include: { job: { select: { title: true } } },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    if (!candidate.email) {
      throw new BadRequestException('Candidate does not have an email address');
    }

    // Get template (scoped to company)
    const template = await this.emailTemplatesService.findOne(
      dto.templateId,
      companyId,
    );

    // Get company and user info
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!company || !user) {
      throw new NotFoundException('Company or user not found');
    }

    // Build personalization context
    const context: PersonalizationContext = {
      candidate: {
        fullName: candidate.fullName,
        email: candidate.email,
      },
      job: candidate.job,
      company: { name: company.name },
      sender: { firstName: user.firstName, lastName: user.lastName },
    };

    // Render template
    const subject = this.templateEngine.render(
      dto.subjectOverride || template.subject,
      context,
    );
    const body = this.templateEngine.render(template.body, context);

    // Send email
    const result = await this.sendViaProvider(candidate.email, subject, body);

    if (result.success) {
      // Record sent email
      await this.prisma.emailSent.create({
        data: {
          subject,
          body,
          candidateId: candidate.id,
          sentById: userId,
        },
      });

      // Track usage
      await this.billingService.trackUsage(companyId, 'EMAIL_SENT');

      // Log action
      await this.prisma.candidateAction.create({
        data: {
          candidateId: candidate.id,
          userId,
          action: 'email_sent',
          details: {
            templateId: template.id,
            templateName: template.name,
            subject,
          },
        },
      });
    }

    return {
      candidateId: candidate.id,
      candidateName: candidate.fullName,
      candidateEmail: candidate.email,
      ...result,
    };
  }

  /**
   * Send bulk emails to multiple candidates
   */
  async bulkSendEmails(
    dto: BulkSendEmailDto,
    userId: string,
    companyId: string,
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: SendResult[];
  }> {
    // Get template (scoped to company)
    const template = await this.emailTemplatesService.findOne(
      dto.templateId,
      companyId,
    );

    // Get candidates with job info
    const candidates = await this.prisma.candidate.findMany({
      where: {
        id: { in: dto.candidateIds },
        companyId,
      },
      include: { job: { select: { title: true } } },
    });

    if (candidates.length === 0) {
      throw new NotFoundException('No candidates found');
    }

    // Get company and user info
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!company || !user) {
      throw new NotFoundException('Company or user not found');
    }

    const results: SendResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process each candidate
    for (const candidate of candidates) {
      if (!candidate.email) {
        results.push({
          candidateId: candidate.id,
          candidateName: candidate.fullName,
          candidateEmail: '',
          success: false,
          error: 'No email address',
        });
        failed++;
        continue;
      }

      // Build personalization context
      const context: PersonalizationContext = {
        candidate: {
          fullName: candidate.fullName,
          email: candidate.email,
        },
        job: candidate.job,
        company: { name: company.name },
        sender: { firstName: user.firstName, lastName: user.lastName },
      };

      // Render template
      const subject = this.templateEngine.render(
        dto.subjectOverride || template.subject,
        context,
      );
      const body = this.templateEngine.render(template.body, context);

      // Send email
      const result = await this.sendViaProvider(candidate.email, subject, body);

      if (result.success) {
        successful++;

        // Record sent email
        await this.prisma.emailSent.create({
          data: {
            subject,
            body,
            candidateId: candidate.id,
            sentById: userId,
          },
        });

        // Track usage
        await this.billingService.trackUsage(companyId, 'EMAIL_SENT');

        // Log action
        await this.prisma.candidateAction.create({
          data: {
            candidateId: candidate.id,
            userId,
            action: 'email_sent',
            details: {
              templateId: template.id,
              templateName: template.name,
              subject,
              bulkSend: true,
            },
          },
        });
      } else {
        failed++;
      }

      results.push({
        candidateId: candidate.id,
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        ...result,
      });
    }

    this.logger.log(
      `Bulk email sent: ${successful} successful, ${failed} failed out of ${candidates.length}`,
    );

    return {
      total: candidates.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Preview an email with personalization
   */
  async previewEmail(
    dto: PreviewEmailDto,
    companyId: string,
    userId: string,
  ): Promise<{ subject: string; body: string; tokens: string[] }> {
    // Get template (scoped to company)
    const template = await this.emailTemplatesService.findOne(
      dto.templateId,
      companyId,
    );

    let context: PersonalizationContext;

    if (dto.candidateId) {
      // Use real candidate data
      const candidate = await this.prisma.candidate.findFirst({
        where: { id: dto.candidateId, companyId },
        include: { job: { select: { title: true } } },
      });

      if (!candidate) {
        throw new NotFoundException('Candidate not found');
      }

      const [company, user] = await Promise.all([
        this.prisma.company.findUnique({ where: { id: companyId } }),
        this.prisma.user.findUnique({ where: { id: userId } }),
      ]);

      context = {
        candidate: {
          fullName: candidate.fullName,
          email: candidate.email,
        },
        job: candidate.job,
        company: { name: company?.name || 'Your Company' },
        sender: {
          firstName: user?.firstName || 'Your',
          lastName: user?.lastName || 'Name',
        },
      };
    } else {
      // Use sample data
      const [company, user] = await Promise.all([
        this.prisma.company.findUnique({ where: { id: companyId } }),
        this.prisma.user.findUnique({ where: { id: userId } }),
      ]);

      context = {
        ...this.templateEngine.createSampleContext(),
        company: { name: company?.name || 'Your Company' },
        sender: {
          firstName: user?.firstName || 'Your',
          lastName: user?.lastName || 'Name',
        },
      };
    }

    const subject = this.templateEngine.render(template.subject, context);
    const body = this.templateEngine.render(template.body, context);
    const tokens = this.templateEngine.extractTokens(
      template.subject + template.body,
    );

    return { subject, body, tokens };
  }

  /**
   * Get sent emails history
   */
  async getSentEmails(
    companyId: string,
    options: {
      candidateId?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { candidateId, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      candidate: { companyId },
      ...(candidateId && { candidateId }),
    };

    const [emails, total] = await Promise.all([
      this.prisma.emailSent.findMany({
        where,
        include: {
          candidate: {
            select: { id: true, fullName: true, email: true },
          },
          sentBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailSent.count({ where }),
    ]);

    return {
      data: emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Send a custom HTML/text email (not tied to a candidate template).
   * Used by interview scheduling for booking invites.
   */
  async sendCustom(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured || !this.sesClient) {
      this.logger.log(`[DEV MODE] Custom email would be sent to: ${to}`);
      this.logger.log(`[DEV MODE] Subject: ${subject}`);
      return { success: true };
    }

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: `RecDesk <${this.fromEmail}>`,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: text, Charset: 'UTF-8' },
                Html: { Data: html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      this.logger.log(`Custom email sent successfully to: ${to}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send custom email to ${to}: ${error.message}`);
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  /**
   * Send an email with an .ics calendar invite attached. Uses a raw MIME
   * message (Content.Raw) because SESv2 Simple content cannot carry
   * attachments. The invite is included both as an inline text/calendar part
   * (so Gmail/Outlook render "Add to calendar") and as an attachment fallback.
   */
  async sendWithCalendar(
    to: string,
    subject: string,
    html: string,
    text: string,
    calendar: CalendarAttachment,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured || !this.sesClient) {
      this.logger.log(`[DEV MODE] Calendar email would be sent to: ${to}`);
      this.logger.log(`[DEV MODE] Subject: ${subject}`);
      return { success: true };
    }

    try {
      const raw = this.buildCalendarMime(to, subject, html, text, calendar);
      await this.sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: `RecDesk <${this.fromEmail}>`,
          Destination: { ToAddresses: [to] },
          Content: { Raw: { Data: Buffer.from(raw, 'utf-8') } },
        }),
      );
      this.logger.log(`Calendar email sent successfully to: ${to}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to send calendar email to ${to}: ${error.message}`,
      );
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  /** Encode a header value as RFC 2047 base64 if it contains non-ASCII. */
  private encodeHeader(value: string): string {
    // Strip CR/LF and other control chars to prevent header injection —
    // these have no legitimate purpose in a header value.
    // eslint-disable-next-line no-control-regex
    const sanitized = value.replace(/[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]*$/.test(sanitized)) return sanitized;
    return `=?UTF-8?B?${Buffer.from(sanitized, 'utf-8').toString('base64')}?=`;
  }

  /** Base64-encode content wrapped at 76 columns for MIME bodies. */
  private base64Wrapped(value: string): string {
    const b64 = Buffer.from(value, 'utf-8').toString('base64');
    return b64.replace(/(.{76})/g, '$1\r\n');
  }

  private buildCalendarMime(
    to: string,
    subject: string,
    html: string,
    text: string,
    calendar: CalendarAttachment,
  ): string {
    const rand = Math.random().toString(36).slice(2);
    const mixed = `mixed_${rand}`;
    const alt = `alt_${rand}`;
    const filename = calendar.filename || 'invite.ics';

    return [
      `From: RecDesk <${this.fromEmail}>`,
      `To: ${this.encodeHeader(to)}`,
      `Subject: ${this.encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      '',
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      '',
      `--${alt}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      this.base64Wrapped(text),
      '',
      `--${alt}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      this.base64Wrapped(html),
      '',
      `--${alt}`,
      `Content-Type: text/calendar; charset=UTF-8; method=${calendar.method}`,
      'Content-Transfer-Encoding: base64',
      '',
      this.base64Wrapped(calendar.content),
      '',
      `--${alt}--`,
      '',
      `--${mixed}`,
      `Content-Type: application/ics; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      this.base64Wrapped(calendar.content),
      '',
      `--${mixed}--`,
      '',
    ].join('\r\n');
  }

  /**
   * Send email via AWS SES or log if not configured
   */
  private async sendViaProvider(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured || !this.sesClient) {
      // Log email for development
      this.logger.log(`[DEV MODE] Email would be sent to: ${to}`);
      this.logger.log(`[DEV MODE] Subject: ${subject}`);
      this.logger.debug(`[DEV MODE] Body: ${body.substring(0, 200)}...`);
      return { success: true };
    }

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: this.fromEmail,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: body, Charset: 'UTF-8' },
                Html: {
                  Data: body.replace(/\n/g, '<br>'),
                  Charset: 'UTF-8',
                },
              },
            },
          },
        }),
      );

      this.logger.log(`Email sent successfully to: ${to}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }
}
