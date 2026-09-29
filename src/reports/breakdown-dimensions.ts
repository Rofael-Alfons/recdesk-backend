import {
  CandidateStatus,
  DocumentRequestStatus,
  InterviewRecommendation,
  Prisma,
} from '@prisma/client';
import {
  EDUCATION_LEVEL_ORDER,
  matchAiRecommendation,
} from '../candidates/candidate-where.builder';
import { normalizeFacetValue } from '../candidates/candidate-facets.util';
import { AI_RECOMMENDATIONS } from '../candidates/dto/query-candidates.dto';
import type { BreakdownDimension, ReportsBreakdownQueryDto } from './dto';

/** The "no job" row of the job breakdown; the frontend maps it to unassigned=true. */
export const UNASSIGNED_JOB = '__unassigned';

/** High-cardinality dimensions (skills, cities, ...) return only their top rows. */
export const BREAKDOWN_TOP_N = 20;

export interface BucketRange {
  min: number;
  max: number;
}

export interface BreakdownRow {
  value: string;
  label: string;
  candidates: number;
  hires: number;
  hireRate: number | null;
  avgScore: number | null;
  /** Bucketed dimensions only: the inclusive filter bounds of the bucket. */
  range?: BucketRange;
}

export interface BreakdownReport {
  startDate: string;
  endDate: string;
  dimension: BreakdownDimension;
  total: number;
  rows: BreakdownRow[];
  /** Candidates with no value for the dimension (e.g. no country); not drillable. */
  unknown: BreakdownRow | null;
}

interface Bucket extends BucketRange {
  value: string;
  label: string;
}

// Inclusive on both ends so each bucket maps one-to-one onto min/max filter
// params. Experience is stored rounded to 1 decimal (candidate-facets.util)
// and scores are integers, so the bounds leave no gaps.
export const EXPERIENCE_BUCKETS: Bucket[] = [
  { value: '0-1', label: 'Under 1 yr', min: 0, max: 0.9 },
  { value: '1-3', label: '1–3 yrs', min: 1, max: 2.9 },
  { value: '3-5', label: '3–5 yrs', min: 3, max: 4.9 },
  { value: '5-10', label: '5–10 yrs', min: 5, max: 9.9 },
  { value: '10+', label: '10+ yrs', min: 10, max: 60 },
];

export const SCORE_BUCKETS: Bucket[] = [
  { value: '90-100', label: '90–100', min: 90, max: 100 },
  { value: '80-89', label: '80–89', min: 80, max: 89 },
  { value: '70-79', label: '70–79', min: 70, max: 79 },
  { value: '50-69', label: '50–69', min: 50, max: 69 },
  { value: '0-49', label: '0–49', min: 0, max: 49 },
];

const bucketOf = (buckets: Bucket[], n: number | null | undefined): string[] => {
  if (n === null || n === undefined) return [];
  const bucket = buckets.find((b) => n >= b.min && n <= b.max);
  return bucket ? [bucket.value] : [];
};

const text = (v: string | null | undefined): string[] => (v?.trim() ? [v] : []);

const normalized = (values: string[] | undefined): string[] | undefined =>
  values?.map(normalizeFacetValue).filter(Boolean);

export interface BreakdownContext {
  /** With exactly one job selected, AI recommendations only count for that job (as in the filter). */
  scoreJobId?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BreakdownSpec {
  select: Prisma.CandidateSelect;
  values: (row: any, ctx: BreakdownContext) => string[];
  label?: (value: string, row: any) => string;
  /**
   * When the segment already filters this dimension, only its selected values
   * are shown, so replacing that filter with the clicked value on drill-down
   * returns exactly the counted candidates.
   */
  restrictTo?: (query: ReportsBreakdownQueryDto) => string[] | undefined;
  /** Ordinal dimensions keep this order (and are never truncated). */
  order?: string[];
  buckets?: Bucket[];
}

export const BREAKDOWN_SPECS: Record<BreakdownDimension, BreakdownSpec> = {
  status: {
    select: { status: true },
    values: (row) => [row.status],
    restrictTo: (q) => q.status,
    order: Object.values(CandidateStatus),
  },
  job: {
    select: { jobId: true, job: { select: { title: true } } },
    values: (row) => [row.jobId ?? UNASSIGNED_JOB],
    label: (value, row) => (value === UNASSIGNED_JOB ? 'Unassigned' : (row.job?.title ?? value)),
  },
  country: {
    select: { country: true },
    values: (row) => text(row.country),
    restrictTo: (q) => q.country,
  },
  region: {
    select: { region: true },
    values: (row) => text(row.region),
    restrictTo: (q) => q.region,
  },
  city: {
    select: { city: true },
    values: (row) => text(row.city),
    restrictTo: (q) => q.city,
  },
  university: {
    select: { university: true },
    values: (row) => text(row.university),
  },
  educationLevel: {
    select: { educationLevel: true },
    values: (row) => (row.educationLevel ? [row.educationLevel] : []),
    restrictTo: (q) => q.educationLevel,
    order: [...EDUCATION_LEVEL_ORDER].reverse(),
  },
  experience: {
    select: { totalExperienceYears: true },
    values: (row) => bucketOf(EXPERIENCE_BUCKETS, row.totalExperienceYears),
    order: EXPERIENCE_BUCKETS.map((b) => b.value),
    buckets: EXPERIENCE_BUCKETS,
  },
  skills: {
    select: { skillsNormalized: true },
    values: (row) => row.skillsNormalized ?? [],
    restrictTo: (q) => normalized(q.skills),
  },
  languages: {
    select: { languageNames: true },
    values: (row) => row.languageNames ?? [],
    restrictTo: (q) => normalized(q.languages),
  },
  tags: {
    select: { tags: true },
    values: (row) => row.tags ?? [],
    restrictTo: (q) =>
      q.tags?.length || q.tag ? [...(q.tags ?? []), ...(q.tag ? [q.tag] : [])] : undefined,
  },
  aiRecommendation: {
    select: { scores: { select: { recommendation: true, jobId: true } } },
    values: (row, ctx) =>
      (row.scores ?? [])
        .filter((s: any) => !ctx.scoreJobId || s.jobId === ctx.scoreJobId)
        .map((s: any) => matchAiRecommendation(s.recommendation))
        .filter(Boolean),
    restrictTo: (q) => q.aiRecommendation,
    order: [...AI_RECOMMENDATIONS],
  },
  score: {
    select: {},
    values: (row) => bucketOf(SCORE_BUCKETS, row.overallScore),
    order: SCORE_BUCKETS.map((b) => b.value),
    buckets: SCORE_BUCKETS,
  },
  interviewRecommendation: {
    select: { interviewEvaluations: { select: { recommendation: true } } },
    values: (row) => (row.interviewEvaluations ?? []).map((e: any) => e.recommendation),
    restrictTo: (q) => q.interviewRecommendation,
    order: Object.values(InterviewRecommendation),
  },
  documentStatus: {
    select: { documentRequests: { select: { status: true } } },
    values: (row) => (row.documentRequests ?? []).map((d: any) => d.status),
    restrictTo: (q) => q.documentStatus,
    order: Object.values(DocumentRequestStatus),
  },
  gender: {
    select: { gender: true },
    values: (row) => (row.gender ? [row.gender] : []),
    restrictTo: (q) => q.gender,
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
