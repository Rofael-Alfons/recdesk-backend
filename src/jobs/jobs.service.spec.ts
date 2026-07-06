import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: any;
  let queueService: { addBulkScoringJobs: jest.Mock };

  const companyId = 'comp-1';

  beforeEach(async () => {
    prisma = {
      job: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      pipelineStage: {
        createMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      candidate: {
        findMany: jest.fn(),
      },
    };
    queueService = { addBulkScoringJobs: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(JobsService);
  });

  describe('create', () => {
    it('creates job with defaults and pipeline stages', async () => {
      prisma.job.create.mockResolvedValue({
        id: 'job-1',
        title: 'Backend Engineer',
        description: 'Build APIs',
        status: 'DRAFT',
        experienceLevel: 'JUNIOR',
        requiredSkills: [],
        preferredSkills: [],
        requirements: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { candidates: 0 },
      });

      const result = await service.create(
        { title: 'Backend Engineer', description: 'Build APIs' },
        companyId,
      );

      expect(result.title).toBe('Backend Engineer');
      expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'New', jobId: 'job-1' }),
        ]),
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when job is missing', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns job with pipeline stages', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Backend Engineer',
        description: null,
        status: 'ACTIVE',
        experienceLevel: 'MID',
        requiredSkills: ['Node.js'],
        preferredSkills: [],
        requirements: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { candidates: 3 },
        pipelineStages: [{ id: 'stage-1', name: 'New' }],
      });

      const result = await service.findOne('job-1', companyId);

      expect(result.candidateCount).toBe(3);
      expect(result.pipelineStages).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('triggers rescoring when requirements change', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', companyId });
      prisma.job.update.mockResolvedValue({
        id: 'job-1',
        title: 'Backend Engineer',
        description: null,
        status: 'ACTIVE',
        experienceLevel: 'MID',
        requiredSkills: ['TypeScript'],
        preferredSkills: [],
        requirements: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { candidates: 2 },
      });
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ]);

      await service.update(
        'job-1',
        { requiredSkills: ['TypeScript'] },
        companyId,
      );

      expect(queueService.addBulkScoringJobs).toHaveBeenCalledWith([
        { candidateId: 'c1', jobId: 'job-1' },
        { candidateId: 'c2', jobId: 'job-1' },
      ]);
    });
  });

  describe('remove', () => {
    it('soft-closes job', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1' });
      prisma.job.update.mockResolvedValue({});

      const result = await service.remove('job-1', companyId);

      expect(result.message).toContain('closed');
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'CLOSED' },
      });
    });
  });

  describe('getJobStats', () => {
    it('returns aggregated stats', async () => {
      prisma.job.count.mockResolvedValue(10);
      prisma.job.groupBy
        .mockResolvedValueOnce([
          { status: 'ACTIVE', _count: 4 },
          { status: 'DRAFT', _count: 2 },
        ])
        .mockResolvedValueOnce([
          { experienceLevel: 'JUNIOR', _count: 3 },
          { experienceLevel: 'SENIOR', _count: 1 },
        ]);

      const result = await service.getJobStats(companyId);

      expect(result.total).toBe(10);
      expect(result.byStatus.active).toBe(4);
      expect(result.byExperienceLevel.junior).toBe(3);
    });
  });
});
