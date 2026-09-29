import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InterviewFeedbackService } from './interview-feedback.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';

describe('InterviewFeedbackService', () => {
  let service: InterviewFeedbackService;
  let prisma: any;
  let notifications: { createNotification: jest.Mock };
  let permissions: { getUserPermissions: jest.Mock };

  const companyId = 'comp-1';
  const candidateId = 'cand-1';
  const jobId = 'job-1';
  const stageId = 'stage-2';

  const recruiter: CurrentUserData = {
    id: 'rec-1',
    email: 'rec@company.com',
    firstName: 'Rana',
    lastName: 'Recruiter',
    role: 'RECRUITER',
    companyId,
    company: { id: companyId, name: 'Co', mode: 'FULL_ATS', plan: 'STARTER' },
    permissions: ['reviewCandidates', 'manageCandidates'],
  };
  const hiringManager: CurrentUserData = {
    ...recruiter,
    id: 'hm-1',
    firstName: 'Hana',
    lastName: 'Manager',
    role: 'HIRING_MANAGER',
    permissions: ['reviewCandidates'],
  };
  const admin: CurrentUserData = { ...recruiter, id: 'admin-1', role: 'ADMIN' };

  const candidateRow = {
    id: candidateId,
    fullName: 'Mona Adel',
    jobId,
    job: { id: jobId, title: 'Backend Engineer' },
  };
  const stageRow = {
    id: stageId,
    name: 'Interview',
    color: '#8B5CF6',
    orderIndex: 2,
    jobId,
  };
  const dto = { stageId, rating: 4, recommendation: 'YES' as const, notes: 'Solid' };

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn().mockResolvedValue(candidateRow) },
      pipelineStage: {
        findFirst: jest.fn().mockResolvedValue(stageRow),
        findMany: jest.fn(),
      },
      user: { findMany: jest.fn() },
      candidateStageInterviewer: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      interviewFeedback: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'fb-1', ...data })),
      },
      candidateAction: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    permissions = {
      getUserPermissions: jest.fn(async (_c: string, role: string) =>
        role === 'VIEWER' ? [] : ['reviewCandidates'],
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewFeedbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get(InterviewFeedbackService);
  });

  describe('submit', () => {
    it('creates feedback for an assigned interviewer', async () => {
      prisma.candidateStageInterviewer.findUnique.mockResolvedValue({ id: 'a-1' });

      const result = await service.submit(candidateId, dto, hiringManager);

      expect(prisma.candidate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: candidateId, companyId } }),
      );
      expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith({
        where: { id: stageId, jobId },
      });
      expect(prisma.interviewFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            candidateId,
            jobId,
            stageId,
            interviewerId: hiringManager.id,
            rating: 4,
            recommendation: 'YES',
            notes: 'Solid',
          },
        }),
      );
      expect(result.id).toBe('fb-1');
    });

    it('404s when the candidate belongs to another company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      await expect(service.submit(candidateId, dto, hiringManager)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.interviewFeedback.create).not.toHaveBeenCalled();
    });

    it('400s when the candidate has no job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ ...candidateRow, jobId: null, job: null });
      await expect(service.submit(candidateId, dto, hiringManager)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("404s when the stage doesn't belong to the candidate's job", async () => {
      prisma.pipelineStage.findFirst.mockResolvedValue(null);
      await expect(service.submit(candidateId, dto, hiringManager)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403s when the user is not assigned to the stage', async () => {
      prisma.candidateStageInterviewer.findUnique.mockResolvedValue(null);
      await expect(service.submit(candidateId, dto, hiringManager)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.interviewFeedback.create).not.toHaveBeenCalled();
    });

    it('lets an ADMIN submit without being assigned', async () => {
      await service.submit(candidateId, dto, admin);
      expect(prisma.candidateStageInterviewer.findUnique).not.toHaveBeenCalled();
      expect(prisma.interviewFeedback.create).toHaveBeenCalled();
    });

    it('409s on a duplicate submission for the same stage', async () => {
      prisma.candidateStageInterviewer.findUnique.mockResolvedValue({ id: 'a-1' });
      prisma.interviewFeedback.findUnique.mockResolvedValue({ id: 'fb-0' });
      await expect(service.submit(candidateId, dto, hiringManager)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.interviewFeedback.create).not.toHaveBeenCalled();
    });
  });

  describe('listForCandidate', () => {
    it('groups feedback by stage in stage order with pending interviewers', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId, jobId });
      prisma.pipelineStage.findMany.mockResolvedValue([
        { id: 'stage-1', name: 'Screening', color: '#3B82F6', orderIndex: 1 },
        { ...stageRow },
      ]);
      const hm = { id: 'hm-1', firstName: 'Hana', lastName: 'Manager' };
      const rec = { id: 'rec-1', firstName: 'Rana', lastName: 'Recruiter' };
      prisma.interviewFeedback.findMany.mockResolvedValue([
        { id: 'fb-1', stageId, interviewerId: 'hm-1', interviewer: hm, rating: 5 },
      ]);
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([
        { stageId, user: hm },
        { stageId, user: rec },
      ]);

      const result = await service.listForCandidate(candidateId, companyId);

      expect(result.jobId).toBe(jobId);
      expect(result.stages.map((s) => s.stage.id)).toEqual(['stage-1', stageId]);
      expect(result.stages[0].feedback).toEqual([]);
      expect(result.stages[1].feedback).toHaveLength(1);
      expect(result.stages[1].assignedInterviewers).toEqual([hm, rec]);
      expect(result.stages[1].pendingInterviewers).toEqual([rec]);
    });

    it('returns no stages when the candidate has no job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: candidateId, jobId: null });
      await expect(service.listForCandidate(candidateId, companyId)).resolves.toEqual({
        jobId: null,
        stages: [],
      });
    });

    it('404s for a candidate outside the company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      await expect(service.listForCandidate(candidateId, companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignInterviewers', () => {
    const hmUser = { id: 'hm-1', firstName: 'Hana', lastName: 'Manager', role: 'HIRING_MANAGER' };
    const recUser = { id: 'rec-1', firstName: 'Rana', lastName: 'Recruiter', role: 'RECRUITER' };
    const otherUser = { id: 'hm-2', firstName: 'Omar', lastName: 'Said', role: 'HIRING_MANAGER' };

    it('adds and removes assignees, logs the action, and notifies only new assignees', async () => {
      prisma.user.findMany.mockResolvedValue([hmUser, otherUser]);
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([
        { userId: 'hm-1' },
        { userId: 'old-1' },
      ]);

      const result = await service.assignInterviewers(
        candidateId,
        stageId,
        { userIds: ['hm-1', 'hm-2'] },
        recruiter,
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['hm-1', 'hm-2'] }, companyId, isActive: true },
        }),
      );
      expect(prisma.candidateStageInterviewer.deleteMany).toHaveBeenCalledWith({
        where: { candidateId, stageId, userId: { in: ['old-1'] } },
      });
      expect(prisma.candidateStageInterviewer.createMany).toHaveBeenCalledWith({
        data: [{ candidateId, stageId, userId: 'hm-2', assignedById: recruiter.id }],
        skipDuplicates: true,
      });
      expect(prisma.candidateAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'interviewers_assigned',
          details: expect.objectContaining({ added: ['hm-2'], removed: ['old-1'] }),
        }),
      });
      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTERVIEWER_ASSIGNED',
          companyId,
          userId: 'hm-2',
          metadata: { candidateId, jobId, stageId },
        }),
      );
      expect(notifications.createNotification.mock.calls[0][0].message).toContain(
        'Mona Adel',
      );
      expect(result.map((u) => u.id)).toEqual(['hm-1', 'hm-2']);
    });

    it('does not notify the assigner when they assign themselves', async () => {
      prisma.user.findMany.mockResolvedValue([recUser]);
      await service.assignInterviewers(candidateId, stageId, { userIds: ['rec-1'] }, recruiter);
      expect(prisma.candidateStageInterviewer.createMany).toHaveBeenCalled();
      expect(notifications.createNotification).not.toHaveBeenCalled();
    });

    it('rejects users that are inactive or in another company', async () => {
      prisma.user.findMany.mockResolvedValue([hmUser]);
      await expect(
        service.assignInterviewers(candidateId, stageId, { userIds: ['hm-1', 'ghost'] }, recruiter),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects users whose role cannot review candidates', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'v-1', firstName: 'Vee', lastName: 'Ewer', role: 'VIEWER' },
      ]);
      await expect(
        service.assignInterviewers(candidateId, stageId, { userIds: ['v-1'] }, recruiter),
      ).rejects.toThrow(BadRequestException);
      expect(permissions.getUserPermissions).toHaveBeenCalledWith(companyId, 'VIEWER');
    });

    it('resolves permissions once per distinct role', async () => {
      prisma.user.findMany.mockResolvedValue([hmUser, otherUser]);
      await service.assignInterviewers(
        candidateId,
        stageId,
        { userIds: ['hm-1', 'hm-2'] },
        recruiter,
      );
      expect(permissions.getUserPermissions).toHaveBeenCalledTimes(1);
    });

    it('is a no-op write when the list is unchanged', async () => {
      prisma.user.findMany.mockResolvedValue([hmUser]);
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([{ userId: 'hm-1' }]);
      await service.assignInterviewers(candidateId, stageId, { userIds: ['hm-1'] }, recruiter);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.createNotification).not.toHaveBeenCalled();
    });

    it('clears all assignees for an empty list', async () => {
      prisma.candidateStageInterviewer.findMany.mockResolvedValue([{ userId: 'hm-1' }]);
      const result = await service.assignInterviewers(
        candidateId,
        stageId,
        { userIds: [] },
        recruiter,
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.candidateStageInterviewer.deleteMany).toHaveBeenCalledWith({
        where: { candidateId, stageId, userId: { in: ['hm-1'] } },
      });
      expect(result).toEqual([]);
    });

    it('still succeeds when sending a notification fails', async () => {
      prisma.user.findMany.mockResolvedValue([hmUser]);
      notifications.createNotification.mockRejectedValue(new Error('db down'));
      await expect(
        service.assignInterviewers(candidateId, stageId, { userIds: ['hm-1'] }, recruiter),
      ).resolves.toEqual([{ id: 'hm-1', firstName: 'Hana', lastName: 'Manager' }]);
    });

    it("404s when the stage doesn't belong to the candidate's job", async () => {
      prisma.pipelineStage.findFirst.mockResolvedValue(null);
      await expect(
        service.assignInterviewers(candidateId, stageId, { userIds: ['hm-1'] }, recruiter),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
