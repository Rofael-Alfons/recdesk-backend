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

describe('EmailSendingService', () => {
  let service: EmailSendingService;
  let prisma: any;
  let templates: { findOne: jest.Mock };
  let templateEngine: { render: jest.Mock };
  let billing: { trackUsage: jest.Mock };

  const companyId = 'comp-1';
  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn(), findMany: jest.fn() },
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
    };
    templateEngine = {
      render: jest.fn((template: string) =>
        template.replace('{{candidate_name}}', 'Jane Doe'),
      ),
    };
    billing = { trackUsage: jest.fn().mockResolvedValue(undefined) };

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
