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
});
