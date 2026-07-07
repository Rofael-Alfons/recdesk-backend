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
  let fileProcessingService: { extractText: jest.Mock };
  let storageService: { uploadFile: jest.Mock };

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
    fileProcessingService = {
      extractText: jest.fn().mockResolvedValue({
        text: 'Jane Doe\nExperience: 3 years',
        confidence: 80,
      }),
    };
    storageService = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'comp-1/cvs/file.pdf',
        url: 's3://bucket/comp-1/cvs/file.pdf',
        isLocal: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        {
          provide: FileProcessingService,
          useValue: fileProcessingService,
        },
        { provide: EmailPrefilterService, useValue: prefilter },
        {
          provide: NotificationsService,
          useValue: { createNotification: jest.fn() },
        },
        { provide: BillingService, useValue: billingService },
        {
          provide: StorageService,
          useValue: storageService,
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

  it('skips already processed messages when the resulting candidate still exists', async () => {
    prisma.emailImport.findUnique.mockResolvedValue({ id: 'existing-import' });
    // linkedCandidate check finds a live candidate tied to that import.
    prisma.candidate.findFirst.mockResolvedValueOnce({ id: 'live-candidate' });

    const result = await service.processNormalizedEmail(baseEmail, connection);

    expect(result.imported).toBe(false);
    expect(prisma.emailImport.create).not.toHaveBeenCalled();
    expect(prisma.emailImport.update).not.toHaveBeenCalled();
  });

  it('reprocesses a message whose prior import has no surviving candidate (e.g. deleted since)', async () => {
    prisma.emailImport.findUnique.mockResolvedValue({ id: 'existing-import' });
    prefilter.prefilterEmail.mockReturnValue({
      action: 'auto_classify',
      reason: 'CV + subject',
      confidence: 90,
      detectedPosition: 'Engineer',
    });
    prisma.emailImport.update.mockResolvedValue({ id: 'existing-import' });
    // No candidate found: neither the linkedCandidate check nor the
    // downstream duplicate check (createCandidateFromEmail, since baseEmail
    // has no attachments) turn up an existing row.
    prisma.candidate.findFirst.mockResolvedValue(null);

    const result = await service.processNormalizedEmail(baseEmail, connection);

    expect(result.imported).toBe(true);
    expect(prisma.emailImport.create).not.toHaveBeenCalled();
    expect(prisma.emailImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-import' },
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
    expect(prisma.candidate.create).toHaveBeenCalled();
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

  describe('processCvAttachment', () => {
    const emailImport = {
      id: 'import-1',
      senderEmail: 'jane@example.com',
      senderName: 'Jane Doe',
    };

    beforeEach(() => {
      aiService.parseCV.mockResolvedValue({
        personalInfo: { fullName: 'Jane Doe', email: 'jane@example.com' },
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
        summary: 'Strong engineer',
      });
    });

    it('skips AI parsing when sender email already matches an existing candidate', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      const created = await service.processCvAttachment(
        Buffer.from('cv'),
        'jane-doe.pdf',
        'application/pdf',
        emailImport,
        connection.companyId,
      );

      expect(created).toBe(false);
      expect(aiService.parseCV).not.toHaveBeenCalled();
      expect(prisma.candidate.create).not.toHaveBeenCalled();
      expect(billingService.trackUsage).not.toHaveBeenCalledWith(
        connection.companyId,
        UsageType.AI_PARSING_CALL,
      );
    });

    it('falls back to the AI-parsed email for duplicate detection when the sender email is new', async () => {
      // First call (pre-check by sender email) finds nothing; second call
      // (post-parse check by AI-parsed email) finds an existing candidate.
      prisma.candidate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });

      const created = await service.processCvAttachment(
        Buffer.from('cv'),
        'jane-doe.pdf',
        'application/pdf',
        emailImport,
        connection.companyId,
      );

      expect(created).toBe(false);
      expect(aiService.parseCV).toHaveBeenCalled();
      expect(prisma.candidate.create).not.toHaveBeenCalled();
    });

    it('creates a candidate when no duplicate exists', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      const created = await service.processCvAttachment(
        Buffer.from('cv'),
        'jane-doe.pdf',
        'application/pdf',
        emailImport,
        connection.companyId,
      );

      expect(created).toBe(true);
      expect(aiService.parseCV).toHaveBeenCalled();
      expect(prisma.candidate.create).toHaveBeenCalled();
    });
  });

  describe('processNormalizedEmail with CV attachment reprocessing', () => {
    it('marks the email import SKIPPED (not IMPORTED) when the candidate turns out to be a duplicate', async () => {
      prefilter.prefilterEmail.mockReturnValue({
        action: 'auto_classify',
        reason: 'CV + subject',
        confidence: 90,
        detectedPosition: 'Engineer',
      });
      prisma.emailImport.create.mockResolvedValue({ id: 'import-2' });
      prisma.emailImport.update.mockResolvedValue({ id: 'import-2' });
      // No live candidate for the messageId-dedup check (no prior import),
      // but createCandidateFromEmail's own duplicate check finds one.
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.processNormalizedEmail(baseEmail, connection);

      expect(result.imported).toBe(false);
      expect(prisma.candidate.create).not.toHaveBeenCalled();
      expect(prisma.emailImport.update).toHaveBeenCalledWith({
        where: { id: 'import-2' },
        data: expect.objectContaining({
          status: 'SKIPPED',
          skipReason: 'Duplicate candidate email',
        }),
      });
      expect(billingService.trackUsage).not.toHaveBeenCalledWith(
        connection.companyId,
        UsageType.EMAIL_IMPORTED,
      );
    });
  });
});
