import { EducationLevel, Prisma } from '@prisma/client';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { normalizeFacetValue } from './candidate-facets.util';

/** Lowest to highest; "minimum level" matches the level and everything above. */
export const EDUCATION_LEVEL_ORDER: EducationLevel[] = [
  EducationLevel.HIGH_SCHOOL,
  EducationLevel.DIPLOMA,
  EducationLevel.BACHELOR,
  EducationLevel.MASTER,
  EducationLevel.DOCTORATE,
];

// The scoring prompt asks for these four labels, but older scores hold free
// text such as "Highly recommended for interview", so match by prefix and
// case-insensitively. Free text that fits no bucket is simply not matched.
// Used both as a Prisma filter and in memory (report breakdowns), so the two
// always agree on which bucket a stored recommendation falls into.
const AI_RECOMMENDATION_RULES: Record<string, { startsWith?: string; equals?: string }> = {
  'Highly Recommended': { startsWith: 'highly recommend' },
  Recommended: { equals: 'recommended' },
  Consider: { startsWith: 'consider' },
  'Not Recommended': { startsWith: 'not recommend' },
};

function aiRecommendationFilter(label: string): Prisma.StringNullableFilter {
  return { ...AI_RECOMMENDATION_RULES[label], mode: 'insensitive' };
}

/** The AI_RECOMMENDATIONS bucket a stored recommendation belongs to, if any. */
export function matchAiRecommendation(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [label, rule] of Object.entries(AI_RECOMMENDATION_RULES)) {
    if (rule.startsWith !== undefined && lower.startsWith(rule.startsWith)) return label;
    if (rule.equals !== undefined && lower === rule.equals) return label;
  }
  return null;
}

export type CandidateFilterQuery = Omit<
  QueryCandidatesDto,
  'sortBy' | 'sortOrder' | 'page' | 'limit'
>;

/**
 * List order. The trailing `id` makes ties (same score, name or timestamp)
 * deterministic, which next/previous navigation and paging rely on.
 */
export function buildCandidateOrderBy(
  sortBy: QueryCandidatesDto['sortBy'] = 'createdAt',
  sortOrder: QueryCandidatesDto['sortOrder'] = 'desc',
): Prisma.CandidateOrderByWithRelationInput[] {
  const order: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
  const primary: Prisma.CandidateOrderByWithRelationInput =
    sortBy === 'score'
      ? { overallScore: order }
      : sortBy === 'name'
        ? { fullName: order }
        : { createdAt: order };
  return [primary, { id: order }];
}

/** Splits a parsed list query into its filter part and its sort. */
export function splitCandidateQuery(query: QueryCandidatesDto): {
  filters: CandidateFilterQuery;
  sortBy: QueryCandidatesDto['sortBy'];
  sortOrder: QueryCandidatesDto['sortOrder'];
} {
  const { sortBy, sortOrder, page: _page, limit: _limit, ...filters } = query;
  return { filters, sortBy, sortOrder };
}

// A bare "YYYY-MM-DD" end date (what the date-only picker sends) means
// "through the end of that day", the same rule reports use. Full ISO
// datetimes are left untouched.
function inclusiveEndDate(value: string): Date {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function dateRange(
  from?: string,
  to?: string,
): Prisma.DateTimeNullableFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: inclusiveEndDate(to) }),
  };
}

function presence(
  field: 'email' | 'phone' | 'linkedinUrl',
  wanted: boolean,
): Prisma.CandidateWhereInput {
  return wanted
    ? { AND: [{ [field]: { not: null } }, { NOT: { [field]: '' } }] }
    : { OR: [{ [field]: null }, { [field]: '' }] };
}

const contains = (value: string) => ({
  contains: value.trim(),
  mode: 'insensitive' as const,
});

/**
 * Builds the candidate list filter. Every condition is its own AND entry, so
 * independent OR groups (search, job + unassigned, presence checks) can
 * never overwrite one another the way spread object keys would.
 */
