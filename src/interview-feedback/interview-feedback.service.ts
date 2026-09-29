import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { SubmitFeedbackDto, AssignInterviewersDto } from './dto';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class InterviewFeedbackService {
  private readonly logger = new Logger(InterviewFeedbackService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private permissions: PermissionsService,
  ) {}

  /**
   * Loads a company-scoped candidate that has a job, plus a stage that belongs
   * to that job. Shared by every stage-level endpoint in this module.
   */
  private async loadCandidateAndStage(
    candidateId: string,
    companyId: string,
    stageId: string,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      select: {
        id: true,
        fullName: true,
        jobId: true,
        job: { select: { id: true, title: true } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (!candidate.jobId || !candidate.job) {
      throw new BadRequestException(
        'Assign the candidate to a job before collecting interview feedback',
      );
    }

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, jobId: candidate.jobId },
    });
    if (!stage) throw new NotFoundException('Stage not found for this job');

    return { candidate, job: candidate.job, stage };
  }

  async submit(
    candidateId: string,
    dto: SubmitFeedbackDto,
    user: CurrentUserData,
  ) {
    const { job } = await this.loadCandidateAndStage(
      candidateId,
      user.companyId,
      dto.stageId,
    );

    if (user.role !== UserRole.ADMIN) {
      const assignment =
        await this.prisma.candidateStageInterviewer.findUnique({
          where: {
            candidateId_stageId_userId: {
              candidateId,
              stageId: dto.stageId,
              userId: user.id,
            },
          },
        });
      if (!assignment) {
        throw new ForbiddenException(
          'Only interviewers assigned to this stage can submit feedback',
        );
      }
    }

    const existing = await this.prisma.interviewFeedback.findUnique({
      where: {
        candidateId_stageId_interviewerId: {
          candidateId,
          stageId: dto.stageId,
          interviewerId: user.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already submitted feedback for this candidate at this stage',
      );
    }

    return this.prisma.interviewFeedback.create({
      data: {
        candidateId,
        jobId: job.id,
        stageId: dto.stageId,
        interviewerId: user.id,
        rating: dto.rating,
        recommendation: dto.recommendation,
        notes: dto.notes,
      },
      include: { interviewer: { select: USER_SELECT } },
    });
  }

  /**
   * All feedback for the candidate's current job, grouped by pipeline stage
   * (in stage order), with assigned and still-pending interviewers per stage.
   */
  async listForCandidate(candidateId: string, companyId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      select: { id: true, jobId: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (!candidate.jobId) return { jobId: null, stages: [] };

    const [stages, feedback, assignments] = await Promise.all([
      this.prisma.pipelineStage.findMany({
        where: { jobId: candidate.jobId },
        orderBy: { orderIndex: 'asc' },
      }),
      this.prisma.interviewFeedback.findMany({
        where: { candidateId, jobId: candidate.jobId },
        include: { interviewer: { select: USER_SELECT } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.candidateStageInterviewer.findMany({
        where: { candidateId },
        include: { user: { select: USER_SELECT } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      jobId: candidate.jobId,
      stages: stages.map((stage) => {
        const stageFeedback = feedback.filter((f) => f.stageId === stage.id);
        const assignedInterviewers = assignments
          .filter((a) => a.stageId === stage.id)
          .map((a) => a.user);
        const submitted = new Set(stageFeedback.map((f) => f.interviewerId));
        return {
          stage: {
            id: stage.id,
            name: stage.name,
            color: stage.color,
            orderIndex: stage.orderIndex,
          },
          feedback: stageFeedback,
          assignedInterviewers,
          pendingInterviewers: assignedInterviewers.filter(
            (u) => !submitted.has(u.id),
          ),
        };
      }),
    };
  }

  async getInterviewers(
    candidateId: string,
    stageId: string,
    companyId: string,
  ) {
    await this.loadCandidateAndStage(candidateId, companyId, stageId);
    const rows = await this.prisma.candidateStageInterviewer.findMany({
      where: { candidateId, stageId },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.user);
  }

  /**
   * Replaces the interviewer list for a candidate's stage. Newly added
   * interviewers (other than the assigner) get an INTERVIEWER_ASSIGNED
   * notification.
   */
  async assignInterviewers(
    candidateId: string,
    stageId: string,
    dto: AssignInterviewersDto,
    user: CurrentUserData,
  ) {
    const { candidate, job, stage } = await this.loadCandidateAndStage(
      candidateId,
      user.companyId,
      stageId,
    );
    const userIds = [...new Set(dto.userIds)];

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: userIds },
            companyId: user.companyId,
            isActive: true,
          },
          select: { ...USER_SELECT, role: true },
        })
      : [];
    if (users.length !== userIds.length) {
      throw new BadRequestException(
        'All interviewers must be active members of your company',
      );
    }

    // Interviewers must be able to submit feedback. Resolve once per role.
    const roles = [...new Set(users.map((u) => u.role))];
    const rolePerms = await Promise.all(
      roles.map((role) =>
        this.permissions.getUserPermissions(user.companyId, role),
      ),
    );
    const canReview = new Map(
      roles.map((role, i) => [role, rolePerms[i].includes('reviewCandidates')]),
    );
    const notAllowed = users.filter((u) => !canReview.get(u.role));
    if (notAllowed.length) {
      throw new BadRequestException(
        `These users don't have permission to review candidates: ${notAllowed
          .map((u) => `${u.firstName} ${u.lastName}`)
          .join(', ')}`,
      );
    }

    const current = await this.prisma.candidateStageInterviewer.findMany({
      where: { candidateId, stageId },
      select: { userId: true },
    });
    const currentIds = new Set(current.map((c) => c.userId));
    const added = userIds.filter((id) => !currentIds.has(id));
    const removed = [...currentIds].filter((id) => !userIds.includes(id));

    if (added.length || removed.length) {
      await this.prisma.$transaction([
        this.prisma.candidateStageInterviewer.deleteMany({
          where: { candidateId, stageId, userId: { in: removed } },
        }),
        this.prisma.candidateStageInterviewer.createMany({
          data: added.map((userId) => ({
            candidateId,
            stageId,
            userId,
            assignedById: user.id,
          })),
          skipDuplicates: true,
        }),
        this.prisma.candidateAction.create({
          data: {
            candidateId,
            userId: user.id,
            action: 'interviewers_assigned',
            details: { stageId, stageName: stage.name, added, removed },
          },
        }),
      ]);
    }

    for (const assigneeId of added) {
      if (assigneeId === user.id) continue;
      try {
        await this.notifications.createNotification({
          type: NotificationType.INTERVIEWER_ASSIGNED,
          companyId: user.companyId,
          userId: assigneeId,
          title: 'Interview assignment',
          message: `You've been assigned to interview ${candidate.fullName} (${stage.name} – ${job.title})`,
          metadata: { candidateId, jobId: job.id, stageId },
        });
      } catch (error) {
        this.logger.error(
          `Failed to notify interviewer ${assigneeId} for candidate ${candidateId}: ${error}`,
        );
      }
    }

    const byId = new Map(users.map((u) => [u.id, u]));
    return userIds.map((id) => {
      const u = byId.get(id)!;
      return { id: u.id, firstName: u.firstName, lastName: u.lastName };
    });
  }
}
