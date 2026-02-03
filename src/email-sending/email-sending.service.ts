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
import sgMail from '@sendgrid/mail';

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

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailTemplatesService: EmailTemplatesService,
    private templateEngine: TemplateEngineService,
    private billingService: BillingService,
  ) {
    const apiKey = this.configService.get<string>('sendgrid.apiKey');
    this.fromEmail =
      this.configService.get<string>('sendgrid.fromEmail') ||
      'noreply@recdesk.io';

    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      this.logger.log('SendGrid configured successfully');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'SendGrid API key not configured - emails will be logged only',
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
   * Send email via SendGrid or log if not configured
   */
  private async sendViaProvider(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      // Log email for development
      this.logger.log(`[DEV MODE] Email would be sent to: ${to}`);
      this.logger.log(`[DEV MODE] Subject: ${subject}`);
      this.logger.debug(`[DEV MODE] Body: ${body.substring(0, 200)}...`);
      return { success: true };
    }

    try {
      await sgMail.send({
        to,
        from: this.fromEmail,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
      });

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
