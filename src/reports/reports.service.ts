import { BadRequestException, Injectable } from '@nestjs/common';
import { CandidateSourceChannel, CandidateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildCandidateWhere } from '../candidates/candidate-where.builder';
import {
  ReportsBreakdownQueryDto,
  ReportsQueryDto,
  UpdateChannelCostsDto,
} from './dto';
import {
  BreakdownReport,
  BreakdownRow,
  BREAKDOWN_SPECS,
  BREAKDOWN_TOP_N,
} from './breakdown-dimensions';

// Ordered active/hired funnel stages. REJECTED/WITHDRAWN are terminal exits
// tracked separately — see getFunnel()'s droppedOff bucket.
const FUNNEL_STAGES: CandidateStatus[] = [
  CandidateStatus.NEW,
  CandidateStatus.SCREENING,
  CandidateStatus.SHORTLISTED,
  CandidateStatus.INTERVIEWING,
  CandidateStatus.OFFERED,
  CandidateStatus.HIRED,
];

interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // A bare "YYYY-MM-DD" endDate (what the frontend's date-only picker
  // sends) parses to midnight UTC at the *start* of that day, which would
  // exclude every candidate created later that same day from an "up to
  // today" range. Push it to the end of that calendar day so the range is
  // inclusive. Full ISO datetime strings are left untouched.
  private inclusiveEndDate(value: string): Date {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }

  // Defaults to the company's current billing period (same lookup as
  // billing.service.ts getUsage()), falling back to start-of-calendar-month
  // when there's no subscription row — billing's own new Date()/new Date()
  // fallback collapses to a zero-length window and isn't usable here.
  private async resolveDateRange(
    companyId: string,
    query: ReportsQueryDto,
  ): Promise<ResolvedDateRange> {
    if (query.startDate && query.endDate) {
      return {
        startDate: new Date(query.startDate),
        endDate: this.inclusiveEndDate(query.endDate),
      };
    }

    const subscription = await this.prisma.subscription.findUnique({ where: { companyId } });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const defaultStart = subscription?.currentPeriodStart ?? startOfMonth;
    const defaultEnd = subscription?.currentPeriodEnd ?? now;

    return {
      startDate: query.startDate ? new Date(query.startDate) : defaultStart,
      endDate: query.endDate ? this.inclusiveEndDate(query.endDate) : defaultEnd,
    };
  }

  private async isGenderEnabled(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { collectGenderData: true },
    });
    return company?.collectGenderData ?? false;
  }

  /**
   * The candidate filters (same builder as GET /candidates) ANDed with a
   * report's own period condition, so a report and its drill-down list
   * always agree on who is in the segment.
   */
  private async segmentWhere(
    companyId: string,
    query: ReportsQueryDto,
    period: Prisma.CandidateWhereInput,
  ): Promise<{ where: Prisma.CandidateWhereInput; genderEnabled: boolean }> {
    const { startDate: _start, endDate: _end, ...filters } = query as ReportsBreakdownQueryDto;
    const genderEnabled = await this.isGenderEnabled(companyId);
    return {
      where: { AND: [buildCandidateWhere(companyId, filters, genderEnabled), period] },
      genderEnabled,
    };
  }

  async getFunnel(companyId: string, query: ReportsQueryDto) {
    const { startDate, endDate } = await this.resolveDateRange(companyId, query);

    const { where } = await this.segmentWhere(companyId, query, {
      createdAt: { gte: startDate, lte: endDate },
    });

    const counts = await this.prisma.candidate.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const countByStatus = counts.reduce(
      (acc, row) => {
        acc[row.status] = row._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    // "Reached stage N" = candidates whose status ordinal is >= N, i.e. a
    // suffix sum over the ordered stages — not just candidates currently
    // sitting in stage N (otherwise anyone who progressed further would
    // wrongly look like a drop-off at every earlier stage).
    const reachedByStage = FUNNEL_STAGES.map((_, index) =>
      FUNNEL_STAGES.slice(index).reduce((sum, s) => sum + (countByStatus[s] ?? 0), 0),
    );

    const stages = FUNNEL_STAGES.map((status, index) => {
      const reached = reachedByStage[index];
      const previous = index > 0 ? reachedByStage[index - 1] : null;
      return {
        status,
        reached,
        conversionFromPrevious: index === 0 || !previous ? null : reached / previous,
      };
    });

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      jobId: query.jobId?.length === 1 ? query.jobId[0] : null,
      jobIds: query.jobId ?? [],
      stages,
      droppedOff: {
        rejected: countByStatus[CandidateStatus.REJECTED] ?? 0,
        withdrawn: countByStatus[CandidateStatus.WITHDRAWN] ?? 0,
      },
      note: 'REJECTED/WITHDRAWN candidates are not attributed to earlier stages because current data has no stage-transition history.',
    };
  }

  async getTimeToHire(companyId: string, query: ReportsQueryDto) {
    const { startDate, endDate } = await this.resolveDateRange(companyId, query);

    // Narrow projection, not full candidate rows — per-company hire volumes
    // are small, so a JS-side average is simpler than a raw-SQL date-diff
    // aggregate and matches this codebase's existing groupBy+reduce style.
    const { where } = await this.segmentWhere(companyId, query, {
      hiredAt: { not: null, gte: startDate, lte: endDate },
    });
    const hires = await this.prisma.candidate.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        hiredAt: true,
        jobId: true,
        job: { select: { title: true } },
      },
    });

    const daysToHire = (createdAt: Date, hiredAt: Date) =>
      (hiredAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    const overallAvgDays =
      hires.length > 0
        ? hires.reduce((sum, c) => sum + daysToHire(c.createdAt, c.hiredAt!), 0) / hires.length
        : null;

    const byJobMap = new Map<
      string,
      { jobId: string | null; jobTitle: string; totalDays: number; hiresCount: number }
    >();
    for (const c of hires) {
      const key = c.jobId ?? 'unassigned';
      const entry = byJobMap.get(key) ?? {
        jobId: c.jobId,
        jobTitle: c.job?.title ?? 'Unassigned',
        totalDays: 0,
        hiresCount: 0,
      };
      entry.totalDays += daysToHire(c.createdAt, c.hiredAt!);
      entry.hiresCount += 1;
      byJobMap.set(key, entry);
    }

    const byJob = Array.from(byJobMap.values()).map((entry) => ({
      jobId: entry.jobId,
      jobTitle: entry.jobTitle,
      avgDays: entry.totalDays / entry.hiresCount,
      hiresCount: entry.hiresCount,
    }));

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      overallAvgDays,
      hiresCount: hires.length,
      byJob,
    };
  }

  async getSourceEffectiveness(companyId: string, query: ReportsQueryDto) {
    const { startDate, endDate } = await this.resolveDateRange(companyId, query);

    const { where } = await this.segmentWhere(companyId, query, {
      createdAt: { gte: startDate, lte: endDate },
    });

    const [candidateGroups, hireGroups, costs] = await Promise.all([
      this.prisma.candidate.groupBy({
        by: ['sourceChannel'],
        where,
        _count: true,
        _avg: { overallScore: true },
      }),
      this.prisma.candidate.groupBy({
        by: ['sourceChannel'],
        where: { AND: [where, { hiredAt: { not: null } }] },
        _count: true,
      }),
      this.prisma.channelCost.findMany({ where: { companyId } }),
    ]);

    const hireCountByChannel = hireGroups.reduce(
      (acc, row) => {
        acc[row.sourceChannel ?? 'null'] = row._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    const costByChannel = costs.reduce(
      (acc, row) => {
        acc[row.channel] = row.monthlyCost;
        return acc;
      },
      {} as Record<string, number>,
    );

    const channels = candidateGroups.map((row) => {
      const candidateCount = row._count;
      const hireCount = hireCountByChannel[row.sourceChannel ?? 'null'] ?? 0;
      const monthlyCost = row.sourceChannel ? (costByChannel[row.sourceChannel] ?? null) : null;

      return {
        channel: row.sourceChannel,
        candidateCount,
        avgScore: row._avg.overallScore,
        hireCount,
        hireRate: candidateCount > 0 ? hireCount / candidateCount : null,
        monthlyCost,
        costPerHire: monthlyCost != null && hireCount > 0 ? monthlyCost / hireCount : null,
      };
    });

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      channels,
    };
  }

  async getSummary(companyId: string, query: ReportsQueryDto) {
    const { startDate, endDate } = await this.resolveDateRange(companyId, query);

    const [created, hired] = await Promise.all([
      this.segmentWhere(companyId, query, { createdAt: { gte: startDate, lte: endDate } }),
      this.segmentWhere(companyId, query, { hiredAt: { gte: startDate, lte: endDate } }),
    ]);

    const [totalCandidates, hires, timeToHire, sourceEffectiveness] = await Promise.all([
      this.prisma.candidate.count({ where: created.where }),
      this.prisma.candidate.count({ where: hired.where }),
      this.getTimeToHire(companyId, query),
      this.getSourceEffectiveness(companyId, query),
    ]);

    const topChannel = sourceEffectiveness.channels
      .filter((c) => c.hireCount > 0)
      .sort((a, b) => b.hireCount - a.hireCount)[0];

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalCandidates,
      hires,
      avgTimeToHireDays: timeToHire.overallAvgDays,
      topChannel: topChannel ? { channel: topChannel.channel, hireCount: topChannel.hireCount } : null,
    };
  }

  /**
   * Candidates created in the period (matching the segment), grouped by one
   * dimension, with hires, hire rate and average score per value. Hires are
   * cohort-based, as in getSourceEffectiveness. Multi-valued dimensions
   * (skills, tags, ...) count a candidate once under each of its values, the
   * same "has any of" meaning the list filters use.
   */
  async getBreakdown(
    companyId: string,
    query: ReportsBreakdownQueryDto,
  ): Promise<BreakdownReport> {
    const { startDate, endDate } = await this.resolveDateRange(companyId, query);
    const { where, genderEnabled } = await this.segmentWhere(companyId, query, {
      createdAt: { gte: startDate, lte: endDate },
    });

    if (query.dimension === 'gender' && !genderEnabled) {
      throw new BadRequestException('Gender collection is not enabled for this company');
    }

    const spec = BREAKDOWN_SPECS[query.dimension];
    const candidates = await this.prisma.candidate.findMany({
      where,
      select: { hiredAt: true, overallScore: true, ...spec.select },
    });

    const ctx = { scoreJobId: query.jobId?.length === 1 ? query.jobId[0] : undefined };
    const restrict = spec.restrictTo?.(query);
    const allowed = restrict?.length ? new Set(restrict) : null;

    interface Tally {
      label: string;
      candidates: number;
      hires: number;
      scoreSum: number;
      scoreCount: number;
    }
    const newTally = (label: string): Tally => ({
      label,
      candidates: 0,
      hires: 0,
      scoreSum: 0,
      scoreCount: 0,
    });
    const add = (tally: Tally, row: { hiredAt: Date | null; overallScore: number | null }) => {
      tally.candidates += 1;
      if (row.hiredAt) tally.hires += 1;
      if (row.overallScore !== null) {
        tally.scoreSum += row.overallScore;
        tally.scoreCount += 1;
      }
    };

    const tallies = new Map<string, Tally>();
    const unknown = newTally('Unknown');
    for (const row of candidates) {
      const values = [...new Set(spec.values(row, ctx))].filter(
        (v) => !allowed || allowed.has(v),
      );
      if (values.length === 0) {
        add(unknown, row);
        continue;
      }
      for (const value of values) {
        let tally = tallies.get(value);
        if (!tally) {
          const bucket = spec.buckets?.find((b) => b.value === value);
          tally = newTally(bucket?.label ?? spec.label?.(value, row) ?? value);
          tallies.set(value, tally);
        }
        add(tally, row);
      }
    }

    const toRow = (value: string, t: Tally): BreakdownRow => {
      const bucket = spec.buckets?.find((b) => b.value === value);
      return {
        value,
        label: t.label,
        candidates: t.candidates,
        hires: t.hires,
        hireRate: t.candidates > 0 ? t.hires / t.candidates : null,
        avgScore: t.scoreCount > 0 ? t.scoreSum / t.scoreCount : null,
        ...(bucket && { range: { min: bucket.min, max: bucket.max } }),
      };
    };

    let rows = [...tallies.entries()].map(([value, t]) => toRow(value, t));
    if (spec.order) {
      const rank = (v: string) => {
        const i = spec.order!.indexOf(v);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      rows.sort((a, b) => rank(a.value) - rank(b.value) || b.candidates - a.candidates);
    } else {
      rows.sort((a, b) => b.candidates - a.candidates || a.label.localeCompare(b.label));
      rows = rows.slice(0, BREAKDOWN_TOP_N);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      dimension: query.dimension,
      total: candidates.length,
      rows,
      unknown: unknown.candidates > 0 ? toRow('__unknown', unknown) : null,
    };
  }

  async getChannelCosts(companyId: string) {
    const costs = await this.prisma.channelCost.findMany({ where: { companyId } });
    const costByChannel = costs.reduce(
      (acc, row) => {
        acc[row.channel] = row.monthlyCost;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      channels: Object.values(CandidateSourceChannel).map((channel) => ({
        channel,
        monthlyCost: costByChannel[channel] ?? null,
      })),
    };
  }

  async updateChannelCosts(companyId: string, dto: UpdateChannelCostsDto) {
    await this.prisma.$transaction(
      dto.costs.map((item) =>
        this.prisma.channelCost.upsert({
          where: { companyId_channel: { companyId, channel: item.channel } },
          create: { companyId, channel: item.channel, monthlyCost: item.monthlyCost },
          update: { monthlyCost: item.monthlyCost },
        }),
      ),
    );

    return this.getChannelCosts(companyId);
  }
}
