import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateJobDto,
  UpdateJobDto,
  QueryJobsDto,
  ReplaceJobStagesDto,
} from './dto';
import { Prisma } from '@prisma/client';
import { QueueService } from '../queue/queue.service';
import {
  CLOSED_STATUSES,
  StageBlueprint,
  effectiveStage,
  stageCategory,
  validateStageInputs,
} from '../common/pipeline-stage.util';
import { PipelineTemplatesService } from '../pipeline-templates/pipeline-templates.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private pipelineTemplates: PipelineTemplatesService,
    @Optional() @Inject(QueueService) private queueService?: QueueService,
  ) {}

  async create(dto: CreateJobDto, companyId: string) {
    // Resolve the pipeline first so a bad template/stage list fails before
    // the job is created.
    const stages = dto.stages?.length
      ? validateStageInputs(dto.stages)
      : await this.pipelineTemplates.resolveStages(companyId, dto.templateId);

    const job = await this.prisma.job.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status || 'DRAFT',
        experienceLevel: dto.experienceLevel || 'JUNIOR',
        requiredSkills: dto.requiredSkills || [],
        preferredSkills: dto.preferredSkills || [],
        requirements: dto.requirements || {},
        companyId,
      },
      include: {
        _count: {
          select: { candidates: true },
        },
      },
    });

    await this.createPipelineStages(job.id, stages);

    return this.formatJobResponse(job);
  }

  async findAll(companyId: string, query: QueryJobsDto) {
    const { status, experienceLevel, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = {
      companyId,
      ...(status && { status }),
      ...(experienceLevel && { experienceLevel }),
    };

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: {
          _count: {
            select: { candidates: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: jobs.map(this.formatJobResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(jobId: string, companyId: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        companyId,
      },
      include: {
        _count: {
          select: { candidates: true },
        },
        pipelineStages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return {
      ...this.formatJobResponse(job),
      // Pre-backfill stages have no stored category; derive it by name.
      pipelineStages: job.pipelineStages.map((s) => ({
        ...s,
        category: stageCategory(s),
      })),
    };
  }

  /**
   * Board data for the job pipeline view: stages plus each open candidate
   * placed in the stage resolved from Candidate.status, with the interviewers
   * assigned to that stage and how much of their feedback is in.
   */
  async getPipeline(jobId: string, companyId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: { pipelineStages: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const candidates = await this.prisma.candidate.findMany({
      where: { jobId, companyId },
      select: {
        id: true,
        fullName: true,
        status: true,
        overallScore: true,
        currentStageId: true,
      },
      orderBy: [{ overallScore: 'desc' }, { createdAt: 'desc' }],
    });

    const stages = job.pipelineStages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      orderIndex: s.orderIndex,
      category: stageCategory(s),
    }));

    // Rejected/withdrawn candidates sit in a closed lane, not a column.
    const placed = candidates
      .filter((c) => !CLOSED_STATUSES.includes(c.status))
      .map((c) => ({ candidate: c, stage: effectiveStage(c, stages) }))
      .filter((p) => p.stage !== null);
    const closedCount = candidates.length - placed.length;

    const candidateIds = placed.map((p) => p.candidate.id);
    const [assignments, feedback] = candidateIds.length
      ? await Promise.all([
          this.prisma.candidateStageInterviewer.findMany({
            where: { candidateId: { in: candidateIds } },
            select: {
              candidateId: true,
              stageId: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'asc' },
          }),
          this.prisma.interviewFeedback.findMany({
            where: { candidateId: { in: candidateIds } },
            select: { candidateId: true, stageId: true, interviewerId: true },
          }),
        ])
      : [[], []];

    const key = (candidateId: string, stageId: string) =>
      `${candidateId}:${stageId}`;
    const interviewersByKey = new Map<
      string,
      { id: string; firstName: string; lastName: string }[]
    >();
    for (const a of assignments) {
      const k = key(a.candidateId, a.stageId);
      interviewersByKey.set(k, [...(interviewersByKey.get(k) ?? []), a.user]);
    }
    const submittersByKey = new Map<string, Set<string>>();
    for (const f of feedback) {
      const k = key(f.candidateId, f.stageId);
      const set = submittersByKey.get(k) ?? new Set<string>();
      set.add(f.interviewerId);
      submittersByKey.set(k, set);
    }

    return {
      jobId: job.id,
      stages,
      closedCount,
      candidates: placed.map(({ candidate, stage }) => {
        const k = key(candidate.id, stage!.id);
        const interviewers = interviewersByKey.get(k) ?? [];
        const submitters = submittersByKey.get(k) ?? new Set<string>();
        return {
          id: candidate.id,
          fullName: candidate.fullName,
          status: candidate.status,
          overallScore: candidate.overallScore,
          stageId: stage!.id,
          interviewers,
          feedbackCount: submitters.size,
          pendingFeedbackCount: interviewers.filter(
            (i) => !submitters.has(i.id),
          ).length,
        };
      }),
    };
  }

  /**
   * Replaces a job's pipeline with `dto.stages` (in order). Existing stages
   * (matched by id) are updated in place so candidates, feedback and
   * assignments keep pointing at them. Removed stages are deleted only when
   * nothing references them — feedback cascades on stage delete, so we
   * refuse rather than lose it.
   */
  async replaceStages(
    jobId: string,
    dto: ReplaceJobStagesDto,
    companyId: string,
  ) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: { pipelineStages: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const input = validateStageInputs(dto.stages);
    const existingById = new Map(job.pipelineStages.map((s) => [s.id, s]));
    for (const s of input) {
      if (s.id && !existingById.has(s.id)) {
        throw new BadRequestException(
          `Stage ${s.id} does not belong to this job`,
        );
      }
    }
    const keptIds = new Set(input.filter((s) => s.id).map((s) => s.id!));
    const removed = job.pipelineStages.filter((s) => !keptIds.has(s.id));

    if (removed.length) {
      const removedIds = removed.map((s) => s.id);
      const [inStage, feedback, assignments, history] = await Promise.all([
        this.prisma.candidate.groupBy({
          by: ['currentStageId'],
          where: { currentStageId: { in: removedIds } },
          _count: { _all: true },
        }),
        this.prisma.interviewFeedback.groupBy({
          by: ['stageId'],
          where: { stageId: { in: removedIds } },
          _count: { _all: true },
        }),
        this.prisma.candidateStageInterviewer.groupBy({
          by: ['stageId'],
          where: { stageId: { in: removedIds } },
          _count: { _all: true },
        }),
        this.prisma.candidateStage.groupBy({
          by: ['stageId'],
          where: { stageId: { in: removedIds } },
          _count: { _all: true },
        }),
      ]);
      const count = (
        rows: { _count: { _all: number } }[],
        key: (r: any) => string | null,
        id: string,
      ) => rows.find((r) => key(r) === id)?._count._all ?? 0;

      const blocked = removed
        .map((s) => {
          const parts: string[] = [];
          const c = count(inStage, (r) => r.currentStageId, s.id);
          const f = count(feedback, (r) => r.stageId, s.id);
          const a = count(assignments, (r) => r.stageId, s.id);
          const h = count(history, (r) => r.stageId, s.id);
          if (c) parts.push(`${c} candidate${c === 1 ? '' : 's'}`);
          if (f) parts.push(`${f} feedback entr${f === 1 ? 'y' : 'ies'}`);
          if (a) parts.push(`${a} interviewer assignment${a === 1 ? '' : 's'}`);
          if (h && !c) parts.push(`stage history for ${h} move${h === 1 ? '' : 's'}`);
          return parts.length ? `"${s.name}" has ${parts.join(', ')}` : null;
        })
        .filter((m): m is string => m !== null);

      if (blocked.length) {
        throw new ConflictException(
          `Can't remove stages that are in use: ${blocked.join('; ')}. Rename them or move candidates out first.`,
        );
      }
    }

    await this.prisma.$transaction([
      ...(removed.length
        ? [
            this.prisma.pipelineStage.deleteMany({
              where: { id: { in: removed.map((s) => s.id) } },
            }),
          ]
        : []),
      ...input.map((s, index) => {
        const data = {
          name: s.name,
          category: s.category,
          color: s.color,
          orderIndex: index,
          isDefault: index === 0,
        };
        return s.id
          ? this.prisma.pipelineStage.update({ where: { id: s.id }, data })
          : this.prisma.pipelineStage.create({ data: { ...data, jobId } });
      }),
    ]);

    return this.prisma.pipelineStage.findMany({
      where: { jobId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async update(jobId: string, dto: UpdateJobDto, companyId: string) {
    // Check if job exists and belongs to company
    const existingJob = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!existingJob) {
      throw new NotFoundException('Job not found');
    }

    // Check if requirements are changing
    const requirementsChanged =
      dto.requiredSkills !== undefined ||
      dto.preferredSkills !== undefined ||
      dto.experienceLevel !== undefined ||
      dto.requirements !== undefined;

    const job = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.experienceLevel && { experienceLevel: dto.experienceLevel }),
        ...(dto.requiredSkills && { requiredSkills: dto.requiredSkills }),
        ...(dto.preferredSkills && { preferredSkills: dto.preferredSkills }),
        ...(dto.requirements && { requirements: dto.requirements }),
      },
      include: {
        _count: {
          select: { candidates: true },
        },
      },
    });

    // Trigger re-scoring of candidates if requirements changed
    if (requirementsChanged) {
      await this.triggerRescoring(jobId);
    }

    return this.formatJobResponse(job);
  }

  /**
   * Trigger re-scoring of all candidates for a job
   */
  private async triggerRescoring(jobId: string) {
    // Get all candidates assigned to this job
    const candidates = await this.prisma.candidate.findMany({
      where: { jobId },
      select: { id: true },
    });

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Triggering re-scoring for ${candidates.length} candidates on job ${jobId}`,
    );

    // Use queue if available, otherwise log for manual handling
    if (this.queueService) {
      const scoringJobs = candidates.map((c) => ({
        candidateId: c.id,
        jobId,
      }));
      await this.queueService.addBulkScoringJobs(scoringJobs);
      this.logger.log(`Added ${candidates.length} re-scoring jobs to queue`);
    } else {
      // Log that re-scoring is needed but queue is not available
      this.logger.warn(
        `Queue service not available. ${candidates.length} candidates need re-scoring for job ${jobId}`,
      );
    }
  }

  async remove(jobId: string, companyId: string) {
    // Check if job exists and belongs to company
    const existingJob = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!existingJob) {
      throw new NotFoundException('Job not found');
    }

    // Soft delete by setting status to CLOSED
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'CLOSED' },
    });

    return { message: 'Job closed successfully' };
  }

  async getJobStats(companyId: string) {
    const [total, byStatus, byLevel] = await Promise.all([
      this.prisma.job.count({ where: { companyId } }),
      this.prisma.job.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['experienceLevel'],
        where: { companyId },
        _count: true,
      }),
    ]);

    const statusMap = byStatus.reduce(
      (acc, item) => {
        acc[item.status.toLowerCase()] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    const levelMap = byLevel.reduce(
      (acc, item) => {
        acc[item.experienceLevel.toLowerCase()] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      byStatus: {
        draft: statusMap['draft'] || 0,
        active: statusMap['active'] || 0,
        paused: statusMap['paused'] || 0,
        closed: statusMap['closed'] || 0,
      },
      byExperienceLevel: {
        junior: levelMap['junior'] || 0,
        mid: levelMap['mid'] || 0,
        senior: levelMap['senior'] || 0,
        lead: levelMap['lead'] || 0,
      },
    };
  }

  private async createPipelineStages(jobId: string, stages: StageBlueprint[]) {
    await this.prisma.pipelineStage.createMany({
      data: stages.map((stage, index) => ({
        name: stage.name,
        category: stage.category,
        color: stage.color,
        orderIndex: index,
        isDefault: index === 0,
        jobId,
      })),
    });
  }

  private formatJobResponse(job: any) {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      status: job.status,
      experienceLevel: job.experienceLevel,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      requirements: job.requirements,
      candidateCount: job._count?.candidates || 0,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
