import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

const sesSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({
    send: sesSend,
  })),
  SendEmailCommand: jest.fn().mockImplementation((input) => input),
}));

import { EmailSendingService } from './email-sending.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { TemplateEngineService } from './template-engine.service';
import { BillingService } from '../billing/billing.service';
import { CandidateSelectionService } from '../candidates/selection/candidate-selection.service';
import { ScheduledEmailsService } from './scheduled-emails.service';

describe('EmailSendingService', () => {
  let service: EmailSendingService;
  let prisma: any;
  let templates: { findOne: jest.Mock; findDefaultByType: jest.Mock };
  let templateEngine: { render: jest.Mock };
  let billing: { trackUsage: jest.Mock };
  let candidateSelection: { resolveIds: jest.Mock };
  let scheduledEmails: { schedule: jest.Mock };

  const companyId = 'comp-1';
  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      company: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      emailSent: { create: jest.fn().mockResolvedValue({}) },
      candidateAction: { create: jest.fn().mockResolvedValue({}) },
    };
    templates = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tpl-1',
        name: 'Rejection',
        subject: 'Update for {{candidate_name}}',
        body: 'Hello {{candidate_name}}',
      }),
      findDefaultByType: jest.fn().mockResolvedValue({
        id: 'tpl-welcome',
        name: 'Welcome to the Team',
        subject: 'Welcome {{candidate_name}}',
        body: 'Hi {{candidate_name}}, you start {{start_date}}',
      }),
    };
    templateEngine = {
      render: jest.fn((template: string) =>
        template.replace('{{candidate_name}}', 'Jane Doe'),
      ),
    };
    billing = { trackUsage: jest.fn().mockResolvedValue(undefined) };
    candidateSelection = {
      resolveIds: jest.fn((_companyId: string, dto: any) =>
        Promise.resolve(dto.candidateIds),
      ),
    };
    scheduledEmails = {
      schedule: jest.fn((rows: unknown[]) => Promise.resolve(rows.length)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
        { provide: EmailTemplatesService, useValue: templates },
        { provide: TemplateEngineService, useValue: templateEngine },
        { provide: BillingService, useValue: billing },
        { provide: CandidateSelectionService, useValue: candidateSelection },
        { provide: ScheduledEmailsService, useValue: scheduledEmails },
      ],
    }).compile();

    service = module.get(EmailSendingService);
  });

  describe('sendEmail', () => {
    it('throws when candidate is missing', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(
        service.sendEmail(
          { candidateId: 'c1', templateId: 'tpl-1' },
          userId,
          companyId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when candidate has no email', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: null,
      });

      await expect(
        service.sendEmail(
          { candidateId: 'c1', templateId: 'tpl-1' },
          userId,
          companyId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('renders template and records sent email in dev mode', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        job: { title: 'Engineer' },
      });
      prisma.company.findUnique.mockResolvedValue({ id: companyId, name: 'Acme' });
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        firstName: 'Rec',
        lastName: 'Ruiter',
      });

      const result = await service.sendEmail(
        { candidateId: 'c1', templateId: 'tpl-1' },
        userId,
        companyId,
      );

      expect(result.success).toBe(true);
      expect(result.candidateEmail).toBe('jane@example.com');
      expect(prisma.emailSent.create).toHaveBeenCalled();
      expect(billing.trackUsage).toHaveBeenCalledWith(companyId, 'EMAIL_SENT');
    });
  });

  describe('sendWelcomeEmail', () => {
    const candidate = {
      id: 'c1',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      job: { title: 'Engineer' },
    };

    it('returns null when candidate is missing', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      const result = await service.sendWelcomeEmail('c1', companyId);

      expect(result).toBeNull();
    });

    it('returns null when candidate has no startDate', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ ...candidate, startDate: null });

      const result = await service.sendWelcomeEmail('c1', companyId);

      expect(result).toBeNull();
      expect(templates.findDefaultByType).not.toHaveBeenCalled();
    });

    it('returns null and skips sending when no default WELCOME template is configured', async () => {
      prisma.candidate.findFirst.mockResolvedValue(candidate);
      templates.findDefaultByType.mockResolvedValue(null);

      const result = await service.sendWelcomeEmail('c1', companyId);

      expect(result).toBeNull();
      expect(prisma.emailSent.create).not.toHaveBeenCalled();
    });

    it('renders the welcome template, sends, and marks welcomeEmailSentAt with no acting user', async () => {
      prisma.candidate.findFirst.mockResolvedValue(candidate);
      prisma.company.findUnique.mockResolvedValue({ id: companyId, name: 'Acme' });

      const result = await service.sendWelcomeEmail('c1', companyId);

      expect(result?.success).toBe(true);
      expect(prisma.emailSent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ candidateId: 'c1', sentById: null }),
      });
      expect(prisma.candidateAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 'c1',
          userId: null,
          action: 'welcome_email_sent',
        }),
      });
      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { welcomeEmailSentAt: expect.any(Date) },
      });
      expect(billing.trackUsage).toHaveBeenCalledWith(companyId, 'EMAIL_SENT');
    });
  });

  describe('bulkSendEmails', () => {
    it('throws when no candidates found', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);

      await expect(
        service.bulkSendEmails(
          { candidateIds: ['c1'], templateId: 'tpl-1' },
          userId,
          companyId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves a filter selection through CandidateSelectionService', async () => {
      candidateSelection.resolveIds.mockResolvedValue(['c1']);
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', fullName: 'Jane Doe', email: 'jane@example.com', job: null },
      ]);
      prisma.company.findUnique.mockResolvedValue({ id: companyId, name: 'Acme' });
      prisma.user.findUnique.mockResolvedValue({ id: userId, firstName: 'R', lastName: 'R' });

      const dto = { filter: 'status=NEW', templateId: 'tpl-1' };
      const result = await service.bulkSendEmails(dto, userId, companyId);

      expect(candidateSelection.resolveIds).toHaveBeenCalledWith(companyId, dto);
      expect(prisma.candidate.findMany.mock.calls[0][0].where.id.in).toEqual(['c1']);
      expect(result).toMatchObject({ total: 1, successful: 1, queued: 0 });
    });

    it('queues large selections as scheduled emails instead of sending inline', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `c${i}`);
      candidateSelection.resolveIds.mockResolvedValue(ids);
      prisma.candidate.findMany.mockResolvedValue(
        ids.slice(0, 140).map((id) => ({ id })),
      );

      const result = await service.bulkSendEmails(
        { filter: 'status=NEW', templateId: 'tpl-1', subjectOverride: 'Hi' },
        userId,
        companyId,
      );

      expect(prisma.emailSent.create).not.toHaveBeenCalled();
      const rows = scheduledEmails.schedule.mock.calls[0][0];
      expect(rows).toHaveLength(140);
      expect(rows[0]).toMatchObject({
        companyId,
        candidateId: 'c0',
        templateId: 'tpl-1',
        subjectOverride: 'Hi',
        purpose: 'bulk',
        createdById: userId,
      });
      expect(result).toEqual({
        total: 150,
        successful: 0,
        failed: 10,
        queued: 140,
        results: [],
      });
    });
  });

  describe('sendTemplateToCandidate', () => {
    it('sends as the company when there is no sender user', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        job: null,
      });
      prisma.company.findUnique.mockResolvedValue({ id: companyId, name: 'Acme' });

      const result = await service.sendTemplateToCandidate({
        candidateId: 'c1',
        companyId,
        templateId: 'tpl-1',
        senderUserId: null,
        actionDetails: { scheduledEmailId: 'se-1', purpose: 'rejection' },
      });

      expect(result.success).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(templateEngine.render.mock.calls[0][1]).not.toHaveProperty('sender');
      expect(prisma.emailSent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ candidateId: 'c1', sentById: null }),
      });
      expect(prisma.candidateAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          action: 'email_sent',
          details: expect.objectContaining({
            templateId: 'tpl-1',
            scheduledEmailId: 'se-1',
            purpose: 'rejection',
          }),
        }),
      });
    });

    it('404s when the sending user no longer exists', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        job: null,
      });
      prisma.company.findUnique.mockResolvedValue({ id: companyId, name: 'Acme' });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.sendTemplateToCandidate({
          candidateId: 'c1',
          companyId,
          templateId: 'tpl-1',
          senderUserId: 'gone',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sendCustom', () => {
    it('returns success in dev mode', async () => {
      const result = await service.sendCustom(
        'jane@example.com',
        'Subject',
        '<p>Hi</p>',
        'Hi',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('sendWithCalendar CRLF sanitization', () => {
    let configuredService: EmailSendingService;

    beforeEach(async () => {
      sesSend.mockClear();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailSendingService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) =>
                ({
                  'ses.region': 'eu-central-1',
                  'ses.accessKeyId': 'test-key',
                  'ses.secretAccessKey': 'test-secret',
                  'ses.fromEmail': 'noreply@recdesk.io',
                })[key],
            },
          },
          { provide: EmailTemplatesService, useValue: templates },
          { provide: TemplateEngineService, useValue: templateEngine },
          { provide: BillingService, useValue: billing },
          { provide: CandidateSelectionService, useValue: candidateSelection },
          { provide: ScheduledEmailsService, useValue: scheduledEmails },
        ],
      }).compile();

      configuredService = module.get(EmailSendingService);
    });

    it('strips CRLF from an injected subject before building the raw MIME message', async () => {
      await configuredService.sendWithCalendar(
        'candidate@example.com',
        'Interview booked\r\nBcc: attacker@evil.com',
        '<p>Hi</p>',
        'Hi',
        { content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR', method: 'REQUEST' },
      );

      expect(sesSend).toHaveBeenCalledTimes(1);
      const raw = (sesSend.mock.calls[0][0] as any).Content.Raw.Data.toString(
        'utf-8',
      );
      const headerLines = raw.split('\r\n\r\n')[0].split('\r\n');
      // The injected CRLF must not have produced a standalone "Bcc:" header line —
      // it should have been stripped, leaving harmless trailing text on the Subject line.
      expect(headerLines.some((l: string) => /^Bcc:/i.test(l))).toBe(false);
      expect(headerLines).toContain(
        'Subject: Interview bookedBcc: attacker@evil.com',
      );
    });

    it('strips CRLF from an injected recipient before building the raw MIME message', async () => {
      await configuredService.sendWithCalendar(
        'candidate@example.com\r\nBcc: attacker@evil.com',
        'Interview booked',
        '<p>Hi</p>',
        'Hi',
        { content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR', method: 'REQUEST' },
      );

      expect(sesSend).toHaveBeenCalledTimes(1);
      const raw = (sesSend.mock.calls[0][0] as any).Content.Raw.Data.toString(
        'utf-8',
      );
      const headerLines = raw.split('\r\n\r\n')[0].split('\r\n');
      expect(headerLines.some((l: string) => /^Bcc:/i.test(l))).toBe(false);
      expect(headerLines).toContain(
        'To: candidate@example.comBcc: attacker@evil.com',
      );
    });
  });
});
