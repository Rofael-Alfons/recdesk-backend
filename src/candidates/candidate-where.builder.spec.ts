import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { buildCandidateWhere, matchAiRecommendation } from './candidate-where.builder';
import { QueryCandidatesDto } from './dto/query-candidates.dto';

const companyId = 'comp-1';
const JOB_A = '11111111-1111-4111-8111-111111111111';
const JOB_B = '22222222-2222-4222-8222-222222222222';

/** Runs raw query-string values through the DTO exactly like the global ValidationPipe. */
async function parseQuery(raw: Record<string, unknown>) {
  const dto = plainToInstance(QueryCandidatesDto, raw, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

const conditions = (query: Record<string, unknown>, genderEnabled = false) =>
  buildCandidateWhere(companyId, query as any, genderEnabled).AND as Record<string, unknown>[];

describe('QueryCandidatesDto parsing', () => {
  it('keeps single values working (status=NEW) as a one-item list', async () => {
    const { dto, errors } = await parseQuery({ status: 'NEW' });
    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual(['NEW']);
  });

  it('splits comma-separated values and trims blanks', async () => {
    const { dto, errors } = await parseQuery({
      status: 'NEW, SCREENING,,',
      country: 'Egypt,United Arab Emirates',
    });
    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual(['NEW', 'SCREENING']);
    expect(dto.country).toEqual(['Egypt', 'United Arab Emirates']);
  });

  it('accepts repeated keys (arrays) too', async () => {
    const { dto } = await parseQuery({ skills: ['React', 'Node.js'] });
    expect(dto.skills).toEqual(['React', 'Node.js']);
  });

  it('rejects an unknown enum value inside a list', async () => {
    const { errors } = await parseQuery({ status: 'NEW,INTERVIEW' });
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('parses "false" as false despite implicit conversion', async () => {
    const { dto, errors } = await parseQuery({ hasCv: 'false', hasEmail: 'true' });
    expect(errors).toHaveLength(0);
    expect(dto.hasCv).toBe(false);
    expect(dto.hasEmail).toBe(true);
  });

  it('rejects a non-boolean flag', async () => {
    const { errors } = await parseQuery({ hasPhone: 'maybe' });
    expect(errors.map((e) => e.property)).toContain('hasPhone');
  });

  it('converts numeric ranges and validates bounds', async () => {
    const ok = await parseQuery({ minExperience: '2.5', maxExperience: '10' });
    expect(ok.errors).toHaveLength(0);
    expect(ok.dto.minExperience).toBe(2.5);

    const bad = await parseQuery({ maxExperience: '99' });
    expect(bad.errors.map((e) => e.property)).toContain('maxExperience');
  });

  it('rejects unknown AI recommendation labels and malformed dates', async () => {
    const { errors } = await parseQuery({
      aiRecommendation: 'Amazing',
      createdFrom: 'yesterday',
    });
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['aiRecommendation', 'createdFrom']),
    );
  });

  it('rejects non-UUID job ids', async () => {
    const { errors } = await parseQuery({ jobId: `${JOB_A},not-a-uuid` });
    expect(errors.map((e) => e.property)).toContain('jobId');
  });
});

describe('buildCandidateWhere', () => {
  it('always scopes to the company first, even with no filters', () => {
    expect(buildCandidateWhere(companyId, {}, false)).toEqual({
      AND: [{ companyId }],
    });
  });

  it('keeps both bounds when minScore and maxScore are set together (regression)', () => {
    expect(conditions({ minScore: 60, maxScore: 90 })).toContainEqual({
      overallScore: { gte: 60, lte: 90 },
    });
    expect(conditions({ minScore: 0 })).toContainEqual({ overallScore: { gte: 0 } });
  });

  it('keeps search and "job or unassigned" as separate OR groups', () => {
    const where = conditions({ search: ' jane ', jobId: [JOB_A], unassigned: true });
    expect(where).toContainEqual({
      OR: [{ jobId: { in: [JOB_A] } }, { jobId: null }],
    });
    expect(where).toContainEqual({
      OR: [
        { fullName: { contains: 'jane', mode: 'insensitive' } },
        { email: { contains: 'jane', mode: 'insensitive' } },
      ],
    });
  });

  it('filters by jobs only, or unassigned only', () => {
    expect(conditions({ jobId: [JOB_A, JOB_B] })).toContainEqual({
      jobId: { in: [JOB_A, JOB_B] },
    });
    expect(conditions({ unassigned: true })).toContainEqual({ jobId: null });
  });

  it('maps multi-value pipeline filters to `in`', () => {
    const where = conditions({
      status: ['NEW', 'SCREENING'],
      source: ['EMAIL'],
      sourceChannel: ['WUZZUF'],
    });
    expect(where).toEqual(
      expect.arrayContaining([
        { status: { in: ['NEW', 'SCREENING'] } },
        { source: { in: ['EMAIL'] } },
        { sourceChannel: { in: ['WUZZUF'] } },
      ]),
    );
  });

  it('merges the legacy single tag into the tags filter', () => {
    expect(conditions({ tags: ['urgent'], tag: 'referral' })).toContainEqual({
      tags: { hasSome: ['urgent', 'referral'] },
    });
  });

  it('matches AI recommendations case-insensitively, including legacy free text', () => {
    const [scoreFilter] = conditions({
      aiRecommendation: ['Highly Recommended', 'Not Recommended'],
    }).filter((c) => 'scores' in c) as any[];
    expect(scoreFilter.scores.some.OR).toEqual([
      { recommendation: { startsWith: 'highly recommend', mode: 'insensitive' } },
      { recommendation: { startsWith: 'not recommend', mode: 'insensitive' } },
    ]);
    expect(scoreFilter.scores.some).not.toHaveProperty('jobId');
  });

  it('scopes the AI recommendation to the job when exactly one job is selected', () => {
    const [scoreFilter] = conditions({
      aiRecommendation: ['Recommended'],
      jobId: [JOB_A],
    }).filter((c) => 'scores' in c) as any[];
    expect(scoreFilter.scores.some.jobId).toBe(JOB_A);
  });

  it('maps location lists', () => {
    expect(
      conditions({ country: ['Egypt'], region: ['Cairo', 'Giza'], city: ['Nasr City'] }),
    ).toEqual(
      expect.arrayContaining([
        { country: { in: ['Egypt'] } },
        { region: { in: ['Cairo', 'Giza'] } },
        { city: { in: ['Nasr City'] } },
      ]),
    );
  });

  it('silently drops gender unless the company opted in', () => {
    expect(conditions({ gender: ['FEMALE'] }, false).some((c) => 'gender' in c)).toBe(false);
    expect(conditions({ gender: ['FEMALE'] }, true)).toContainEqual({
      gender: { in: ['FEMALE'] },
    });
  });

  it('normalizes skills and supports any/all matching', () => {
    expect(conditions({ skills: [' Node.JS ', 'React'] })).toContainEqual({
      skillsNormalized: { hasSome: ['node.js', 'react'] },
    });
    expect(conditions({ skills: ['React', 'SQL'], skillsMatch: 'all' })).toContainEqual({
      skillsNormalized: { hasEvery: ['react', 'sql'] },
    });
  });

  it('normalizes languages', () => {
    expect(conditions({ languages: ['Arabic', 'ENGLISH'] })).toContainEqual({
      languageNames: { hasSome: ['arabic', 'english'] },
    });
  });

  it('maps the experience range', () => {
    expect(conditions({ minExperience: 2, maxExperience: 5 })).toContainEqual({
      totalExperienceYears: { gte: 2, lte: 5 },
    });
    expect(conditions({ maxExperience: 0 })).toContainEqual({
      totalExperienceYears: { lte: 0 },
    });
  });

  it('treats education as "this level or higher"', () => {
    expect(conditions({ minEducationLevel: 'BACHELOR' })).toContainEqual({
      educationLevel: { in: ['BACHELOR', 'MASTER', 'DOCTORATE'] },
    });
    expect(conditions({ minEducationLevel: 'DOCTORATE' })).toContainEqual({
      educationLevel: { in: ['DOCTORATE'] },
    });
  });

  it('filters exact education levels, alongside the minimum level', async () => {
    const { dto, errors } = await parseQuery({ educationLevel: 'BACHELOR,MASTER' });
    expect(errors).toHaveLength(0);
    expect(dto.educationLevel).toEqual(['BACHELOR', 'MASTER']);
    expect(conditions({ educationLevel: ['DIPLOMA'] as any })).toContainEqual({
      educationLevel: { in: ['DIPLOMA'] },
    });

    const bad = await parseQuery({ educationLevel: 'PHD' });
    expect(bad.errors.map((e) => e.property)).toContain('educationLevel');
  });

  it('uses case-insensitive contains for university, title and company', () => {
    expect(
      conditions({ university: ' Cairo ', currentTitle: 'engineer', currentCompany: 'Vodafone' }),
    ).toEqual(
      expect.arrayContaining([
        { university: { contains: 'Cairo', mode: 'insensitive' } },
        { currentTitle: { contains: 'engineer', mode: 'insensitive' } },
        { currentCompany: { contains: 'Vodafone', mode: 'insensitive' } },
      ]),
    );
    expect(conditions({ university: '   ' })).toEqual([{ companyId }]);
  });

  it('maps interviews, scorecards and document requests to relation filters', () => {
    expect(conditions({ hasScheduledInterview: true })).toContainEqual({
      interviews: { some: { status: 'SCHEDULED' } },
    });
    expect(conditions({ hasScheduledInterview: false })).toContainEqual({
      interviews: { none: { status: 'SCHEDULED' } },
    });
    expect(conditions({ interviewRecommendation: ['ADVANCE'] })).toContainEqual({
      interviewEvaluations: { some: { recommendation: { in: ['ADVANCE'] } } },
    });
    expect(conditions({ documentStatus: ['PENDING', 'PARTIAL'] })).toContainEqual({
      documentRequests: { some: { status: { in: ['PENDING', 'PARTIAL'] } } },
    });
  });

  it('makes a bare end date inclusive through the end of that day', () => {
    const [created] = conditions({
      createdFrom: '2026-01-01',
      createdTo: '2026-01-31',
    }).filter((c) => 'createdAt' in c) as any[];
    expect(created.createdAt.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(created.createdAt.lte.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('leaves a full ISO end datetime untouched', () => {
    const [updated] = conditions({ updatedTo: '2026-01-31T10:00:00.000Z' }).filter(
      (c) => 'updatedAt' in c,
    ) as any[];
    expect(updated.updatedAt).toEqual({ lte: new Date('2026-01-31T10:00:00.000Z') });
  });

  it('maps hired and start date ranges', () => {
    const where = conditions({ hiredFrom: '2026-02-01', startTo: '2026-03-01' });
    expect(where).toContainEqual({ hiredAt: { gte: new Date('2026-02-01') } });
    expect(where).toContainEqual({
      startDate: { lte: new Date('2026-03-01T23:59:59.999Z') },
    });
  });

  it('checks data completeness, treating empty strings as missing', () => {
    expect(conditions({ hasCv: true })).toContainEqual({ NOT: { cvFileUrl: '' } });
    expect(conditions({ hasCv: false })).toContainEqual({ cvFileUrl: '' });
    expect(conditions({ hasEmail: true })).toContainEqual({
      AND: [{ email: { not: null } }, { NOT: { email: '' } }],
    });
    expect(conditions({ hasPhone: false })).toContainEqual({
      OR: [{ phone: null }, { phone: '' }],
    });
    expect(conditions({ hasLinkedin: true })).toContainEqual({
      AND: [{ linkedinUrl: { not: null } }, { NOT: { linkedinUrl: '' } }],
    });
  });

  it('builds a where from a real parsed query string end to end', async () => {
    const { dto, errors } = await parseQuery({
      status: 'SHORTLISTED,INTERVIEWING',
      minScore: '70',
      maxScore: '95',
      skills: 'React,TypeScript',
      skillsMatch: 'all',
      hasCv: 'true',
      createdTo: '2026-09-29',
    });
    expect(errors).toHaveLength(0);

    const where = conditions(dto as any);
    expect(where).toEqual(
      expect.arrayContaining([
        { companyId },
        { status: { in: ['SHORTLISTED', 'INTERVIEWING'] } },
        { overallScore: { gte: 70, lte: 95 } },
        { skillsNormalized: { hasEvery: ['react', 'typescript'] } },
        { NOT: { cvFileUrl: '' } },
      ]),
    );
  });
});

describe('matchAiRecommendation', () => {
  it('buckets stored recommendations exactly like the Prisma filter', () => {
    expect(matchAiRecommendation('Highly recommended for interview')).toBe('Highly Recommended');
    expect(matchAiRecommendation('RECOMMENDED')).toBe('Recommended');
    expect(matchAiRecommendation('Recommended with reservations')).toBeNull();
    expect(matchAiRecommendation('Consider for junior role')).toBe('Consider');
    expect(matchAiRecommendation('Not recommended at this time')).toBe('Not Recommended');
    expect(matchAiRecommendation('Maybe')).toBeNull();
    expect(matchAiRecommendation(null)).toBeNull();
  });
});
