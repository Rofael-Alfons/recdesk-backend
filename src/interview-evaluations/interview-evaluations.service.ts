import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import {
  CreateInterviewEvaluationDto,
  UpdateInterviewEvaluationDto,
} from './dto';

const EVALUATOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class InterviewEvaluationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInterviewEvaluationDto, user: CurrentUserData) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, companyId: user.companyId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, companyId: user.companyId },
    });
    if (!job) throw new NotFoundException('Job not found');

    const existing = await this.prisma.interviewEvaluation.findUnique({
      where: {
        candidateId_jobId_evaluatorId: {
          candidateId: dto.candidateId,
          jobId: dto.jobId,
          evaluatorId: user.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already submitted a scorecard for this candidate on this job. Edit your existing scorecard instead.',
      );
    }

    return this.prisma.interviewEvaluation.create({
      data: {
        candidateId: dto.candidateId,
        jobId: dto.jobId,
        evaluatorId: user.id,
        overallRating: dto.overallRating,
        criteria: (dto.criteria as Prisma.InputJsonValue) ?? undefined,
        notes: dto.notes,
        recommendation: dto.recommendation,
      },
      include: { evaluator: { select: EVALUATOR_SELECT } },
    });
  }

  async listForCandidate(
    candidateId: string,
    jobId: string | undefined,
    companyId: string,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    return this.prisma.interviewEvaluation.findMany({
      where: { candidateId, ...(jobId && { jobId }) },
      include: {
        evaluator: { select: EVALUATOR_SELECT },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    dto: UpdateInterviewEvaluationDto,
    user: CurrentUserData,
  ) {
    const existing = await this.prisma.interviewEvaluation.findFirst({
      where: { id, candidate: { companyId: user.companyId } },
    });
    if (!existing) throw new NotFoundException('Scorecard not found');

    if (existing.evaluatorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own scorecard');
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.interviewEvaluationHistory.create({
        data: {
          interviewEvaluationId: existing.id,
          overallRating: existing.overallRating,
          criteria: existing.criteria as Prisma.InputJsonValue,
          notes: existing.notes,
          recommendation: existing.recommendation,
          versionCreatedAt: existing.updatedAt,
          editedById: user.id,
        },
      }),
      this.prisma.interviewEvaluation.update({
        where: { id },
        data: {
          ...(dto.overallRating !== undefined && {
            overallRating: dto.overallRating,
          }),
          ...(dto.criteria !== undefined && {
            criteria: dto.criteria as Prisma.InputJsonValue,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.recommendation !== undefined && {
            recommendation: dto.recommendation,
          }),
        },
        include: { evaluator: { select: EVALUATOR_SELECT } },
      }),
    ]);

    return updated;
  }

  async getHistory(id: string, companyId: string) {
    const existing = await this.prisma.interviewEvaluation.findFirst({
      where: { id, candidate: { companyId } },
      include: { evaluator: { select: EVALUATOR_SELECT } },
    });
    if (!existing) throw new NotFoundException('Scorecard not found');

    const history = await this.prisma.interviewEvaluationHistory.findMany({
      where: { interviewEvaluationId: id },
      orderBy: { createdAt: 'desc' },
      include: { editedBy: { select: EVALUATOR_SELECT } },
    });

    return { current: existing, history };
  }

  async remove(id: string, user: CurrentUserData) {
    const existing = await this.prisma.interviewEvaluation.findFirst({
      where: { id, candidate: { companyId: user.companyId } },
    });
    if (!existing) throw new NotFoundException('Scorecard not found');

    if (existing.evaluatorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own scorecard');
    }

    await this.prisma.interviewEvaluation.delete({ where: { id } });
    return { message: 'Scorecard deleted' };
  }
}
