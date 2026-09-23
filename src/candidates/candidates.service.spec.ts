import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { CandidatesService } from './candidates.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let prisma: any;
  let aiService: { scoreCandidate: jest.Mock };
  let storageService: { getSignedUrl: jest.Mock };
  let queueService: { addScoringJob: jest.Mock };

  const companyId = 'comp-1';

  beforeEach(async () => {
    prisma = {
      candidate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      job: { findFirst: jest.fn() },
      candidateNote: { create: jest.fn() },
      candidateAction: { createMany: jest.fn() },
      candidateScore: { upsert: jest.fn() },
      candidateScoreHistory: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    aiService = {
      scoreCandidate: jest.fn().mockResolvedValue({
        overallScore: 80,
        skillsMatchScore: 85,
        experienceScore: 75,
        educationScore: 70,
        growthScore: 65,
        bonusScore: 60,
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
    storageService = {
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
    };
    queueService = { addScoringJob: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: StorageService, useValue: storageService },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(CandidatesService);
  });

  describe('create', () => {
    it('rejects duplicate email', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          { fullName: 'Jane', email: 'jane@example.com' },
          companyId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates candidate with normalized email', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'MANUAL',
        status: 'NEW',
        cvFileUrl: '',
        tags: [],
        overallScore: null,
        aiSummary: null,
        cvFileName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
      });

      const result = await service.create(
        { fullName: 'Jane Doe', email: 'Jane@Example.com' },
        companyId,
      );

      expect(result.fullName).toBe('Jane Doe');
      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'jane@example.com' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('persists startDate when provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        startDate: new Date('2026-08-01T00:00:00.000Z'),
      });

      await service.update(
        'c1',
        { status: 'HIRED' as any, startDate: '2026-08-01' },
        companyId,
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            status: 'HIRED',
            startDate: new Date('2026-08-01'),
          }),
        }),
      );
    });

    it('clears startDate when explicitly set to null', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        startDate: null,
      });

      await service.update('c1', { startDate: null as any }, companyId);

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startDate: null }),
        }),
      );
    });

    it('omits startDate from the update payload when not provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
      });

      await service.update('c1', { status: 'SCREENING' as any }, companyId);

      const call = prisma.candidate.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('startDate');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when candidate missing', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('includes signed CV URL in detail view', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.cvFileSignedUrl).toBe('https://signed-url');
      expect(storageService.getSignedUrl).toHaveBeenCalled();
    });

    it('generates photoSignedUrl in detail view when photoUrl is set', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: 's3://bucket/photo.jpg',
        photoFileName: 'photo.jpg',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBe('https://signed-url');
      expect(storageService.getSignedUrl).toHaveBeenCalledWith(
        's3://bucket/photo.jpg',
        24 * 60 * 60,
      );
    });

    it('omits photoSignedUrl when photoUrl is not set', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: null,
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBeNull();
    });

    it('falls back to the raw photoUrl when signing fails', async () => {
      storageService.getSignedUrl.mockImplementation((key: string) => {
        if (key === 's3://bucket/photo.jpg') throw new Error('boom');
        return Promise.resolve('https://signed-url');
      });
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: 's3://bucket/photo.jpg',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBe('s3://bucket/photo.jpg');
    });
  });

  describe('findAll', () => {
    it('generates photoSignedUrl for list rows even though includeSignedUrl is false', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          id: 'c1',
          fullName: 'Jane',
          email: 'jane@example.com',
          source: 'UPLOAD',
          status: 'NEW',
          cvFileUrl: 's3://bucket/cv.pdf',
          photoUrl: 's3://bucket/photo.jpg',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          job: null,
        },
      ]);
      prisma.candidate.count.mockResolvedValue(1);

      const result = await service.findAll(companyId, {});

      expect(result.data[0].photoSignedUrl).toBe('https://signed-url');
      expect(result.data[0].cvFileSignedUrl).toBeNull();
    });
  });

  describe('bulkUpdateStatus', () => {
    it('rejects when some candidates are missing', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }]);

      await expect(
        service.bulkUpdateStatus(
          { candidateIds: ['c1', 'c2'], status: 'SHORTLISTED' },
          companyId,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates status and records actions', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await service.bulkUpdateStatus(
        { candidateIds: ['c1', 'c2'], status: 'SHORTLISTED' },
        companyId,
        'user-1',
      );

      expect(result.updatedCount).toBe(2);
      expect(prisma.candidate.updateMany).toHaveBeenCalled();
      expect(prisma.candidateAction.createMany).toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('rejects when some candidates are missing', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }]);

      await expect(
        service.bulkDelete({ candidateIds: ['c1', 'c2'] }, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes all matching candidates', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await service.bulkDelete(
        { candidateIds: ['c1', 'c2'] },
        companyId,
      );

      expect(result.deletedCount).toBe(2);
      expect(prisma.candidate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1', 'c2'] }, companyId },
      });
    });
  });

  describe('rescoreForJob', () => {
    it('queues scoring job when queue is available', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        jobId: 'job-1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
      });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
        status: 'ACTIVE',
        description: null,
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: 'MID',
        requirements: {},
      });

      const result = await service.rescoreForJob(
        'c1',
        { jobId: 'job-1' },
        companyId,
      );

      expect(result.message).toContain('queued');
      expect(queueService.addScoringJob).toHaveBeenCalledWith({
        candidateId: 'c1',
        jobId: 'job-1',
      });
    });

    it('rejects scoring against closed job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        status: 'CLOSED',
      });

      await expect(
        service.rescoreForJob('c1', { jobId: 'job-1' }, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records a score history row on synchronous scoring (no queue available)', async () => {
      (service as any).queueService = undefined;

      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        jobId: 'other-job',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
      });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
        status: 'ACTIVE',
        description: null,
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: 'MID',
        requirements: {},
      });

      await service.rescoreForJob('c1', { jobId: 'job-1' }, companyId);

      expect(prisma.candidateScore.upsert).toHaveBeenCalled();
      expect(prisma.candidateScoreHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 'c1',
          jobId: 'job-1',
          overallScore: 80,
          source: 'manual_rescore_sync',
        }),
      });
    });
  });

  describe('getScoreHistory', () => {
    it('throws NotFoundException when candidate is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(
        service.getScoreHistory('c1', 'job-1', companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.candidateScoreHistory.findMany).not.toHaveBeenCalled();
    });

    it('returns rescore history for the candidate+job, newest first', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'c1', companyId });
      const history = [{ id: 'hist-2' }, { id: 'hist-1' }];
      prisma.candidateScoreHistory.findMany.mockResolvedValue(history);

      const result = await service.getScoreHistory('c1', 'job-1', companyId);

      expect(prisma.candidateScoreHistory.findMany).toHaveBeenCalledWith({
        where: { candidateId: 'c1', jobId: 'job-1' },
        orderBy: { scoredAt: 'desc' },
      });
      expect(result).toEqual(history);
    });
  });

  describe('getCvSignedUrl', () => {
    it('throws when candidate has no CV', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        cvFileUrl: null,
      });

      await expect(
        service.getCvSignedUrl('c1', companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
