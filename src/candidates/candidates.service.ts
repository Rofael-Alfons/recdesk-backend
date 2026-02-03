import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  QueryCandidatesDto,
  BulkUpdateStatusDto,
  BulkAddTagsDto,
  BulkAssignJobDto,
  RescoreCandidateDto,
} from './dto';
import { Prisma } from '@prisma/client';
import { QueueService } from '../queue/queue.service';
import { AiService, ParsedCVData } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private storageService: StorageService,
    @Optional() private queueService?: QueueService,
  ) { }

  async create(dto: CreateCandidateDto, companyId: string) {
    // Check for duplicate email if provided
    if (dto.email) {
      const existing = await this.prisma.candidate.findFirst({
        where: {
          companyId,
          email: dto.email.toLowerCase(),
        },
      });

      if (existing) {
        throw new BadRequestException('A candidate with this email already exists');
      }
    }

    // Verify job belongs to company if provided
    if (dto.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: dto.jobId, companyId },
      });
      if (!job) {
        throw new BadRequestException('Job not found');
      }
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        fullName: dto.fullName,
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        location: dto.location,
        linkedinUrl: dto.linkedinUrl,
        githubUrl: dto.githubUrl,
        portfolioUrl: dto.portfolioUrl,
        source: dto.source || 'MANUAL',
        status: dto.status || 'NEW',
        tags: dto.tags || [],
        cvFileUrl: '', // Will be updated when CV is uploaded
        companyId,
        jobId: dto.jobId,
      },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    return this.formatCandidateResponse(candidate, false);
  }

  async findAll(companyId: string, query: QueryCandidatesDto) {
    const {
      status,
      source,
      jobId,
      minScore,
      maxScore,
      search,
      tag,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.CandidateWhereInput = {
      companyId,
      ...(status && { status }),
      ...(source && { source }),
      ...(jobId && { jobId }),
      ...(minScore !== undefined && { overallScore: { gte: minScore } }),
      ...(maxScore !== undefined && { overallScore: { lte: maxScore } }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.CandidateOrderByWithRelationInput = {};
    if (sortBy === 'score') {
      orderBy.overallScore = sortOrder;
    } else if (sortBy === 'name') {
      orderBy.fullName = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [candidates, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        include: {
          job: { select: { id: true, title: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    // Format candidates without signed URLs for list view (performance)
    const formattedCandidates = await Promise.all(
      candidates.map((c) => this.formatCandidateResponse(c, false)),
    );

    return {
      data: formattedCandidates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(candidateId: string, companyId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      include: {
        job: { select: { id: true, title: true, status: true } },
        scores: {
          include: { job: { select: { id: true, title: true } } },
          orderBy: { scoredAt: 'desc' },
        },
        notes: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        stageHistory: {
          include: { stage: true },
          orderBy: { movedAt: 'desc' },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Include signed URL for detail view
    const formatted = await this.formatCandidateResponse(candidate, true);

    return {
      ...formatted,
      scores: candidate.scores,
      notes: candidate.notes,
      stageHistory: candidate.stageHistory,
    };
  }

  async update(candidateId: string, dto: UpdateCandidateDto, companyId: string) {
    const existing = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Candidate not found');
    }

    // Check for duplicate email if changing
    if (dto.email && dto.email.toLowerCase() !== existing.email?.toLowerCase()) {
      const duplicate = await this.prisma.candidate.findFirst({
        where: {
          companyId,
          email: dto.email.toLowerCase(),
          id: { not: candidateId },
        },
      });

      if (duplicate) {
        throw new BadRequestException('A candidate with this email already exists');
      }
    }

    // Verify job belongs to company if changing
    if (dto.jobId && dto.jobId !== existing.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: dto.jobId, companyId },
      });
      if (!job) {
        throw new BadRequestException('Job not found');
      }
    }

    const candidate = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
        ...(dto.githubUrl !== undefined && { githubUrl: dto.githubUrl }),
        ...(dto.portfolioUrl !== undefined && { portfolioUrl: dto.portfolioUrl }),
        ...(dto.source && { source: dto.source }),
        ...(dto.status && { status: dto.status }),
        ...(dto.jobId !== undefined && { jobId: dto.jobId }),
        ...(dto.tags && { tags: dto.tags }),
      },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    return this.formatCandidateResponse(candidate, false);
  }

  async remove(candidateId: string, companyId: string) {
    const existing = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Candidate not found');
    }

    await this.prisma.candidate.delete({
      where: { id: candidateId },
    });

    return { message: 'Candidate deleted successfully' };
  }

  async bulkUpdateStatus(dto: BulkUpdateStatusDto, companyId: string, userId: string) {
    // Verify all candidates belong to company
    const candidates = await this.prisma.candidate.findMany({
      where: {
        id: { in: dto.candidateIds },
        companyId,
      },
      select: { id: true },
    });

    if (candidates.length !== dto.candidateIds.length) {
      throw new BadRequestException('Some candidates were not found');
    }

    await this.prisma.$transaction([
      this.prisma.candidate.updateMany({
        where: { id: { in: dto.candidateIds } },
        data: { status: dto.status },
      }),
      this.prisma.candidateAction.createMany({
        data: dto.candidateIds.map((candidateId) => ({
          candidateId,
          userId,
          action: 'status_changed',
          details: { newStatus: dto.status },
        })),
      }),
    ]);

    return {
      message: `Updated ${candidates.length} candidates to status: ${dto.status}`,
      updatedCount: candidates.length,
    };
  }

  async bulkAddTags(dto: BulkAddTagsDto, companyId: string) {
    const candidates = await this.prisma.candidate.findMany({
      where: {
        id: { in: dto.candidateIds },
        companyId,
      },
      select: { id: true, tags: true },
    });

    if (candidates.length !== dto.candidateIds.length) {
      throw new BadRequestException('Some candidates were not found');
    }

    // Update each candidate with merged tags
    await Promise.all(
      candidates.map((candidate) => {
        const mergedTags = [...new Set([...candidate.tags, ...dto.tags])];
        return this.prisma.candidate.update({
          where: { id: candidate.id },
          data: { tags: mergedTags },
        });
      }),
    );

    return {
      message: `Added tags to ${candidates.length} candidates`,
      updatedCount: candidates.length,
    };
  }

  async bulkAssignJob(dto: BulkAssignJobDto, companyId: string, userId: string) {
    // Verify job belongs to company
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, companyId },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    const candidates = await this.prisma.candidate.findMany({
      where: {
        id: { in: dto.candidateIds },
        companyId,
      },
      select: { id: true },
    });

    if (candidates.length !== dto.candidateIds.length) {
      throw new BadRequestException('Some candidates were not found');
    }

    await this.prisma.$transaction([
      this.prisma.candidate.updateMany({
        where: { id: { in: dto.candidateIds } },
        data: { jobId: dto.jobId },
      }),
      this.prisma.candidateAction.createMany({
        data: dto.candidateIds.map((candidateId) => ({
          candidateId,
          userId,
          action: 'assigned_to_job',
          details: { jobId: dto.jobId, jobTitle: job.title },
        })),
      }),
    ]);

    return {
      message: `Assigned ${candidates.length} candidates to job: ${job.title}`,
      updatedCount: candidates.length,
    };
  }

  async getStats(companyId: string) {
    const [total, byStatus, bySource, avgScore, recentCount] = await Promise.all([
      this.prisma.candidate.count({ where: { companyId } }),
      this.prisma.candidate.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      this.prisma.candidate.groupBy({
        by: ['source'],
        where: { companyId },
        _count: true,
      }),
      this.prisma.candidate.aggregate({
        where: { companyId, overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
      this.prisma.candidate.count({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total,
      recentWeek: recentCount,
      averageScore: avgScore._avg.overallScore
        ? Math.round(avgScore._avg.overallScore)
        : null,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status.toLowerCase()] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      bySource: bySource.reduce(
        (acc, item) => {
          acc[item.source.toLowerCase()] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  async addNote(
    candidateId: string,
    content: string,
    companyId: string,
    userId: string,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    const note = await this.prisma.candidateNote.create({
      data: {
        content,
        candidateId,
        userId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return note;
  }

  async rescoreForJob(
    candidateId: string,
    dto: RescoreCandidateDto,
    companyId: string,
  ) {
    // Verify candidate exists and belongs to company
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Verify job exists and belongs to company
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, companyId },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    // Check if job is in a scoreable state (OPEN or PAUSED)
    if (job.status === 'CLOSED' || job.status === 'DRAFT') {
      throw new BadRequestException(
        `Cannot score against a ${job.status.toLowerCase()} job`,
      );
    }

    // If QueueService is available, use it; otherwise do synchronous scoring
    if (this.queueService) {
      await this.queueService.addScoringJob({
        candidateId,
        jobId: dto.jobId,
      });

      return {
        message: 'Scoring job queued successfully',
        candidateId,
        jobId: dto.jobId,
        jobTitle: job.title,
      };
    }

    // Synchronous scoring (when Redis/Queue is not available)
    this.logger.log(
      `Scoring candidate ${candidateId} for job ${dto.jobId} synchronously`,
    );

    const parsedData: ParsedCVData = {
      personalInfo: {
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
        linkedinUrl: candidate.linkedinUrl,
        githubUrl: candidate.githubUrl,
        portfolioUrl: candidate.portfolioUrl,
      },
      education: (candidate.education as ParsedCVData['education']) || [],
      experience: (candidate.experience as ParsedCVData['experience']) || [],
      skills: (candidate.skills as string[]) || [],
      projects: (candidate.projects as ParsedCVData['projects']) || [],
      certifications:
        (candidate.certifications as ParsedCVData['certifications']) || [],
      languages: (candidate.languages as ParsedCVData['languages']) || [],
      summary: null,
    };

    const requirements = {
      title: job.title,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      experienceLevel: job.experienceLevel,
      requirements: (job.requirements as Record<string, unknown>) || {},
    };

    const scoreResult = await this.aiService.scoreCandidate(
      parsedData,
      requirements,
    );

    // Upsert the score
    await this.prisma.candidateScore.upsert({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId: dto.jobId,
        },
      },
      update: {
        overallScore: scoreResult.overallScore,
        skillsMatchScore: scoreResult.skillsMatchScore,
        experienceScore: scoreResult.experienceScore,
        educationScore: scoreResult.educationScore,
        growthScore: scoreResult.growthScore,
        bonusScore: scoreResult.bonusScore,
        scoreExplanation: scoreResult.scoreExplanation || undefined,
        recommendation: scoreResult.recommendation,
        scoredAt: new Date(),
      },
      create: {
        candidateId,
        jobId: dto.jobId,
        overallScore: scoreResult.overallScore,
        skillsMatchScore: scoreResult.skillsMatchScore,
        experienceScore: scoreResult.experienceScore,
        educationScore: scoreResult.educationScore,
        growthScore: scoreResult.growthScore,
        bonusScore: scoreResult.bonusScore,
        scoreExplanation: scoreResult.scoreExplanation || undefined,
        recommendation: scoreResult.recommendation,
      },
    });

    // Update overall score on candidate if this is their assigned job
    if (candidate.jobId === dto.jobId) {
      await this.prisma.candidate.update({
        where: { id: candidateId },
        data: {
          overallScore: scoreResult.overallScore,
          scoreBreakdown: scoreResult.scoreExplanation || undefined,
        },
      });
    }

    return {
      message: 'Candidate scored successfully',
      candidateId,
      jobId: dto.jobId,
      jobTitle: job.title,
      score: scoreResult.overallScore,
    };
  }

  /**
   * Format candidate response with optional signed URL for CV file
   * @param candidate - The candidate object from database
   * @param includeSignedUrl - Whether to generate a signed URL for the CV file
   */
  private async formatCandidateResponse(
    candidate: any,
    includeSignedUrl: boolean = false,
  ) {
    let cvFileSignedUrl: string | null = null;

    // Generate signed URL for CV file if requested and file exists
    if (includeSignedUrl && candidate.cvFileUrl) {
      try {
        cvFileSignedUrl = await this.storageService.getSignedUrl(
          candidate.cvFileUrl,
          3600, // 1 hour expiry
        );
      } catch (error) {
        this.logger.warn(
          `Failed to generate signed URL for candidate ${candidate.id}: ${error}`,
        );
        // Fall back to the stored URL (works for local storage)
        cvFileSignedUrl = candidate.cvFileUrl;
      }
    }

    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      linkedinUrl: candidate.linkedinUrl,
      githubUrl: candidate.githubUrl,
      portfolioUrl: candidate.portfolioUrl,
      source: candidate.source,
      status: candidate.status,
      cvFileUrl: candidate.cvFileUrl,
      cvFileSignedUrl, // Presigned URL for secure access
      cvFileName: candidate.cvFileName,
      overallScore: candidate.overallScore,
      aiSummary: candidate.aiSummary,
      tags: candidate.tags,
      job: candidate.job,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      // Parsed CV data fields
      education: candidate.education,
      experience: candidate.experience,
      skills: candidate.skills,
      projects: candidate.projects,
      certifications: candidate.certifications,
      languages: candidate.languages,
    };
  }

  /**
   * Get a signed URL for a candidate's CV file
   */
  async getCvSignedUrl(candidateId: string, companyId: string): Promise<string> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      select: { cvFileUrl: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    if (!candidate.cvFileUrl) {
      throw new BadRequestException('Candidate does not have a CV file');
    }

    return this.storageService.getSignedUrl(candidate.cvFileUrl, 3600);
  }
}
