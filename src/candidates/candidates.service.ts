import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Inject,
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
  BulkDeleteDto,
  BulkExportDto,
  BulkRejectDto,
  BulkRemoveTagsDto,
  RescoreCandidateDto,
} from './dto';
import { CandidateStatus, Prisma } from '@prisma/client';
import {
  CLOSED_STATUSES,
  categoryForStatus,
  effectiveStage,
  stageCategory,
  stageForStatus,
  statusForStage,
} from '../common/pipeline-stage.util';
import { CandidateSelectionService } from './selection/candidate-selection.service';
import { MAX_BULK } from './selection/candidate-selection.dto';
import {
  ScheduledEmailsService,
  SCHEDULED_EMAIL_PURPOSE,
} from '../email-sending/scheduled-emails.service';
import { QueueService } from '../queue/queue.service';
import { AiService, ParsedCVData } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { PHOTO_SIGNED_URL_TTL_SECONDS } from '../document-requests/document-requests.constants';
import { recordCandidateScoreHistory } from '../common/candidate-score-history.util';
import {
  buildCandidateOrderBy,
  buildCandidateWhere,
} from './candidate-where.builder';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface CandidateFilterOptions {
  countries: FilterOption[];
  regions: FilterOption[];
  cities: FilterOption[];
  universities: FilterOption[];
  skills: FilterOption[];
  languages: FilterOption[];
  tags: FilterOption[];
  genderEnabled: boolean;
}

const FILTER_OPTION_LIMIT = 200;
const SKILL_OPTION_LIMIT = 300;
const UNIVERSITY_OPTION_LIMIT = 100;