export function buildCandidateWhere(
  companyId: string,
  query: CandidateFilterQuery,
  genderEnabled: boolean,
): Prisma.CandidateWhereInput {
  const and: Prisma.CandidateWhereInput[] = [{ companyId }];
  const push = (condition: Prisma.CandidateWhereInput | false | undefined) => {
    if (condition) and.push(condition);
  };

  // Pipeline
  push(!!query.status?.length && { status: { in: query.status } });
  push(!!query.source?.length && { source: { in: query.source } });
  push(
    !!query.sourceChannel?.length && {
      sourceChannel: { in: query.sourceChannel },
    },
  );

  const jobIds = query.jobId ?? [];
  if (jobIds.length && query.unassigned) {
    push({ OR: [{ jobId: { in: jobIds } }, { jobId: null }] });
  } else if (jobIds.length) {
    push({ jobId: { in: jobIds } });
  } else if (query.unassigned) {
    push({ jobId: null });
  }

  if (query.minScore !== undefined || query.maxScore !== undefined) {
    push({
      overallScore: {
        ...(query.minScore !== undefined && { gte: query.minScore }),
        ...(query.maxScore !== undefined && { lte: query.maxScore }),
      },
    });
  }

  if (query.aiRecommendation?.length) {
    push({
      scores: {
        some: {
          OR: query.aiRecommendation.map((r) => ({
            recommendation: aiRecommendationFilter(r),
          })),
          // With exactly one job selected, the recommendation must be for
          // that job, not for some other job the candidate was scored on.
          ...(jobIds.length === 1 && { jobId: jobIds[0] }),
        },
      },
    });
  }

  const tags = [...(query.tags ?? []), ...(query.tag ? [query.tag] : [])];
  push(tags.length > 0 && { tags: { hasSome: tags } });

  // Location
  push(!!query.country?.length && { country: { in: query.country } });
  push(!!query.region?.length && { region: { in: query.region } });
  push(!!query.city?.length && { city: { in: query.city } });

  // A stale bookmark carrying ?gender= after a company disables the setting
  // silently drops the filter rather than failing the whole list request.
  push(genderEnabled && !!query.gender?.length && { gender: { in: query.gender } });

  // Profile
  const skills = (query.skills ?? []).map(normalizeFacetValue).filter(Boolean);
  if (skills.length) {
    push({
      skillsNormalized:
        query.skillsMatch === 'all' ? { hasEvery: skills } : { hasSome: skills },
    });
  }

  const languages = (query.languages ?? [])
    .map(normalizeFacetValue)
    .filter(Boolean);
  push(languages.length > 0 && { languageNames: { hasSome: languages } });

  if (query.minExperience !== undefined || query.maxExperience !== undefined) {
    push({
      totalExperienceYears: {
        ...(query.minExperience !== undefined && { gte: query.minExperience }),
        ...(query.maxExperience !== undefined && { lte: query.maxExperience }),
      },
    });
  }

  if (query.minEducationLevel) {
    const from = EDUCATION_LEVEL_ORDER.indexOf(query.minEducationLevel);
    push({ educationLevel: { in: EDUCATION_LEVEL_ORDER.slice(from) } });
  }
  push(
    !!query.educationLevel?.length && {
      educationLevel: { in: query.educationLevel },
    },
  );

  push(!!query.university?.trim() && { university: contains(query.university!) });
  push(!!query.currentTitle?.trim() && { currentTitle: contains(query.currentTitle!) });
  push(
    !!query.currentCompany?.trim() && {
      currentCompany: contains(query.currentCompany!),
    },
  );

  // Interviews and documents
  if (query.hasScheduledInterview !== undefined) {
    const scheduled = { status: 'SCHEDULED' as const };
    push({
      interviews: query.hasScheduledInterview
        ? { some: scheduled }
        : { none: scheduled },
    });
  }
  push(
    !!query.interviewRecommendation?.length && {
      interviewEvaluations: {
        some: { recommendation: { in: query.interviewRecommendation } },
      },
    },
  );
  push(
    !!query.documentStatus?.length && {
      documentRequests: { some: { status: { in: query.documentStatus } } },
    },
  );

  // Dates
  const created = dateRange(query.createdFrom, query.createdTo);
  push(!!created && { createdAt: created as Prisma.DateTimeFilter });
  const hired = dateRange(query.hiredFrom, query.hiredTo);
  push(!!hired && { hiredAt: hired });
  const start = dateRange(query.startFrom, query.startTo);
  push(!!start && { startDate: start });
  const updated = dateRange(query.updatedFrom, query.updatedTo);
  push(!!updated && { updatedAt: updated as Prisma.DateTimeFilter });

  // Data completeness. Candidates created from an email body without an
  // attachment store cvFileUrl as '' (the column is non-nullable).
  if (query.hasCv !== undefined) {
    push(query.hasCv ? { NOT: { cvFileUrl: '' } } : { cvFileUrl: '' });
  }
  if (query.hasEmail !== undefined) push(presence('email', query.hasEmail));
  if (query.hasPhone !== undefined) push(presence('phone', query.hasPhone));
  if (query.hasLinkedin !== undefined) {
    push(presence('linkedinUrl', query.hasLinkedin));
  }

  const search = query.search?.trim();
  if (search) {
    push({
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return { AND: and };
}
