import { BadRequestException } from '@nestjs/common';
import { CandidateStatus, StageCategory } from '@prisma/client';

export interface StageBlueprint {
  name: string;
  category: StageCategory;
  color: string;
}

/**
 * Default pipeline used for new jobs when the company has no default
 * template (and the virtual "Standard" template). Shared with
 * prisma/backfill-* scripts.
 */
export const DEFAULT_PIPELINE_STAGES: (StageBlueprint & {
  orderIndex: number;
  isDefault: boolean;
})[] = [
  { name: 'New', category: 'NEW', orderIndex: 0, color: '#6B7280', isDefault: true },
  { name: 'Screening', category: 'SCREENING', orderIndex: 1, color: '#3B82F6', isDefault: false },
  { name: 'Interview', category: 'INTERVIEW', orderIndex: 2, color: '#8B5CF6', isDefault: false },
  { name: 'Offer', category: 'OFFER', orderIndex: 3, color: '#10B981', isDefault: false },
  { name: 'Hired', category: 'HIRED', orderIndex: 4, color: '#059669', isDefault: false },
];

export const MAX_PIPELINE_STAGES = 15;

/**
 * Cross-row validation class-validator can't express: 1-15 stages, and
 * names unique (case/whitespace-insensitive). Returns trimmed stages.
 */
export function validateStageInputs<T extends { name: string }>(stages: T[]): T[] {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new BadRequestException('A pipeline needs at least one stage');
  }
  if (stages.length > MAX_PIPELINE_STAGES) {
    throw new BadRequestException(
      `A pipeline can have at most ${MAX_PIPELINE_STAGES} stages`,
    );
  }
  const trimmed = stages.map((s) => ({ ...s, name: s.name.trim() }));
  const seen = new Set<string>();
  for (const s of trimmed) {
    if (!s.name) throw new BadRequestException('Stage names cannot be empty');
    const key = s.name.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException(`Duplicate stage name: "${s.name}"`);
    }
    seen.add(key);
  }
  return trimmed;
}

export interface StageLike {
  id: string;
  name: string;
  orderIndex: number;
  category?: StageCategory | null;
}

export const CLOSED_STATUSES: CandidateStatus[] = ['REJECTED', 'WITHDRAWN'];

const CATEGORY_BY_DEFAULT_NAME: Record<string, StageCategory> = {
  new: 'NEW',
  screening: 'SCREENING',
  interview: 'INTERVIEW',
  offer: 'OFFER',
  hired: 'HIRED',
};

/** Category for stages created before categories existed (by default name). */
export function categoryFromName(name: string): StageCategory {
  return CATEGORY_BY_DEFAULT_NAME[name.trim().toLowerCase()] ?? 'INTERVIEW';
}

export function stageCategory(stage: {
  name: string;
  category?: StageCategory | null;
}): StageCategory {
  return stage.category ?? categoryFromName(stage.name);
}

const STATUS_BY_CATEGORY: Record<StageCategory, CandidateStatus> = {
  NEW: 'NEW',
  SCREENING: 'SCREENING',
  INTERVIEW: 'INTERVIEWING',
  OFFER: 'OFFERED',
  HIRED: 'HIRED',
};

export function statusForCategory(category: StageCategory): CandidateStatus {
  return STATUS_BY_CATEGORY[category];
}

/** Category an open status belongs to; null for closed statuses. */
export function categoryForStatus(
  status: CandidateStatus,
): StageCategory | null {
  switch (status) {
    case 'NEW':
      return 'NEW';
    case 'SCREENING':
    case 'SHORTLISTED':
      return 'SCREENING';
    case 'INTERVIEWING':
      return 'INTERVIEW';
    case 'OFFERED':
      return 'OFFER';
    case 'HIRED':
      return 'HIRED';
    default:
      return null;
  }
}

function sortStages<T extends StageLike>(stages: T[]): T[] {
  return [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * First stage (by order) whose category matches the status; falls back to
 * the first stage. Null when the job has no stages. For closed statuses the
 * first stage is returned (callers decide whether closed candidates show).
 */
export function stageForStatus<T extends StageLike>(
  stages: T[],
  status: CandidateStatus,
): T | null {
  if (stages.length === 0) return null;
  const sorted = sortStages(stages);
  const category = categoryForStatus(status);
  return (
    (category && sorted.find((s) => stageCategory(s) === category)) ||
    sorted[0]
  );
}

/**
 * The stage a candidate is in: their stored currentStageId when it belongs
 * to this job's stages, else derived from status.
 */
export function effectiveStage<T extends StageLike>(
  candidate: { currentStageId?: string | null; status: CandidateStatus },
  stages: T[],
): T | null {
  const stored = candidate.currentStageId
    ? stages.find((s) => s.id === candidate.currentStageId)
    : undefined;
  return stored ?? stageForStatus(stages, candidate.status);
}

/**
 * Status to set when moving a candidate into `stage`. Keeps the current
 * status when it already falls in the stage's category (e.g. SHORTLISTED
 * stays SHORTLISTED in any SCREENING stage).
 */
export function statusForStage(
  stage: { name: string; category?: StageCategory | null },
  currentStatus?: CandidateStatus,
): CandidateStatus {
  const category = stageCategory(stage);
  if (currentStatus && categoryForStatus(currentStatus) === category) {
    return currentStatus;
  }
  return statusForCategory(category);
}
