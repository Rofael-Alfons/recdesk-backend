import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsBreakdownQueryDto, ReportsQueryDto } from './dto';

const JOB_A = '11111111-1111-4111-8111-111111111111';
const JOB_B = '22222222-2222-4222-8222-222222222222';

/** Every leaf condition of a nested { AND: [...] } where. */
function flatten(where: any): any[] {
  if (where && Array.isArray(where.AND)) return where.AND.flatMap(flatten);
  return [where];
}

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ collectGenderData: false }) },
      subscription: { findUnique: jest.fn() },
      candidate: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      channelCost: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('date range resolution', () => {
    it('uses explicit query params when provided, skipping the subscription lookup', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);

      const result = await service.getFunnel('comp-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
      expect(result.startDate).toBe(new Date('2026-01-01').toISOString());
      // A bare date-only endDate must resolve inclusively through the end
      // of that calendar day, not midnight at its start — otherwise every
      // candidate created later that same day is silently excluded.
      expect(result.endDate).toBe(new Date('2026-01-31T23:59:59.999Z').toISOString());
    });

    it('treats a full ISO datetime endDate as already-precise, without pushing it to end of day', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);

      const result = await service.getFunnel('comp-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31T10:00:00.000Z',
      });

      expect(result.endDate).toBe(new Date('2026-01-31T10:00:00.000Z').toISOString());
    });

    it('uses the subscription billing period when no query params are given', async () => {
      const periodStart = new Date('2026-02-01');
      const periodEnd = new Date('2026-02-28');
      prisma.subscription.findUnique.mockResolvedValue({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
      prisma.candidate.groupBy.mockResolvedValue([]);

      const result = await service.getFunnel('comp-1', {});

      expect(result.startDate).toBe(periodStart.toISOString());
      expect(result.endDate).toBe(periodEnd.toISOString());
    });

    it('falls back to start-of-month when there is no subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.candidate.groupBy.mockResolvedValue([]);

      const result = await service.getFunnel('comp-1', {});

      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1);
      expect(result.startDate).toBe(expectedStart.toISOString());
    });
  });

  describe('getFunnel', () => {
    it('computes reached-stage suffix sums and conversion rates, routing REJECTED/WITHDRAWN to droppedOff', async () => {
      prisma.candidate.groupBy.mockResolvedValue([
        { status: 'NEW', _count: 20 },
        { status: 'SCREENING', _count: 30 },
        { status: 'SHORTLISTED', _count: 15 },
        { status: 'INTERVIEWING', _count: 10 },
        { status: 'OFFERED', _count: 4 },
        { status: 'HIRED', _count: 6 },
        { status: 'REJECTED', _count: 25 },
        { status: 'WITHDRAWN', _count: 5 },
      ]);

      const result = await service.getFunnel('comp-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      // reached[stage] = sum of counts from that stage onward
      expect(result.stages).toEqual([
        { status: 'NEW', reached: 85, conversionFromPrevious: null },
        { status: 'SCREENING', reached: 65, conversionFromPrevious: 65 / 85 },
        { status: 'SHORTLISTED', reached: 35, conversionFromPrevious: 35 / 65 },
        { status: 'INTERVIEWING', reached: 20, conversionFromPrevious: 20 / 35 },
        { status: 'OFFERED', reached: 10, conversionFromPrevious: 10 / 20 },
        { status: 'HIRED', reached: 6, conversionFromPrevious: 6 / 10 },
      ]);
      expect(result.droppedOff).toEqual({ rejected: 25, withdrawn: 5 });
      expect(result.note).toContain('no stage-transition history');
    });

    it('returns null conversion instead of dividing by zero when a stage is empty', async () => {
      prisma.candidate.groupBy.mockResolvedValue([{ status: 'NEW', _count: 0 }]);

      const result = await service.getFunnel('comp-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(result.stages.every((s) => s.reached === 0)).toBe(true);
      expect(result.stages[1].conversionFromPrevious).toBeNull();
    });

    it('scopes the query by companyId, the job filter and the period', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);

      const result = await service.getFunnel('comp-1', {
        jobId: [JOB_A],
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      const call = prisma.candidate.groupBy.mock.calls[0][0];
      expect(call.by).toEqual(['status']);
      expect(flatten(call.where)).toEqual(
        expect.arrayContaining([
          { companyId: 'comp-1' },
          { jobId: { in: [JOB_A] } },
          {
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31T23:59:59.999Z'),
            },
          },
        ]),
      );
      expect(result.jobId).toBe(JOB_A);
      expect(result.jobIds).toEqual([JOB_A]);
    });

    it('reports jobId as null when several jobs are selected', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);
      const result = await service.getFunnel('comp-1', { jobId: [JOB_A, JOB_B] });
      expect(result.jobId).toBeNull();
      expect(result.jobIds).toEqual([JOB_A, JOB_B]);
    });
  });

  describe('getTimeToHire', () => {
    it('averages days-to-hire overall and per job', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          id: 'c1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          hiredAt: new Date('2026-01-11T00:00:00Z'), // 10 days
          jobId: 'job-1',
          job: { title: 'Backend Engineer' },
        },
        {
          id: 'c2',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          hiredAt: new Date('2026-01-21T00:00:00Z'), // 20 days
          jobId: 'job-1',
          job: { title: 'Backend Engineer' },
        },
        {
          id: 'c3',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          hiredAt: new Date('2026-01-06T00:00:00Z'), // 5 days
          jobId: null,
          job: null,
        },
      ]);

      const result = await service.getTimeToHire('comp-1', {});

      expect(result.hiresCount).toBe(3);
      expect(result.overallAvgDays).toBeCloseTo((10 + 20 + 5) / 3);
      expect(result.byJob).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ jobId: 'job-1', jobTitle: 'Backend Engineer', avgDays: 15, hiresCount: 2 }),
          expect.objectContaining({ jobId: null, jobTitle: 'Unassigned', avgDays: 5, hiresCount: 1 }),
        ]),
      );
    });

    it('returns null overallAvgDays (not NaN) when there are no hires', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);

      const result = await service.getTimeToHire('comp-1', {});

      expect(result.overallAvgDays).toBeNull();
      expect(result.hiresCount).toBe(0);
      expect(result.byJob).toEqual([]);
    });
  });

  describe('getSourceEffectiveness', () => {
    it('merges candidate counts, hire counts, and costs per channel', async () => {
      prisma.candidate.groupBy
        .mockResolvedValueOnce([
          { sourceChannel: 'LINKEDIN', _count: 40, _avg: { overallScore: 71.2 } },
          { sourceChannel: 'REFERRAL', _count: 10, _avg: { overallScore: 80 } },
          { sourceChannel: null, _count: 5, _avg: { overallScore: 60 } },
        ])
        .mockResolvedValueOnce([
          { sourceChannel: 'LINKEDIN', _count: 5 },
          { sourceChannel: null, _count: 0 },
        ]);
      prisma.channelCost.findMany.mockResolvedValue([{ channel: 'LINKEDIN', monthlyCost: 50000 }]);

      const result = await service.getSourceEffectiveness('comp-1', {});

      const linkedin = result.channels.find((c) => c.channel === 'LINKEDIN');
      expect(linkedin).toMatchObject({
        candidateCount: 40,
        avgScore: 71.2,
        hireCount: 5,
        hireRate: 5 / 40,
        monthlyCost: 50000,
        costPerHire: 10000,
      });

      const referral = result.channels.find((c) => c.channel === 'REFERRAL');
      expect(referral).toMatchObject({
        hireCount: 0,
        hireRate: 0,
        monthlyCost: null,
        costPerHire: null,
      });

      const unattributed = result.channels.find((c) => c.channel === null);
      expect(unattributed).toMatchObject({ candidateCount: 5, hireCount: 0 });
    });
  });

  describe('getSummary', () => {
    it('composes counts with getTimeToHire and getSourceEffectiveness', async () => {
      prisma.candidate.count.mockResolvedValueOnce(120).mockResolvedValueOnce(9);
      jest.spyOn(service, 'getTimeToHire').mockResolvedValue({
        startDate: 's',
        endDate: 'e',
        overallAvgDays: 18.4,
        hiresCount: 9,
        byJob: [],
      } as any);
      jest.spyOn(service, 'getSourceEffectiveness').mockResolvedValue({
        startDate: 's',
        endDate: 'e',
        channels: [
          { channel: 'LINKEDIN', candidateCount: 40, avgScore: 70, hireCount: 5, hireRate: 0.125, monthlyCost: null, costPerHire: null },
          { channel: 'REFERRAL', candidateCount: 10, avgScore: 80, hireCount: 2, hireRate: 0.2, monthlyCost: null, costPerHire: null },
        ],
      } as any);

      const result = await service.getSummary('comp-1', {});

      expect(result).toMatchObject({
        totalCandidates: 120,
        hires: 9,
        avgTimeToHireDays: 18.4,
        topChannel: { channel: 'LINKEDIN', hireCount: 5 },
      });
    });

    it('returns a null topChannel when no channel has any hires', async () => {
      prisma.candidate.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      jest.spyOn(service, 'getTimeToHire').mockResolvedValue({
        startDate: 's',
        endDate: 'e',
        overallAvgDays: null,
        hiresCount: 0,
        byJob: [],
      } as any);
      jest.spyOn(service, 'getSourceEffectiveness').mockResolvedValue({
        startDate: 's',
        endDate: 'e',
        channels: [
          { channel: 'LINKEDIN', candidateCount: 3, avgScore: null, hireCount: 0, hireRate: 0, monthlyCost: null, costPerHire: null },
        ],
      } as any);

      const result = await service.getSummary('comp-1', {});

      expect(result.topChannel).toBeNull();
    });
  });

  describe('segment filters', () => {
    const segment = { country: ['Egypt'], minScore: 70, startDate: '2026-01-01', endDate: '2026-01-31' };

    const expectSegment = (where: any) =>
      expect(flatten(where)).toEqual(
        expect.arrayContaining([
          { companyId: 'comp-1' },
          { country: { in: ['Egypt'] } },
          { overallScore: { gte: 70 } },
        ]),
      );

    it('applies the same candidate filters to every report', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);
      prisma.channelCost.findMany.mockResolvedValue([]);

      await service.getFunnel('comp-1', segment);
      await service.getTimeToHire('comp-1', segment);
      await service.getSourceEffectiveness('comp-1', segment);
      await service.getSummary('comp-1', segment);

      for (const [args] of prisma.candidate.groupBy.mock.calls) expectSegment(args.where);
      for (const [args] of prisma.candidate.findMany.mock.calls) expectSegment(args.where);
      for (const [args] of prisma.candidate.count.mock.calls) expectSegment(args.where);
      // funnel + 2x source effectiveness (direct) + 2x again via summary
      expect(prisma.candidate.groupBy).toHaveBeenCalledTimes(5);
    });

    it('keeps each report on its own date column', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);
      prisma.candidate.groupBy.mockResolvedValue([]);
      prisma.channelCost.findMany.mockResolvedValue([]);

      await service.getSummary('comp-1', segment);

      const [created, hired] = prisma.candidate.count.mock.calls.map(([a]: any[]) => flatten(a.where));
      expect(created.some((c: any) => 'createdAt' in c)).toBe(true);
      expect(created.some((c: any) => 'hiredAt' in c)).toBe(false);
      expect(hired.some((c: any) => 'hiredAt' in c)).toBe(true);
      expect(hired.some((c: any) => 'createdAt' in c)).toBe(false);
    });

    it('source effectiveness counts hires within the segment', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);
      prisma.channelCost.findMany.mockResolvedValue([]);

      await service.getSourceEffectiveness('comp-1', segment);

      const hiresWhere = prisma.candidate.groupBy.mock.calls[1][0].where;
      expectSegment(hiresWhere);
      expect(flatten(hiresWhere)).toContainEqual({ hiredAt: { not: null } });
    });

    it('drops the gender filter when the company has not opted in', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);
      await service.getFunnel('comp-1', { gender: ['FEMALE'] as any });
      const conditions = flatten(prisma.candidate.groupBy.mock.calls[0][0].where);
      expect(conditions.some((c) => 'gender' in c)).toBe(false);

      prisma.company.findUnique.mockResolvedValue({ collectGenderData: true });
      await service.getFunnel('comp-1', { gender: ['FEMALE'] as any });
      expect(flatten(prisma.candidate.groupBy.mock.calls[1][0].where)).toContainEqual({
        gender: { in: ['FEMALE'] },
      });
    });
  });

  describe('getBreakdown', () => {
    const period = { startDate: '2026-01-01', endDate: '2026-01-31' };
    const candidate = (fields: Record<string, unknown>) => ({
      hiredAt: null,
      overallScore: null,
      ...fields,
    });

    const run = (dimension: string, rows: any[], query: Record<string, unknown> = {}) => {
      prisma.candidate.findMany.mockResolvedValue(rows);
      return service.getBreakdown('comp-1', { ...period, ...query, dimension } as any);
    };

    it('tallies candidates, hires, hire rate and average score per value', async () => {
      const result = await run('country', [
        candidate({ country: 'Egypt', hiredAt: new Date(), overallScore: 80 }),
        candidate({ country: 'Egypt', overallScore: 60 }),
        candidate({ country: 'Egypt' }),
        candidate({ country: 'UAE', overallScore: 90 }),
        candidate({ country: null }),
        candidate({ country: '  ' }),
      ]);

      expect(result.total).toBe(6);
      expect(result.rows).toEqual([
        { value: 'Egypt', label: 'Egypt', candidates: 3, hires: 1, hireRate: 1 / 3, avgScore: 70 },
        { value: 'UAE', label: 'UAE', candidates: 1, hires: 0, hireRate: 0, avgScore: 90 },
      ]);
      expect(result.unknown).toMatchObject({ value: '__unknown', candidates: 2 });
    });

    it('scopes to the segment and the created-in-period cohort, selecting only needed columns', async () => {
      await run('skills', [], { country: ['Egypt'] });
      const args = prisma.candidate.findMany.mock.calls[0][0];
      expect(flatten(args.where)).toEqual(
        expect.arrayContaining([
          { companyId: 'comp-1' },
          { country: { in: ['Egypt'] } },
          expect.objectContaining({ createdAt: expect.any(Object) }),
        ]),
      );
      expect(args.select).toEqual({ hiredAt: true, overallScore: true, skillsNormalized: true });
    });

    it('counts a candidate once under each of its values for multi-valued dimensions', async () => {
      const result = await run('skills', [
        candidate({ skillsNormalized: ['react', 'sql', 'react'] }),
        candidate({ skillsNormalized: ['react'] }),
        candidate({ skillsNormalized: [] }),
      ]);
      expect(result.rows.map((r) => [r.value, r.candidates])).toEqual([
        ['react', 2],
        ['sql', 1],
      ]);
      expect(result.unknown?.candidates).toBe(1);
    });

    it('only shows the values the segment already selected for that dimension', async () => {
      const result = await run(
        'skills',
        [candidate({ skillsNormalized: ['react', 'docker'] }), candidate({ skillsNormalized: ['sql'] })],
        { skills: ['React', 'SQL'] },
      );
      expect(result.rows.map((r) => r.value).sort()).toEqual(['react', 'sql']);
    });

    it('buckets experience with inclusive bounds that map onto filter params', async () => {
      const result = await run('experience', [
        candidate({ totalExperienceYears: 0.9 }),
        candidate({ totalExperienceYears: 1 }),
        candidate({ totalExperienceYears: 2.9 }),
        candidate({ totalExperienceYears: 10 }),
        candidate({ totalExperienceYears: null }),
      ]);
      expect(result.rows).toEqual([
        expect.objectContaining({ value: '0-1', candidates: 1, range: { min: 0, max: 0.9 } }),
        expect.objectContaining({ value: '1-3', candidates: 2, range: { min: 1, max: 2.9 } }),
        expect.objectContaining({ value: '10+', candidates: 1, range: { min: 10, max: 60 } }),
      ]);
      expect(result.unknown?.candidates).toBe(1);
    });

    it('buckets integer scores at 49/50 and keeps buckets in order', async () => {
      const result = await run('score', [
        candidate({ overallScore: 49 }),
        candidate({ overallScore: 50 }),
        candidate({ overallScore: 95 }),
      ]);
      expect(result.rows.map((r) => [r.value, r.candidates])).toEqual([
        ['90-100', 1],
        ['50-69', 1],
        ['0-49', 1],
      ]);
    });

    it('buckets legacy free-text AI recommendations and scopes them to a single selected job', async () => {
      const rows = [
        candidate({
          scores: [
            { recommendation: 'Highly recommended for interview', jobId: JOB_A },
            { recommendation: 'Consider', jobId: JOB_B },
          ],
        }),
        candidate({ scores: [{ recommendation: 'no idea', jobId: JOB_A }] }),
      ];
      const all = await run('aiRecommendation', rows);
      expect(all.rows.map((r) => [r.value, r.candidates])).toEqual([
        ['Highly Recommended', 1],
        ['Consider', 1],
      ]);
      expect(all.unknown?.candidates).toBe(1);

      const scoped = await run('aiRecommendation', rows, { jobId: [JOB_A] });
      expect(scoped.rows.map((r) => r.value)).toEqual(['Highly Recommended']);
    });

    it('labels jobs by title and keeps unassigned candidates as a drillable row', async () => {
      const result = await run('job', [
        candidate({ jobId: JOB_A, job: { title: 'Backend Engineer' } }),
        candidate({ jobId: null, job: null }),
      ]);
      expect(result.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: JOB_A, label: 'Backend Engineer' }),
          expect.objectContaining({ value: '__unassigned', label: 'Unassigned' }),
        ]),
      );
      expect(result.unknown).toBeNull();
    });

    it('orders education levels from highest to lowest', async () => {
      const result = await run('educationLevel', [
        candidate({ educationLevel: 'BACHELOR' }),
        candidate({ educationLevel: 'BACHELOR' }),
        candidate({ educationLevel: 'DOCTORATE' }),
      ]);
      expect(result.rows.map((r) => r.value)).toEqual(['DOCTORATE', 'BACHELOR']);
    });

    it('caps high-cardinality dimensions at the top 20 values', async () => {
      const rows = Array.from({ length: 25 }, (_, i) =>
        candidate({ city: `City ${String(i).padStart(2, '0')}` }),
      );
      rows.push(candidate({ city: 'City 24' }));
      const result = await run('city', rows);
      expect(result.rows).toHaveLength(20);
      expect(result.rows[0]).toMatchObject({ value: 'City 24', candidates: 2 });
    });

    it('rejects the gender dimension unless the company opted in', async () => {
      await expect(run('gender', [])).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();

      prisma.company.findUnique.mockResolvedValue({ collectGenderData: true });
      const result = await run('gender', [candidate({ gender: 'FEMALE' })]);
      expect(result.rows[0]).toMatchObject({ value: 'FEMALE', candidates: 1 });
    });
  });

  describe('ReportsQueryDto', () => {
    const parse = async (cls: any, raw: Record<string, unknown>) => {
      const dto = plainToInstance(cls, raw, { enableImplicitConversion: true });
      const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
      return { dto: dto as any, errors };
    };

    it('keeps a single legacy jobId working and accepts candidate filters', async () => {
      const { dto, errors } = await parse(ReportsQueryDto, {
        jobId: JOB_A,
        country: 'Egypt,UAE',
        hasCv: 'false',
        startDate: '2026-01-01',
      });
      expect(errors).toHaveLength(0);
      expect(dto.jobId).toEqual([JOB_A]);
      expect(dto.country).toEqual(['Egypt', 'UAE']);
      expect(dto.hasCv).toBe(false);
    });

    it('rejects candidate-page date filters, sorting and paging', async () => {
      const { errors } = await parse(ReportsQueryDto, {
        createdFrom: '2026-01-01',
        hiredTo: '2026-01-31',
        sortBy: 'name',
        page: '2',
      });
      expect(errors.map((e) => e.property)).toEqual(
        expect.arrayContaining(['createdFrom', 'hiredTo', 'sortBy', 'page']),
      );
    });

    it('requires a known breakdown dimension', async () => {
      expect((await parse(ReportsBreakdownQueryDto, { dimension: 'skills' })).errors).toHaveLength(0);
      const bad = await parse(ReportsBreakdownQueryDto, { dimension: 'salary' });
      expect(bad.errors.map((e) => e.property)).toContain('dimension');
      const missing = await parse(ReportsBreakdownQueryDto, {});
      expect(missing.errors.map((e) => e.property)).toContain('dimension');
    });
  });

  describe('getChannelCosts', () => {
    it('fills in all CandidateSourceChannel values, defaulting missing ones to null', async () => {
      prisma.channelCost.findMany.mockResolvedValue([{ channel: 'LINKEDIN', monthlyCost: 50000 }]);

      const result = await service.getChannelCosts('comp-1');

      expect(result.channels).toHaveLength(9);
      expect(result.channels.find((c) => c.channel === 'LINKEDIN')?.monthlyCost).toBe(50000);
      expect(result.channels.find((c) => c.channel === 'WUZZUF')?.monthlyCost).toBeNull();
    });
  });

  describe('updateChannelCosts', () => {
    it('upserts one row per submitted channel, keyed on companyId_channel', async () => {
      prisma.channelCost.upsert.mockResolvedValue({});
      prisma.channelCost.findMany.mockResolvedValue([]);

      await service.updateChannelCosts('comp-1', {
        costs: [
          { channel: 'LINKEDIN' as any, monthlyCost: 50000 },
          { channel: 'WUZZUF' as any, monthlyCost: 20000 },
        ],
      });

      expect(prisma.channelCost.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.channelCost.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId_channel: { companyId: 'comp-1', channel: 'LINKEDIN' } },
        }),
      );
    });
  });
});
