import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  PipelineTemplatesService,
  STANDARD_STAGES,
} from '../pipeline-templates/pipeline-templates.service';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: any;
  let queueService: { addBulkScoringJobs: jest.Mock };
  let pipelineTemplates: { resolveStages: jest.Mock };

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
    pipelineTemplates = {
      resolveStages: jest.fn().mockResolvedValue(STANDARD_STAGES),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
        { provide: PipelineTemplatesService, useValue: pipelineTemplates },
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
      expect(pipelineTemplates.resolveStages).toHaveBeenCalledWith(companyId, undefined);
      expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            name: 'New',
            category: 'NEW',
            orderIndex: 0,
            isDefault: true,
            jobId: 'job-1',
          }),
        ]),
      });
    });

    const jobRow = {
      id: 'job-2',
      title: 'Ops Manager',
      status: 'DRAFT',
      experienceLevel: 'JUNIOR',
      requiredSkills: [],
      preferredSkills: [],
      requirements: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { candidates: 0 },
    };

    it('seeds from explicit stages without consulting templates', async () => {
      prisma.job.create.mockResolvedValue(jobRow);
      await service.create(
        {
          title: 'Ops Manager',
          stages: [
            { name: ' Screening ', category: 'SCREENING', color: '#3B82F6' },
            { name: 'First Interview', category: 'INTERVIEW', color: '#8B5CF6' },
          ],
        },
        companyId,
      );
      expect(pipelineTemplates.resolveStages).not.toHaveBeenCalled();
      expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'Screening', orderIndex: 0, isDefault: true }),
          expect.objectContaining({ name: 'First Interview', category: 'INTERVIEW', orderIndex: 1, isDefault: false }),
        ],
      });
    });

    it('seeds from the chosen template', async () => {
      prisma.job.create.mockResolvedValue(jobRow);
      pipelineTemplates.resolveStages.mockResolvedValue([
        { name: 'Assessment', category: 'INTERVIEW', color: '#8B5CF6' },
      ]);
      await service.create({ title: 'Ops Manager', templateId: 'tpl-1' }, companyId);
      expect(pipelineTemplates.resolveStages).toHaveBeenCalledWith(companyId, 'tpl-1');
      expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ name: 'Assessment', jobId: 'job-2' })],
      });
    });

    it('rejects duplicate stage names before creating the job', async () => {
      await expect(
        service.create(
          {
            title: 'Ops Manager',
            stages: [
              { name: 'Final', category: 'INTERVIEW', color: '#8B5CF6' },
              { name: 'final', category: 'INTERVIEW', color: '#8B5CF6' },
            ],
          },
          companyId,
        ),
      ).rejects.toThrow(/Duplicate stage name/);
      expect(prisma.job.create).not.toHaveBeenCalled();
    });
  });

  describe('replaceStages', () => {
    const existing = [
      { id: 's-1', name: 'Screening', orderIndex: 0, jobId: 'job-1' },
      { id: 's-2', name: 'Interview', orderIndex: 1, jobId: 'job-1' },
      { id: 's-3', name: 'Offer', orderIndex: 2, jobId: 'job-1' },
    ];

    beforeEach(() => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', pipelineStages: existing });
      prisma.pipelineStage.update = jest.fn((args) => ({ op: 'update', ...args }));
      prisma.pipelineStage.create = jest.fn((args) => ({ op: 'create', ...args }));
      prisma.pipelineStage.deleteMany = jest.fn((args) => ({ op: 'deleteMany', ...args }));
      prisma.pipelineStage.findMany = jest.fn().mockResolvedValue([]);
      prisma.candidate.groupBy = jest.fn().mockResolvedValue([]);
      prisma.interviewFeedback = { groupBy: jest.fn().mockResolvedValue([]) };
      prisma.candidateStageInterviewer = { groupBy: jest.fn().mockResolvedValue([]) };
      prisma.candidateStage = { groupBy: jest.fn().mockResolvedValue([]) };
      prisma.$transaction = jest.fn((ops: any[]) => Promise.resolve(ops));
    });

    it('404s for a job outside the company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);
      await expect(
        service.replaceStages('job-1', { stages: [] }, companyId),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates, reorders, creates and deletes unused stages in one transaction', async () => {
      await service.replaceStages(
        'job-1',
        {
          stages: [
            { id: 's-2', name: 'Tech Interview', category: 'INTERVIEW', color: '#8B5CF6' },
            { name: 'Assessment', category: 'INTERVIEW', color: '#F59E0B' },
            { id: 's-1', name: 'Screening', category: 'SCREENING', color: '#3B82F6' },
          ],
        },
        companyId,
      );

      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops[0]).toEqual(
        expect.objectContaining({ op: 'deleteMany', where: { id: { in: ['s-3'] } } }),
      );
      expect(prisma.pipelineStage.update).toHaveBeenCalledWith({
        where: { id: 's-2' },
        data: expect.objectContaining({ name: 'Tech Interview', orderIndex: 0, isDefault: true }),
      });
      expect(prisma.pipelineStage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Assessment', orderIndex: 1, jobId: 'job-1' }),
      });
      expect(prisma.pipelineStage.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: expect.objectContaining({ orderIndex: 2, isDefault: false }),
      });
    });

    it('refuses to remove a stage that has candidates or feedback', async () => {
      prisma.candidate.groupBy.mockResolvedValue([
        { currentStageId: 's-3', _count: { _all: 2 } },
      ]);
      prisma.interviewFeedback.groupBy.mockResolvedValue([
        { stageId: 's-3', _count: { _all: 1 } },
      ]);
      await expect(
        service.replaceStages(
          'job-1',
          {
            stages: [
              { id: 's-1', name: 'Screening', category: 'SCREENING', color: '#3B82F6' },
              { id: 's-2', name: 'Interview', category: 'INTERVIEW', color: '#8B5CF6' },
            ],
          },
          companyId,
        ),
      ).rejects.toThrow(/"Offer" has 2 candidates, 1 feedback entry/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a stage id from another job", async () => {
      await expect(
        service.replaceStages(
          'job-1',
          { stages: [{ id: 'foreign', name: 'X', category: 'NEW', color: '#000000' }] },
          companyId,
        ),
      ).rejects.toThrow(/does not belong to this job/);
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

  describe('getPipeline', () => {
    const stages = [
      { id: 's-new', name: 'New', color: '#6B7280', orderIndex: 0 },
      { id: 's-int', name: 'Interview', color: '#8B5CF6', orderIndex: 2 },
    ];
    const hm = { id: 'hm-1', firstName: 'Hana', lastName: 'Manager' };
    const rec = { id: 'rec-1', firstName: 'Rana', lastName: 'Recruiter' };

    beforeEach(() => {
      prisma.candidateStageInterviewer = { findMany: jest.fn() };
      prisma.interviewFeedback = { findMany: jest.fn() };
    });

    it('404s for a job outside the company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);
      await expect(service.getPipeline('job-1', companyId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-1', companyId } }),
      );
    });

    it('places candidates by status and counts current-stage feedback', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', pipelineStages: stages });
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c-1', fullName: 'Mona', status: 'INTERVIEWING', overallScore: 80 },
        { id: 'c-2', fullName: 'Ali', status: 'NEW', overallScore: 60 },
        { id: 'c-3', fullName: 'Sara', status: 'REJECTED', overallScore: 40 },
      ]);
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([
        { candidateId: 'c-1', stageId: 's-int', user: hm },
        { candidateId: 'c-1', stageId: 's-int', user: rec },
        // Assignment on a stage the candidate is not in is ignored.
        { candidateId: 'c-2', stageId: 's-int', user: hm },
      ]);
      prisma.interviewFeedback.findMany.mockResolvedValue([
        { candidateId: 'c-1', stageId: 's-int', interviewerId: 'hm-1' },
        { candidateId: 'c-1', stageId: 's-new', interviewerId: 'rec-1' },
      ]);

      const result = await service.getPipeline('job-1', companyId);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { jobId: 'job-1', companyId } }),
      );
      expect(prisma.candidateStageInterviewer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: { in: ['c-1', 'c-2'] } },
        }),
      );
      // Uncategorized (pre-backfill) stages get a name-derived category.
      expect(result.stages).toEqual([
        { ...stages[0], category: 'NEW' },
        { ...stages[1], category: 'INTERVIEW' },
      ]);
      expect(result.closedCount).toBe(1);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          id: 'c-1',
          stageId: 's-int',
          interviewers: [hm, rec],
          feedbackCount: 1,
          pendingFeedbackCount: 1,
        }),
        expect.objectContaining({
          id: 'c-2',
          stageId: 's-new',
          interviewers: [],
          feedbackCount: 0,
          pendingFeedbackCount: 0,
        }),
      ]);
    });

    it('places candidates by stored currentStageId on a custom pipeline', async () => {
      const custom = [
        { id: 'scr', name: 'Screening', color: '#3B82F6', orderIndex: 0, category: 'SCREENING' },
        { id: 'tech', name: 'Tech Interview', color: '#8B5CF6', orderIndex: 1, category: 'INTERVIEW' },
        { id: 'assess', name: 'Assessment', color: '#F59E0B', orderIndex: 2, category: 'INTERVIEW' },
      ];
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', pipelineStages: custom });
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c-1', fullName: 'Mona', status: 'INTERVIEWING', overallScore: 80, currentStageId: 'assess' },
        { id: 'c-2', fullName: 'Ali', status: 'INTERVIEWING', overallScore: 70, currentStageId: null },
        { id: 'c-3', fullName: 'Sara', status: 'WITHDRAWN', overallScore: 50, currentStageId: 'tech' },
      ]);
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([]);
      prisma.interviewFeedback.findMany.mockResolvedValue([]);

      const result = await service.getPipeline('job-1', companyId);

      expect(result.stages.map((s) => s.category)).toEqual(['SCREENING', 'INTERVIEW', 'INTERVIEW']);
      expect(result.candidates.map((c) => [c.id, c.stageId])).toEqual([
        ['c-1', 'assess'],
        ['c-2', 'tech'], // derived: first INTERVIEW-category stage
      ]);
      expect(result.closedCount).toBe(1);
    });

    it('skips the assignment/feedback queries when no candidates are open', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1', pipelineStages: stages });
      prisma.candidate.findMany.mockResolvedValue([]);

      const result = await service.getPipeline('job-1', companyId);

      expect(prisma.candidateStageInterviewer.findMany).not.toHaveBeenCalled();
      expect(prisma.interviewFeedback.findMany).not.toHaveBeenCalled();
      expect(result.candidates).toEqual([]);
      expect(result.closedCount).toBe(0);
    });
  });
});