// Fixed SQL fragments (never user input) for the plain-column facets.
const FACET_COLUMN_SQL = {
  country: Prisma.sql`c.country`,
  region: Prisma.sql`c.region`,
  city: Prisma.sql`c.city`,
  university: Prisma.sql`c.university`,
};

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private storageService: StorageService,
    private candidateSelection: CandidateSelectionService,
    private scheduledEmails: ScheduledEmailsService,
    @Optional() @Inject(QueueService) private queueService?: QueueService,
  ) { }

  /**
   * Gender is sensitive data. It is opt-in per tenant, so both reads and
   * writes are gated on the company's current setting: a company that turns
   * the setting back off immediately stops seeing previously stored values.
   */
  private async isGenderCollectionEnabled(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { collectGenderData: true },
    });

    return company?.collectGenderData ?? false;
  }

  async create(dto: CreateCandidateDto, companyId: string) {
    const genderEnabled = await this.isGenderCollectionEnabled(companyId);
    if (dto.gender !== undefined && !genderEnabled) {
      throw new BadRequestException(
        'Gender collection is not enabled for this company',
      );
    }

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
        country: dto.country,
        region: dto.region,
        city: dto.city,
        gender: dto.gender,
        linkedinUrl: dto.linkedinUrl,
        githubUrl: dto.githubUrl,
        portfolioUrl: dto.portfolioUrl,
        source: dto.source || 'MANUAL',
        sourceChannel: dto.sourceChannel,
        sourceDetail: dto.sourceDetail,
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

    return this.formatCandidateResponse(candidate, false, genderEnabled);
  }

  async findAll(companyId: string, query: QueryCandidatesDto) {
    const {
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
      ...filters
    } = query;

    const skip = (page - 1) * limit;

    const genderEnabled = await this.isGenderCollectionEnabled(companyId);
    const where = buildCandidateWhere(companyId, filters, genderEnabled);

    const orderBy = buildCandidateOrderBy(sortBy, sortOrder);

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
      candidates.map((c) =>
        this.formatCandidateResponse(c, false, genderEnabled),
      ),
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

  /**
   * Facet values actually present in this company's candidates, with counts,
   * so the filter panel never offers a value that returns zero rows. Values
   * are what the filter matches on; labels are what the recruiter sees.
   */
  async getFilterOptions(companyId: string): Promise<CandidateFilterOptions> {
    const [countries, regions, cities, universities, skills, languages, tags, genderEnabled] =
      await Promise.all([
        this.countByColumn(companyId, 'country', FILTER_OPTION_LIMIT),
        this.countByColumn(companyId, 'region', FILTER_OPTION_LIMIT),
        this.countByColumn(companyId, 'city', FILTER_OPTION_LIMIT),
        this.countByColumn(companyId, 'university', UNIVERSITY_OPTION_LIMIT),
        this.skillOptions(companyId),
        this.languageOptions(companyId),
        this.tagOptions(companyId),
        this.isGenderCollectionEnabled(companyId),
      ]);

    return { countries, regions, cities, universities, skills, languages, tags, genderEnabled };
  }

  private countByColumn(
    companyId: string,
    column: keyof typeof FACET_COLUMN_SQL,
    take: number,
  ): Promise<FilterOption[]> {
    const col = FACET_COLUMN_SQL[column];
    return this.prisma.$queryRaw<FilterOption[]>`
      SELECT ${col} AS value, ${col} AS label, COUNT(*)::int AS count
      FROM candidates c
      WHERE c."companyId" = ${companyId} AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col}
      ORDER BY count DESC, value ASC
      LIMIT ${take}
    `;
  }

  // Counts come from skillsNormalized (what the filter matches); the label is
  // the most common original spelling in the parsed JSON, e.g. "Node.js".
  // The whitespace/lowercase/100-char rule mirrors normalizeFacetValue.
  private skillOptions(companyId: string): Promise<FilterOption[]> {
    return this.prisma.$queryRaw<FilterOption[]>`
      WITH counts AS (
        SELECT s AS value, COUNT(*)::int AS count
        FROM candidates c, unnest(c."skillsNormalized") AS s
        WHERE c."companyId" = ${companyId}
        GROUP BY s
        ORDER BY count DESC, s ASC
        LIMIT ${SKILL_OPTION_LIMIT}
      ),
      spellings AS (
        SELECT btrim(regexp_replace(e, '\\s+', ' ', 'g')) AS original
        FROM candidates c,
          jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(c.skills) = 'array' THEN c.skills ELSE '[]'::jsonb END
          ) AS e
        WHERE c."companyId" = ${companyId}
      ),
      labels AS (
        SELECT lower(left(original, 100)) AS value,
          mode() WITHIN GROUP (ORDER BY original) AS label
        FROM spellings
        WHERE original <> ''
        GROUP BY 1
      )
      SELECT counts.value, COALESCE(labels.label, counts.value) AS label, counts.count
      FROM counts LEFT JOIN labels USING (value)
      ORDER BY counts.count DESC, counts.value ASC
    `;
  }

  private languageOptions(companyId: string): Promise<FilterOption[]> {
    return this.prisma.$queryRaw<FilterOption[]>`
      WITH counts AS (
        SELECT l AS value, COUNT(DISTINCT c.id)::int AS count
        FROM candidates c, unnest(c."languageNames") AS l
        WHERE c."companyId" = ${companyId}
        GROUP BY l
        ORDER BY count DESC, l ASC
        LIMIT ${FILTER_OPTION_LIMIT}
      ),
      spellings AS (
        SELECT btrim(regexp_replace(e->>'language', '\\s+', ' ', 'g')) AS original
        FROM candidates c,
          jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.languages) = 'array' THEN c.languages ELSE '[]'::jsonb END
          ) AS e
        WHERE c."companyId" = ${companyId} AND jsonb_typeof(e) = 'object'
      ),
      labels AS (
        SELECT lower(left(original, 100)) AS value,
          mode() WITHIN GROUP (ORDER BY original) AS label
        FROM spellings
        WHERE original <> ''
        GROUP BY 1
      )
      SELECT counts.value, COALESCE(labels.label, counts.value) AS label, counts.count
      FROM counts LEFT JOIN labels USING (value)
      ORDER BY counts.count DESC, counts.value ASC
    `;
  }

  private tagOptions(companyId: string): Promise<FilterOption[]> {
    return this.prisma.$queryRaw<FilterOption[]>`
      SELECT t AS value, t AS label, COUNT(DISTINCT c.id)::int AS count
      FROM candidates c, unnest(c.tags) AS t
      WHERE c."companyId" = ${companyId} AND t <> ''
      GROUP BY t
      ORDER BY count DESC, t ASC
      LIMIT ${FILTER_OPTION_LIMIT}
    `;
  }

  async findOne(candidateId: string, companyId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            pipelineStages: { orderBy: { orderIndex: 'asc' } },
          },
        },
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
        referredBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Include signed URL for detail view
    const formatted = await this.formatCandidateResponse(
      candidate,
      true,
      await this.isGenderCollectionEnabled(companyId),
    );

    const stages = (candidate.job?.pipelineStages ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      orderIndex: s.orderIndex,
      category: stageCategory(s),
    }));

    return {
      ...formatted,
      job: candidate.job
        ? {
            id: candidate.job.id,
            title: candidate.job.title,
            status: candidate.job.status,
            pipelineStages: stages,
          }
        : null,
      // The pipeline stage the candidate is in (stored, else derived from
      // status). Kept for rejected/withdrawn too: "rejected at X".
      currentStage: candidate.job ? effectiveStage(candidate, stages) : null,
      scores: candidate.scores,
      notes: candidate.notes,
      stageHistory: candidate.stageHistory,
      // Null for non-referrals, and for referrals whose referrer was deleted
      // (referralCode is kept in that case).
      referredBy: candidate.referredBy,
      referralCode: candidate.referralCode,
    };
  }

  async update(candidateId: string, dto: UpdateCandidateDto, companyId: string) {
    const existing = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });

    if (!existing) {
      throw new NotFoundException('Candidate not found');
    }

    const genderEnabled = await this.isGenderCollectionEnabled(companyId);
    if (dto.gender !== undefined && !genderEnabled) {
      throw new BadRequestException(
        'Gender collection is not enabled for this company',
      );
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

    // Reports — record the moment a candidate first reaches HIRED. Guarded
    // against both the DTO status already being HIRED-to-HIRED (no-op save)
    // and an existing hiredAt (never overwritten on later edits).
    const isNewlyHired =
      dto.status === 'HIRED' && existing.status !== 'HIRED' && !existing.hiredAt;

    const leavesRejected =
      !!dto.status && dto.status !== 'REJECTED' && existing.status === 'REJECTED';

    // Keep the pipeline position consistent with a job or status change.
    const jobChanged = dto.jobId !== undefined && dto.jobId !== existing.jobId;
    const nextStatus = dto.status ?? existing.status;
    let nextStageId: string | null | undefined;
    if (jobChanged) {
      nextStageId = dto.jobId
        ? (await this.stageSyncForJob([{ ...existing, status: nextStatus }], dto.jobId))
            .get(candidateId) ?? null
        : null;
    } else if (dto.status && dto.status !== existing.status) {
      const moves = await this.stageSyncForStatus([existing], dto.status);
      nextStageId = moves.get(candidateId);
    }

    const candidate = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...(nextStageId !== undefined && { currentStageId: nextStageId }),
        ...(leavesRejected && { rejectionReason: null, rejectionNote: null }),
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
        ...(dto.githubUrl !== undefined && { githubUrl: dto.githubUrl }),
        ...(dto.portfolioUrl !== undefined && { portfolioUrl: dto.portfolioUrl }),
        ...(dto.source && { source: dto.source }),
        ...(dto.sourceChannel && { sourceChannel: dto.sourceChannel }),
        ...(dto.sourceDetail !== undefined && { sourceDetail: dto.sourceDetail }),
        ...(dto.status && { status: dto.status }),
        ...(isNewlyHired && { hiredAt: new Date() }),
        ...(dto.jobId !== undefined && { jobId: dto.jobId }),
        ...(dto.tags && { tags: dto.tags }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
      },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    if (leavesRejected) {
      await this.cancelRejectionEmails(companyId, [candidateId], null);
    }

    return this.formatCandidateResponse(candidate, false, genderEnabled);
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
    const ids = await this.candidateSelection.resolveIds(companyId, dto);
    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, companyId },
      select: {
        id: true,
        status: true,
        hiredAt: true,
        jobId: true,
        currentStageId: true,
      },
    });
    const stageMoves = await this.stageSyncForStatus(candidates, dto.status);

    // Reports — only candidates genuinely transitioning into HIRED get
    // hiredAt set; already-hired candidates re-saved as HIRED (a no-op
    // status-wise) keep their original hiredAt.
    const newlyHiredIds =
      dto.status === 'HIRED'
        ? candidates.filter((c) => c.status !== 'HIRED' && !c.hiredAt).map((c) => c.id)
        : [];
    const newlyHired = new Set(newlyHiredIds);
    const restIds = ids.filter((id) => !newlyHired.has(id));

    const leavesRejected = dto.status !== 'REJECTED';
    const unrejectedIds = leavesRejected
      ? candidates.filter((c) => c.status === 'REJECTED').map((c) => c.id)
      : [];
    const clearRejection = leavesRejected
      ? { rejectionReason: null, rejectionNote: null }
      : {};

    await this.prisma.$transaction([
      ...(newlyHiredIds.length
        ? [
            this.prisma.candidate.updateMany({
              where: { id: { in: newlyHiredIds } },
              data: { status: dto.status, hiredAt: new Date(), ...clearRejection },
            }),
          ]
        : []),
      ...(restIds.length
        ? [
            this.prisma.candidate.updateMany({
              where: { id: { in: restIds } },
              data: { status: dto.status, ...clearRejection },
            }),
          ]
        : []),
      this.prisma.candidateAction.createMany({
        data: ids.map((candidateId) => ({
          candidateId,
          userId,
          action: 'status_changed',
          details: { newStatus: dto.status },
        })),
      }),
      ...this.stageMoveOps(stageMoves),
    ]);

    await this.cancelRejectionEmails(companyId, unrejectedIds, userId);

    return {
      message: `Updated ${ids.length} candidates to status: ${dto.status}`,
      updatedCount: ids.length,
    };
  }

  /**
   * Reject with a reason, optionally scheduling a rejection email. The email
   * waits in scheduled_emails until `delayHours` have passed, so it can be
   * cancelled, and it is dropped automatically if the candidate is moved out
   * of REJECTED before then.
   */
  async bulkReject(dto: BulkRejectDto, companyId: string, userId: string) {
    const ids = await this.candidateSelection.resolveIds(companyId, dto);

    if (dto.email) {
      const template = await this.prisma.emailTemplate.findFirst({
        where: { id: dto.email.templateId, companyId },
        select: { id: true },
      });
      if (!template) throw new BadRequestException('Email template not found');
    }

    const note = dto.note?.trim() || null;
    await this.prisma.$transaction([
      this.prisma.candidate.updateMany({
        where: { id: { in: ids }, companyId },
        data: {
          status: 'REJECTED',
          rejectionReason: dto.reason,
          rejectionNote: note,
        },
      }),
      this.prisma.candidateAction.createMany({
        data: ids.map((candidateId) => ({
          candidateId,
          userId,
          action: 'status_changed',
          details: {
            newStatus: 'REJECTED',
            reason: dto.reason,
            ...(note && { note }),
          },
        })),
      }),
    ]);

    let emailsScheduled = 0;
    let skippedNoEmail = 0;
    let sendAt: Date | null = null;
    if (dto.email) {
      // Re-rejecting replaces a still-pending email rather than adding a
      // second one.
      await this.cancelRejectionEmails(companyId, ids, userId);
      const recipients = await this.prisma.candidate.findMany({
        where: {
          id: { in: ids },
          companyId,
          email: { not: null },
          NOT: { email: '' },
        },
        select: { id: true },
      });
      sendAt = new Date(Date.now() + dto.email.delayHours * 3_600_000);
      emailsScheduled = await this.scheduledEmails.schedule(
        recipients.map((candidate) => ({
          companyId,
          candidateId: candidate.id,
          templateId: dto.email!.templateId,
          purpose: SCHEDULED_EMAIL_PURPOSE.REJECTION,
          sendAt: sendAt!,
          createdById: userId,
        })),
      );
      skippedNoEmail = ids.length - recipients.length;
    }

    return {
      message: `Rejected ${ids.length} candidates`,
      updatedCount: ids.length,
      emailsScheduled,
      skippedNoEmail,
      sendAt,
    };
  }

  /**
   * Move a candidate to a stage of their job. Status follows the stage's
   * category (see statusForStage); moving a rejected/withdrawn candidate
   * reopens them. Records stage history and an audit action.
   */
  async moveToStage(
    candidateId: string,
    stageId: string,
    companyId: string,
    userId: string,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
      select: {
        id: true,
        jobId: true,
        status: true,
        hiredAt: true,
        currentStageId: true,
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (!candidate.jobId) {
      throw new BadRequestException(
        'Assign the candidate to a job before moving them through its pipeline',
      );
    }

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, jobId: candidate.jobId },
    });
    if (!stage) throw new NotFoundException('Stage not found for this job');

    const isClosed = CLOSED_STATUSES.includes(candidate.status);
    const newStatus = statusForStage(
      stage,
      isClosed ? undefined : candidate.status,
    );
    const isNewlyHired =
      newStatus === 'HIRED' && candidate.status !== 'HIRED' && !candidate.hiredAt;
    const leavesRejected = candidate.status === 'REJECTED';

    await this.prisma.$transaction([
      this.prisma.candidate.update({
        where: { id: candidateId },
        data: {
          currentStageId: stage.id,
          status: newStatus,
          ...(isNewlyHired && { hiredAt: new Date() }),
          ...(leavesRejected && { rejectionReason: null, rejectionNote: null }),
        },
      }),
      this.prisma.candidateStage.create({
        data: { candidateId, stageId: stage.id },
      }),
      this.prisma.candidateAction.create({
        data: {
          candidateId,
          userId,
          action: 'moved_to_stage',
          details: {
            fromStageId: candidate.currentStageId,
            toStageId: stage.id,
            stageName: stage.name,
            previousStatus: candidate.status,
            newStatus,
          },
        },
      }),
    ]);

    if (leavesRejected) {
      await this.cancelRejectionEmails(companyId, [candidateId], userId);
    }

    return {
      candidateId,
      status: newStatus,
      currentStage: {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        orderIndex: stage.orderIndex,
        category: stageCategory(stage),
      },
    };
  }

  /**
   * Stage changes needed so each candidate's pipeline position matches a new
   * status: candidates already in a stage of the status's category stay put;
   * others move to the first stage of that category. Closed statuses
   * (rejected/withdrawn) keep the stage. Returns candidateId -> new stageId.
   */
  private async stageSyncForStatus(
    candidates: {
      id: string;
      jobId: string | null;
      status: CandidateStatus;
      currentStageId: string | null;
    }[],
    newStatus: CandidateStatus,
  ): Promise<Map<string, string>> {
    const moves = new Map<string, string>();
    const category = categoryForStatus(newStatus);
    const withJob = candidates.filter((c) => c.jobId);
    if (!category || withJob.length === 0) return moves;

    const stagesByJob = await this.loadStagesByJob(withJob.map((c) => c.jobId!));
    for (const c of withJob) {
      const stages = stagesByJob.get(c.jobId!) ?? [];
      const current = effectiveStage(c, stages);
      // Already in the right kind of stage (e.g. SHORTLISTED in Screening).
      if (current && stageCategory(current) === category) continue;
      const target = stageForStatus(stages, newStatus);
      if (target && target.id !== c.currentStageId) moves.set(c.id, target.id);
    }
    return moves;
  }

  /** Starting stage for each candidate on `jobId`, based on their status. */
  private async stageSyncForJob(
    candidates: { id: string; status: CandidateStatus }[],
    jobId: string,
  ): Promise<Map<string, string>> {
    const moves = new Map<string, string>();
    if (candidates.length === 0) return moves;
    const stages = (await this.loadStagesByJob([jobId])).get(jobId) ?? [];
    for (const c of candidates) {
      const target = stageForStatus(stages, c.status);
      if (target) moves.set(c.id, target.id);
    }
    return moves;
  }

  private async loadStagesByJob(jobIds: string[]) {
    const stages = await this.prisma.pipelineStage.findMany({
      where: { jobId: { in: [...new Set(jobIds)] } },
      select: { id: true, name: true, orderIndex: true, category: true, jobId: true },
    });
    const byJob = new Map<string, typeof stages>();
    for (const s of stages) {
      byJob.set(s.jobId, [...(byJob.get(s.jobId) ?? []), s]);
    }
    return byJob;
  }

  /** Batched writes for stage moves: one updateMany per target stage + history. */
  private stageMoveOps(moves: Map<string, string>): Prisma.PrismaPromise<unknown>[] {
    if (moves.size === 0) return [];
    const byStage = new Map<string, string[]>();
    for (const [candidateId, stageId] of moves) {
      byStage.set(stageId, [...(byStage.get(stageId) ?? []), candidateId]);
    }
    return [
      ...[...byStage].map(([stageId, candidateIds]) =>
        this.prisma.candidate.updateMany({
          where: { id: { in: candidateIds } },
          data: { currentStageId: stageId },
        }),
      ),
      this.prisma.candidateStage.createMany({
        data: [...moves].map(([candidateId, stageId]) => ({ candidateId, stageId })),
      }),
    ];
  }

  async bulkAddTags(dto: BulkAddTagsDto, companyId: string) {
    const ids = await this.candidateSelection.resolveIds(companyId, dto);
    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, tags: true },
    });

    await this.updateInChunks(candidates, (candidate) => {
      const mergedTags = [...new Set([...candidate.tags, ...dto.tags])];
      return this.prisma.candidate.update({
        where: { id: candidate.id },
        data: { tags: mergedTags },
      });
    });

    return {
      message: `Added tags to ${candidates.length} candidates`,
      updatedCount: candidates.length,
    };
  }

  async bulkRemoveTags(dto: BulkRemoveTagsDto, companyId: string, userId: string) {
    const ids = await this.candidateSelection.resolveIds(companyId, dto);
    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, companyId, tags: { hasSome: dto.tags } },
      select: { id: true, tags: true },
    });

    const removed = new Set(dto.tags);
    await this.updateInChunks(candidates, (candidate) =>
      this.prisma.candidate.update({
        where: { id: candidate.id },
        data: { tags: candidate.tags.filter((tag) => !removed.has(tag)) },
      }),
    );
    if (candidates.length) {
      await this.prisma.candidateAction.createMany({
        data: candidates.map((candidate) => ({
          candidateId: candidate.id,
          userId,
          action: 'tags_removed',
          details: { tags: dto.tags },
        })),
      });
    }

    return {
      message: `Removed tags from ${candidates.length} candidates`,
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

    const ids = await this.candidateSelection.resolveIds(companyId, dto);
    const current = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, status: true, jobId: true, currentStageId: true },
    });
    // Candidates already on this job keep their stage.
    const moving = current.filter((c) => c.jobId !== dto.jobId);
    const stageMoves = await this.stageSyncForJob(moving, dto.jobId);

    await this.prisma.$transaction([
      this.prisma.candidate.updateMany({
        where: { id: { in: ids }, companyId },
        data: { jobId: dto.jobId },
      }),
      ...this.stageMoveOps(stageMoves),
      this.prisma.candidateAction.createMany({
        data: ids.map((candidateId) => ({
          candidateId,
          userId,
          action: 'assigned_to_job',
          details: { jobId: dto.jobId, jobTitle: job.title },
        })),
      }),
    ]);

    return {
      message: `Assigned ${ids.length} candidates to job: ${job.title}`,
      updatedCount: ids.length,
    };
  }

  async bulkDelete(dto: BulkDeleteDto, companyId: string) {
    const ids = await this.candidateSelection.resolveIds(companyId, dto);

    const { count } = await this.prisma.candidate.deleteMany({
      where: { id: { in: ids }, companyId },
    });

    return {
      message: `Deleted ${count} candidates`,
      deletedCount: count,
    };
  }

  /**
   * The rows behind a CSV export, in the selection's list order. Only the
   * fields export columns use, so a 5000-row export stays small.
   */
  async bulkExport(dto: BulkExportDto, companyId: string) {
    const ids = await this.candidateSelection.resolveIds(companyId, dto);
    const rows = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, companyId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        source: true,
        sourceChannel: true,
        overallScore: true,
        tags: true,
        location: true,
        linkedinUrl: true,
        githubUrl: true,
        portfolioUrl: true,
        aiSummary: true,
        skills: true,
        cvFileName: true,
        createdAt: true,
        updatedAt: true,
        job: { select: { id: true, title: true } },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const data = ids.flatMap((id) => byId.get(id) ?? []);
    return { data, total: data.length };
  }

  /**
   * Where a candidate sits in a filtered, sorted list, for next/previous
   * review. Lists longer than MAX_BULK are walked over their first MAX_BULK
   * rows (`truncated`). A candidate outside the list gets a null position.
   */
  async getNeighbors(
    candidateId: string,
    companyId: string,
    query: QueryCandidatesDto,
  ) {
    const exists = await this.prisma.candidate.count({
      where: { id: candidateId, companyId },
    });
    if (!exists) throw new NotFoundException('Candidate not found');

    const ids = await this.candidateSelection.orderedIds(
      companyId,
      query,
      MAX_BULK,
    );
    const index = ids.indexOf(candidateId);
    const found = index !== -1;
    return {
      position: found ? index + 1 : null,
      total: ids.length,
      truncated: ids.length === MAX_BULK,
      prevId: found && index > 0 ? ids[index - 1] : null,
      nextId: found && index < ids.length - 1 ? ids[index + 1] : null,
    };
  }

  private async cancelRejectionEmails(
    companyId: string,
    candidateIds: string[],
    userId: string | null,
  ) {
    await this.scheduledEmails.cancelPendingForCandidates(
      companyId,
      candidateIds,
      SCHEDULED_EMAIL_PURPOSE.REJECTION,
      userId,
    );
  }

  /** Per-row updates, a bounded number at a time (bulk can be 5000 rows). */
  private async updateInChunks<T>(
    items: T[],
    update: (item: T) => Promise<unknown>,
    size = 25,
  ) {
    for (let i = 0; i < items.length; i += size) {
      await Promise.all(items.slice(i, i + size).map(update));
    }
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
        country: candidate.country,
        region: candidate.region,
        city: candidate.city,
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
      description: job.description ?? undefined,
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

    await recordCandidateScoreHistory(this.prisma, {
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
      source: 'manual_rescore_sync',
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

  async getScoreHistory(candidateId: string, jobId: string, companyId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, companyId },
    });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    return this.prisma.candidateScoreHistory.findMany({
      where: { candidateId, jobId },
      orderBy: { scoredAt: 'desc' },
    });
  }

  /**
   * Format candidate response with optional signed URL for CV file
   * @param candidate - The candidate object from database
   * @param includeSignedUrl - Whether to generate a signed URL for the CV file
   */
  private async formatCandidateResponse(
    candidate: any,
    includeSignedUrl: boolean = false,
    genderEnabled: boolean = false,
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

    // Unlike the CV, always signed when present (in list rows too): getSignedUrl
    // is a local HMAC computation, not a network call, so it's cheap even for
    // every row of a paginated list — and the avatar needs to render there.
    let photoSignedUrl: string | null = null;
    if (candidate.photoUrl) {
      try {
        photoSignedUrl = await this.storageService.getSignedUrl(
          candidate.photoUrl,
          PHOTO_SIGNED_URL_TTL_SECONDS,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to generate photo signed URL for candidate ${candidate.id}: ${error}`,
        );
        photoSignedUrl = candidate.photoUrl;
      }
    }

    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      country: candidate.country,
      region: candidate.region,
      city: candidate.city,
      // Omitted entirely, not nulled, when the tenant has not opted in.
      ...(genderEnabled && { gender: candidate.gender }),
      linkedinUrl: candidate.linkedinUrl,
      githubUrl: candidate.githubUrl,
      portfolioUrl: candidate.portfolioUrl,
      source: candidate.source,
      sourceChannel: candidate.sourceChannel,
      sourceDetail: candidate.sourceDetail,
      status: candidate.status,
      cvFileUrl: candidate.cvFileUrl,
      cvFileSignedUrl, // Presigned URL for secure access
      cvFileName: candidate.cvFileName,
      photoUrl: candidate.photoUrl,
      photoSignedUrl,
      photoFileName: candidate.photoFileName,
      overallScore: candidate.overallScore,
      aiSummary: candidate.aiSummary,
      tags: candidate.tags,
      job: candidate.job,
      startDate: candidate.startDate,
      welcomeEmailSentAt: candidate.welcomeEmailSentAt,
      hiredAt: candidate.hiredAt,
      rejectionReason: candidate.rejectionReason ?? null,
      rejectionNote: candidate.rejectionNote ?? null,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      // Parsed CV data fields
      education: candidate.education,
      experience: candidate.experience,
      skills: candidate.skills,
      projects: candidate.projects,
      certifications: candidate.certifications,
      languages: candidate.languages,
      // Derived filter facets (read-only)
      currentTitle: candidate.currentTitle,
      currentCompany: candidate.currentCompany,
      university: candidate.university,
      totalExperienceYears: candidate.totalExperienceYears,
      educationLevel: candidate.educationLevel,
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
