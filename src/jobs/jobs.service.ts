import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto';
import { Prisma } from '@prisma/client';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(QueueService) private queueService?: QueueService,
  ) {}

  async create(dto: CreateJobDto, companyId: string) {
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

    // Create default pipeline stages for the job
    await this.createDefaultPipelineStages(job.id);

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
      pipelineStages: job.pipelineStages,
    };
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

  private async createDefaultPipelineStages(jobId: string) {
    const defaultStages = [
      { name: 'New', orderIndex: 0, color: '#6B7280', isDefault: true },
      { name: 'Screening', orderIndex: 1, color: '#3B82F6', isDefault: false },
      { name: 'Interview', orderIndex: 2, color: '#8B5CF6', isDefault: false },
      { name: 'Offer', orderIndex: 3, color: '#10B981', isDefault: false },
      { name: 'Hired', orderIndex: 4, color: '#059669', isDefault: false },
    ];

    await this.prisma.pipelineStage.createMany({
      data: defaultStages.map((stage) => ({
        ...stage,
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
