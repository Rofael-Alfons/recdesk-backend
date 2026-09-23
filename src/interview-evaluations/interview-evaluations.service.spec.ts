import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InterviewEvaluationsService } from './interview-evaluations.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';

describe('InterviewEvaluationsService', () => {
  let service: InterviewEvaluationsService;
  let prisma: any;

  const companyId = 'comp-1';
  const candidateId = 'cand-1';
  const jobId = 'job-1';

  const hiringManager: CurrentUserData = {
    id: 'user-1',
    email: 'hm@company.com',
    firstName: 'Hana',
    lastName: 'Manager',
    role: 'HIRING_MANAGER',
    companyId,
    company: { id: companyId, name: 'Co', mode: 'FULL_ATS', plan: 'STARTER' },
    permissions: ['reviewCandidates'],
  };

  const otherEvaluator: CurrentUserData = {
    ...hiringManager,
    id: 'user-2',
    firstName: 'Omar',
  };

  const admin: CurrentUserData = {
    ...hiringManager,
    id: 'admin-1',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn() },
      job: { findFirst: jest.fn() },
      interviewEvaluation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      interviewEvaluationHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewEvaluationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InterviewEvaluationsService);
  });

  describe('create', () => {
    const dto = {
      candidateId,
      jobId,
      overallRating: 4,
      criteria: { communication: 5, technicalSkill: 3 },
      notes: 'Strong communicator',
      recommendation: 'ADVANCE' as const,
    };

    it('creates a scorecard scoped to the evaluator', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.job.findFirst.mockResolvedValue({ id: jobId });
      prisma.interviewEvaluation.findUnique.mockResolvedValue(null);
      prisma.interviewEvaluation.create.mockResolvedValue({ id: 'eval-1' });

      await service.create(dto, hiringManager);

      expect(prisma.interviewEvaluation.create).toHaveBeenCalledWith({
        data: {
          candidateId,
          jobId,
          evaluatorId: hiringManager.id,
          overallRating: 4,
          criteria: dto.criteria,
          notes: 'Strong communicator',
          recommendation: 'ADVANCE',
        },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
    });

    it('throws NotFoundException when candidate is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, hiringManager)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.job.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when job is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, hiringManager)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException when the evaluator already scored this candidate for this job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.job.findFirst.mockResolvedValue({ id: jobId });
      prisma.interviewEvaluation.findUnique.mockResolvedValue({
        id: 'existing-eval',
      });

      await expect(service.create(dto, hiringManager)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.interviewEvaluation.create).not.toHaveBeenCalled();
    });

    it('allows two different evaluators to each score the same candidate+job (panel support)', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.job.findFirst.mockResolvedValue({ id: jobId });
      prisma.interviewEvaluation.findUnique.mockResolvedValue(null);
      prisma.interviewEvaluation.create.mockResolvedValue({ id: 'eval-1' });

      await service.create(dto, hiringManager);
      await service.create(dto, otherEvaluator);

      expect(prisma.interviewEvaluation.findUnique).toHaveBeenNthCalledWith(
        1,
        {
          where: {
            candidateId_jobId_evaluatorId: {
              candidateId,
              jobId,
              evaluatorId: hiringManager.id,
            },
          },
        },
      );
      expect(prisma.interviewEvaluation.findUnique).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            candidateId_jobId_evaluatorId: {
              candidateId,
              jobId,
              evaluatorId: otherEvaluator.id,
            },
          },
        },
      );
      expect(prisma.interviewEvaluation.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('listForCandidate', () => {
    it('throws NotFoundException when candidate is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(
        service.listForCandidate(candidateId, jobId, companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('filters by jobId when provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.interviewEvaluation.findMany.mockResolvedValue([]);

      await service.listForCandidate(candidateId, jobId, companyId);

      expect(prisma.interviewEvaluation.findMany).toHaveBeenCalledWith({
        where: { candidateId, jobId },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
          job: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('omits the jobId filter when not provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId });
      prisma.interviewEvaluation.findMany.mockResolvedValue([]);

      await service.listForCandidate(candidateId, undefined, companyId);

      expect(prisma.interviewEvaluation.findMany).toHaveBeenCalledWith({
        where: { candidateId },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
          job: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the scorecard is not in the caller company', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue(null);

      await expect(
        service.update('eval-1', { overallRating: 5 }, hiringManager),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when a different non-admin evaluator edits someone else\'s scorecard', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: hiringManager.id,
      });

      await expect(
        service.update('eval-1', { overallRating: 5 }, otherEvaluator),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.interviewEvaluation.update).not.toHaveBeenCalled();
    });

    it('allows the owning evaluator to update their own scorecard with partial data', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: hiringManager.id,
      });
      prisma.interviewEvaluation.update.mockResolvedValue({ id: 'eval-1' });

      await service.update(
        'eval-1',
        { overallRating: 5, notes: 'Updated notes' },
        hiringManager,
      );

      expect(prisma.interviewEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
        data: { overallRating: 5, notes: 'Updated notes' },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
    });

    it('snapshots the pre-edit values into history and returns the updated scorecard', async () => {
      const existing = {
        id: 'eval-1',
        evaluatorId: hiringManager.id,
        overallRating: 3,
        criteria: { communication: 3 },
        notes: 'Old notes',
        recommendation: 'HOLD',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      prisma.interviewEvaluation.findFirst.mockResolvedValue(existing);
      prisma.interviewEvaluation.update.mockResolvedValue({
        id: 'eval-1',
        overallRating: 5,
      });

      const result = await service.update(
        'eval-1',
        { overallRating: 5 },
        hiringManager,
      );

      expect(prisma.interviewEvaluationHistory.create).toHaveBeenCalledWith({
        data: {
          interviewEvaluationId: 'eval-1',
          overallRating: 3,
          criteria: { communication: 3 },
          notes: 'Old notes',
          recommendation: 'HOLD',
          versionCreatedAt: existing.updatedAt,
          editedById: hiringManager.id,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'eval-1', overallRating: 5 });
    });

    it('allows an ADMIN to edit another evaluator\'s scorecard', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: hiringManager.id,
      });
      prisma.interviewEvaluation.update.mockResolvedValue({ id: 'eval-1' });

      await service.update('eval-1', { overallRating: 2 }, admin);

      expect(prisma.interviewEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
        data: { overallRating: 2 },
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException for a non-owner non-admin', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: hiringManager.id,
      });

      await expect(
        service.remove('eval-1', otherEvaluator),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.interviewEvaluation.delete).not.toHaveBeenCalled();
    });

    it('deletes the scorecard for its owner', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: hiringManager.id,
      });

      const result = await service.remove('eval-1', hiringManager);

      expect(result.message).toContain('deleted');
      expect(prisma.interviewEvaluation.delete).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
      });
    });
  });

  describe('getHistory', () => {
    it('throws NotFoundException when the scorecard is not in the caller company', async () => {
      prisma.interviewEvaluation.findFirst.mockResolvedValue(null);

      await expect(
        service.getHistory('eval-1', companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.interviewEvaluationHistory.findMany).not.toHaveBeenCalled();
    });

    it('returns the current scorecard plus its edit history, newest first', async () => {
      const current = { id: 'eval-1', overallRating: 5 };
      const history = [{ id: 'hist-2' }, { id: 'hist-1' }];
      prisma.interviewEvaluation.findFirst.mockResolvedValue(current);
      prisma.interviewEvaluationHistory.findMany.mockResolvedValue(history);

      const result = await service.getHistory('eval-1', companyId);

      expect(prisma.interviewEvaluationHistory.findMany).toHaveBeenCalledWith({
        where: { interviewEvaluationId: 'eval-1' },
        orderBy: { createdAt: 'desc' },
        include: {
          editedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      expect(result).toEqual({ current, history });
    });
  });
});
