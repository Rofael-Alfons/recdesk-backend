import { Test, TestingModule } from '@nestjs/testing';
import { UsageType } from '@prisma/client';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { EmailProcessingService } from './email-processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { EmailPrefilterService } from './email-prefilter.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { StorageService } from '../storage/storage.service';

describe('EmailProcessingService', () => {
  let service: EmailProcessingService;
  let prisma: any;
  let prefilter: { prefilterEmail: jest.Mock };
  let aiService: { classifyEmail: jest.Mock; parseCV: jest.Mock };
  let billingService: { trackUsage: jest.Mock };

  const connection = {
    id: 'conn-1',
    email: 'jobs@acme.com',
    companyId: 'comp-1',
    autoImport: true,
    company: { domain: 'acme.com' },
  };

  const baseEmail = {
    messageId: 'msg-1',
    subject: 'Application for Engineer',
    senderEmail: 'jane@example.com',
    senderName: 'Jane Doe',
    bodyText: 'Please find my CV attached.',
    bodyHtml: '',
    receivedAt: new Date(),
    headers: {},
    attachments: [],
    isInbox: true,
  };

  beforeEach(async () => {
    prisma = {
      emailImport: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'import-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      job: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prefilter = {
      prefilterEmail: jest.fn().mockReturnValue({
        action: 'needs_ai',
        reason: 'Requires AI',
      }),
    };
    aiService = {
      classifyEmail: jest.fn().mockResolvedValue({
        isJobApplication: false,
        confidence: 40,
        detectedPosition: null,
      }),
      parseCV: jest.fn(),
    };
    billingService = { trackUsage: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        {
          provide: FileProcessingService,
          useValue: { extractText: jest.fn() },
        },
        { provide: EmailPrefilterService, useValue: prefilter },
        {
          provide: NotificationsService,
          useValue: { createNotification: jest.fn() },
        },
        { provide: BillingService, useValue: billingService },
        {
          provide: StorageService,
          useValue: { uploadFile: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EmailProcessingService);
  });

  it('skips emails not in inbox', async () => {
    const result = await service.processNormalizedEmail(
      { ...baseEmail, isInbox: false },
      connection,
    );

    expect(result.imported).toBe(false);
    expect(prisma.emailImport.create).not.toHaveBeenCalled();
  });

  it('skips already processed messages', async () => {
    prisma.emailImport.findUnique.mockResolvedValue({ id: 'existing' });

    const result = await service.processNormalizedEmail(baseEmail, connection);

    expect(result.imported).toBe(false);
  });

  it('skips emails sent by the connected account', async () => {
    const result = await service.processNormalizedEmail(
      { ...baseEmail, senderEmail: connection.email },
      connection,
    );

    expect(result.imported).toBe(false);
  });

  it('creates SKIPPED import when prefilter says skip', async () => {
    prefilter.prefilterEmail.mockReturnValue({
      action: 'skip',
      reason: 'Newsletter',
    });

    const result = await service.processNormalizedEmail(baseEmail, connection);

    expect(result.imported).toBe(false);
    expect(prisma.emailImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'SKIPPED',
        skipReason: 'Newsletter',
      }),
    });
  });

  it('uses AI classification and tracks usage when prefilter is uncertain', async () => {
    await service.processNormalizedEmail(baseEmail, connection);

    expect(aiService.classifyEmail).toHaveBeenCalled();
    expect(billingService.trackUsage).toHaveBeenCalledWith(
      connection.companyId,
      UsageType.AI_PARSING_CALL,
    );
  });

  it('auto-classifies without AI when prefilter is confident', async () => {
    prefilter.prefilterEmail.mockReturnValue({
      action: 'auto_classify',
      reason: 'CV + subject',
      confidence: 90,
      detectedPosition: 'Engineer',
    });

    await service.processNormalizedEmail(baseEmail, connection);

    expect(aiService.classifyEmail).not.toHaveBeenCalled();
    expect(prisma.emailImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isJobApplication: true,
        confidence: 90,
      }),
    });
  });
});
