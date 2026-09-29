import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UsageType } from '@prisma/client';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { AiService } from '../ai/ai.service';
import { BillingService } from '../billing/billing.service';
import { StorageService } from '../storage/storage.service';

describe('UploadService', () => {
  let service: UploadService;
  let prisma: any;
  let fileProcessing: {
    validateFile: jest.Mock;
    extractText: jest.Mock;
  };
  let aiService: { parseCV: jest.Mock; scoreCandidate: jest.Mock };
  let billingService: { trackUsage: jest.Mock };
  let storageService: { uploadFile: jest.Mock };

  const companyId = 'comp-1';

  const makeFile = (
    name: string,
    content = 'cv content',
  ): Express.Multer.File =>
    ({
      originalname: name,
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from(content),
    }) as Express.Multer.File;

  beforeEach(async () => {
    prisma = {
      job: { findFirst: jest.fn() },
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
        findUnique: jest.fn(),
      },
      candidateScore: { create: jest.fn() },
    };
    fileProcessing = {
      validateFile: jest.fn().mockReturnValue({ valid: true }),
      extractText: jest.fn().mockResolvedValue({
        text: 'Jane Doe\nEmail: jane@example.com\nExperience: 3 years\nSkills: TypeScript\nEducation: CS degree',
        confidence: 80,
      }),
    };
    aiService = {
      parseCV: jest.fn().mockResolvedValue({
        personalInfo: {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: null,
          location: null,
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
        },
        education: [],
        experience: [],
        skills: ['TypeScript'],
        projects: [],
        certifications: [],
        languages: [],
        summary: 'Strong engineer',
      }),
      scoreCandidate: jest.fn().mockResolvedValue({
        overallScore: 85,
        skillsMatchScore: 90,
        experienceScore: 80,
        educationScore: 75,
        growthScore: 70,
        bonusScore: 65,
        recommendation: 'Recommended',
        scoreExplanation: {
          skillsMatch: 'Good',
          experience: 'Solid',
          education: 'OK',
          growth: 'Steady',
          bonus: 'None',
        },
      }),
    };
    billingService = { trackUsage: jest.fn().mockResolvedValue(undefined) };
    storageService = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'comp-1/cvs/file.pdf',
        url: 's3://bucket/comp-1/cvs/file.pdf',
        isLocal: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: FileProcessingService, useValue: fileProcessing },
        { provide: AiService, useValue: aiService },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: BillingService, useValue: billingService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get(UploadService);
  });

  describe('uploadBulkCVs', () => {
    it('rejects empty file list', async () => {
      await expect(service.uploadBulkCVs([], companyId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects more than 200 files', async () => {
      const files = Array.from({ length: 201 }, (_, i) =>
        makeFile(`cv-${i}.pdf`),
      );

      await expect(
        service.uploadBulkCVs(files, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid job id', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadBulkCVs([makeFile('jane-doe.pdf')], companyId, 'job-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('processes valid CV and tracks billing usage', async () => {
      const result = await service.uploadBulkCVs(
        [makeFile('jane-doe.pdf')],
        companyId,
      );

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].status).toBe('success');
      expect(billingService.trackUsage).toHaveBeenCalledWith(
        companyId,
        UsageType.AI_PARSING_CALL,
      );
      expect(billingService.trackUsage).toHaveBeenCalledWith(
        companyId,
        UsageType.CV_PROCESSED,
      );
    });

    it('returns failed result for invalid file', async () => {
      fileProcessing.validateFile.mockReturnValue({
        valid: false,
        error: 'Unsupported file type',
      });

      const result = await service.uploadBulkCVs(
        [makeFile('bad.txt')],
        companyId,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
    });

    it('returns failed result for low-confidence extraction', async () => {
      fileProcessing.extractText.mockResolvedValue({
        text: '',
        confidence: 0,
      });

      const result = await service.uploadBulkCVs(
        [makeFile('blank.pdf')],
        companyId,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toContain('Could not extract text');
    });

    it('returns failed result for duplicate email found in raw CV text, without calling AI', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.uploadBulkCVs(
        [makeFile('jane-doe.pdf')],
        companyId,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toContain('Duplicate');
      expect(aiService.parseCV).not.toHaveBeenCalled();
      expect(billingService.trackUsage).not.toHaveBeenCalledWith(
        companyId,
        UsageType.AI_PARSING_CALL,
      );
    });

    it('falls back to AI-parsed email for duplicate detection when the raw text has no email', async () => {
      fileProcessing.extractText.mockResolvedValue({
        text: 'Jane Doe\nExperience: 3 years\nSkills: TypeScript\nEducation: CS degree',
        confidence: 80,
      });
      // No duplicate on the pre-check (no email in raw text to look up);
      // duplicate only surfaces once the AI has parsed the email.
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.uploadBulkCVs(
        [makeFile('jane-doe.pdf')],
        companyId,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toContain('Duplicate');
      expect(aiService.parseCV).toHaveBeenCalled();
      expect(billingService.trackUsage).toHaveBeenCalledWith(
        companyId,
        UsageType.AI_PARSING_CALL,
      );
    });
  });

  describe('attribution', () => {
    it('keeps bulk-upload defaults when no attribution is given', async () => {
      await service.uploadBulkCVs([makeFile('jane-doe.pdf')], companyId);

      const data = prisma.candidate.create.mock.calls[0][0].data;
      expect(data.source).toBe('UPLOAD');
      expect(data.sourceChannel).toBe('BULK_UPLOAD');
      expect(data.referredByUserId).toBeUndefined();
      expect(data.referralCode).toBeUndefined();
    });
  });

  describe('uploadReferralCV', () => {
    const referral = {
      source: 'REFERRAL' as const,
      sourceChannel: 'REFERRAL' as const,
      referredByUserId: 'user-1',
      referralCode: 'abc123',
      fullName: '  Janet Referred ',
      email: 'Janet@Example.com',
      phone: '+20100',
    };

    it('applies referral attribution and submitter contact overrides', async () => {
      const result = await service.uploadReferralCV(
        makeFile('cv.pdf'),
        companyId,
        undefined,
        referral,
      );

      expect(result.status).toBe('success');
      const data = prisma.candidate.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        source: 'REFERRAL',
        sourceChannel: 'REFERRAL',
        referredByUserId: 'user-1',
        referralCode: 'abc123',
        fullName: 'Janet Referred',
        email: 'janet@example.com',
        phone: '+20100',
        companyId,
      });
    });

    it('rejects a duplicate submitted email before storing the file or calling AI', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.uploadReferralCV(
        makeFile('cv.pdf'),
        companyId,
        undefined,
        referral,
      );

      expect(result).toMatchObject({ status: 'failed', duplicate: true });
      expect(prisma.candidate.findFirst).toHaveBeenCalledWith({
        where: { companyId, email: 'janet@example.com' },
      });
      expect(storageService.uploadFile).not.toHaveBeenCalled();
      expect(aiService.parseCV).not.toHaveBeenCalled();
      expect(prisma.candidate.create).not.toHaveBeenCalled();
    });

    it('does not reject on the CV email when the submitter gave a different one', async () => {
      // Only the submitted email is checked; the CV's own email is ignored.
      prisma.candidate.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.email === 'jane@example.com' ? { id: 'x' } : null),
      );

      const result = await service.uploadReferralCV(
        makeFile('cv.pdf'),
        companyId,
        undefined,
        referral,
      );

      expect(result.status).toBe('success');
    });

    it('assigns the job and scores the candidate', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', companyId });
      prisma.job.findUnique = jest.fn().mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
        description: null,
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: 'JUNIOR',
        requirements: {},
      });
      prisma.candidate.findUnique.mockResolvedValue({ id: 'c1', aiSummary: null });
      prisma.candidateScoreHistory = { create: jest.fn() };
      prisma.candidate.update = jest.fn();

      await service.uploadReferralCV(makeFile('cv.pdf'), companyId, 'job-1', referral);

      expect(prisma.candidate.create.mock.calls[0][0].data.jobId).toBe('job-1');
      expect(aiService.scoreCandidate).toHaveBeenCalled();
    });

    it('rejects a job from another company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadReferralCV(makeFile('cv.pdf'), companyId, 'job-x', referral),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
