import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  QueryEmailTemplatesDto,
  EmailTemplateType,
} from './dto';

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEmailTemplateDto, companyId: string) {
    // If setting as default, unset any existing default for this type within the company
    if (dto.isDefault) {
      await this.prisma.emailTemplate.updateMany({
        where: { type: dto.type, isDefault: true, companyId },
        data: { isDefault: false },
      });
    }

    const template = await this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        body: dto.body,
        type: dto.type,
        isDefault: dto.isDefault ?? false,
        companyId,
      },
    });

    return template;
  }

  async findAll(query: QueryEmailTemplatesDto, companyId: string) {
    const templates = await this.prisma.emailTemplate.findMany({
      where: {
        companyId,
        ...(query.type && { type: query.type }),
      },
      orderBy: [{ isDefault: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    });

    return templates;
  }

  async findOne(id: string, companyId: string) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, companyId },
    });

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return template;
  }

  async findDefaultByType(type: EmailTemplateType, companyId: string) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { type, isDefault: true, companyId },
    });

    return template;
  }

  async update(id: string, dto: UpdateEmailTemplateDto, companyId: string) {
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Email template not found');
    }

    // If setting as default, unset any existing default for this type within the company
    const typeToCheck = dto.type || existing.type;
    if (dto.isDefault) {
      await this.prisma.emailTemplate.updateMany({
        where: {
          type: typeToCheck,
          isDefault: true,
          companyId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const template = await this.prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });

    return template;
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Email template not found');
    }

    await this.prisma.emailTemplate.delete({
      where: { id },
    });

    return { message: 'Email template deleted successfully' };
  }

  /**
   * Seed default email templates for a company
   */
  async seedDefaults(companyId: string) {
    const defaultTemplates = [
      // Rejection templates
      {
        name: 'Professional Rejection',
        subject: 'Update on your application for {{job_title}}',
        body: `Dear {{candidate_name}},

Thank you for taking the time to apply for the {{job_title}} position at {{company_name}} and for your interest in joining our team.

After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

We genuinely appreciate your interest in {{company_name}} and encourage you to apply for future openings that match your skills and experience.

We wish you the best in your job search and future career endeavors.

Best regards,
{{sender_name}}
{{company_name}}`,
        type: EmailTemplateType.REJECTION,
        isDefault: true,
      },
      {
        name: 'Soft Rejection',
        subject: 'Thank you for applying to {{company_name}}',
        body: `Hi {{candidate_first_name}},

Thank you for your interest in the {{job_title}} role at {{company_name}}.

We've had an overwhelming response to this position and have had to make some difficult decisions. Unfortunately, we won't be moving forward with your application at this time.

However, we were impressed by your background and would love to keep your information on file for future opportunities that might be a better fit.

Thank you again for considering {{company_name}}, and we wish you all the best in your career journey.

Warm regards,
{{sender_name}}`,
        type: EmailTemplateType.REJECTION,
        isDefault: false,
      },
      // Interview invite templates
      {
        name: 'Interview Invitation',
        subject: 'Interview Invitation - {{job_title}} at {{company_name}}',
        body: `Dear {{candidate_name}},

We were impressed with your application for the {{job_title}} position at {{company_name}}, and we would like to invite you for an interview.

We believe your skills and experience could be a great fit for our team, and we're excited to learn more about you.

Please reply to this email with your availability for the coming week, and we'll schedule a time that works best.

If you have any questions before the interview, please don't hesitate to reach out.

We look forward to speaking with you!

Best regards,
{{sender_name}}
{{company_name}}`,
        type: EmailTemplateType.INTERVIEW_INVITE,
        isDefault: true,
      },
      // Follow-up templates
      {
        name: 'Post-Interview Follow-up',
        subject: 'Thank you for interviewing with {{company_name}}',
        body: `Dear {{candidate_name}},

Thank you for taking the time to interview for the {{job_title}} position at {{company_name}}. It was a pleasure learning more about your experience and career goals.

We are currently in the process of reviewing all candidates and will be in touch soon with an update on the next steps.

In the meantime, if you have any questions, please feel free to reach out.

Thank you again for your interest in joining our team.

Best regards,
{{sender_name}}
{{company_name}}`,
        type: EmailTemplateType.FOLLOW_UP,
        isDefault: true,
      },
      {
        name: 'Application Received Confirmation',
        subject: 'Application Received - {{job_title}} at {{company_name}}',
        body: `Dear {{candidate_name}},

Thank you for applying for the {{job_title}} position at {{company_name}}. We have received your application and our team is currently reviewing it.

We appreciate your interest in joining our team and will be in touch if your qualifications match our requirements.

Due to the volume of applications we receive, we may not be able to respond to everyone individually, but please know that your application is being carefully considered.

Best regards,
The {{company_name}} Team`,
        type: EmailTemplateType.FOLLOW_UP,
        isDefault: false,
      },
      // Offer template
      {
        name: 'Job Offer',
        subject: 'Job Offer - {{job_title}} at {{company_name}}',
        body: `Dear {{candidate_name}},

We are delighted to extend an offer for the position of {{job_title}} at {{company_name}}!

After careful consideration of all candidates, we believe your skills, experience, and enthusiasm make you an excellent fit for our team.

The formal offer letter with complete details regarding compensation, benefits, and start date will follow shortly. In the meantime, please feel free to reach out if you have any questions.

We are excited about the possibility of you joining our team and look forward to your response.

Congratulations!

Best regards,
{{sender_name}}
{{company_name}}`,
        type: EmailTemplateType.OFFER,
        isDefault: true,
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const template of defaultTemplates) {
      // Check if a template with same name and type already exists for this company
      const existing = await this.prisma.emailTemplate.findFirst({
        where: { name: template.name, type: template.type, companyId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // If this is a default template, unset any existing defaults for this type within the company
      if (template.isDefault) {
        await this.prisma.emailTemplate.updateMany({
          where: { type: template.type, isDefault: true, companyId },
          data: { isDefault: false },
        });
      }

      await this.prisma.emailTemplate.create({
        data: { ...template, companyId },
      });
      created++;
    }

    this.logger.log(
      `Seeded email templates for company ${companyId}: ${created} created, ${skipped} skipped`,
    );

    return {
      message: `Successfully seeded email templates`,
      created,
      skipped,
    };
  }

  /**
   * Get available personalization tokens
   */
  getAvailableTokens() {
    return [
      {
        token: '{{candidate_name}}',
        description: 'Full name of the candidate',
      },
      {
        token: '{{candidate_first_name}}',
        description: 'First name of the candidate',
      },
      {
        token: '{{candidate_email}}',
        description: 'Email address of the candidate',
      },
      { token: '{{job_title}}', description: 'Title of the job position' },
      { token: '{{company_name}}', description: 'Name of your company' },
      {
        token: '{{sender_name}}',
        description: 'Full name of the person sending the email',
      },
    ];
  }
}
