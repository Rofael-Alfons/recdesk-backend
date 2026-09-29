import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CandidateStatus,
  Prisma,
  SubscriptionStatus,
  UsageType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { BillingService } from '../billing/billing.service';
import { INACTIVE_STATUSES } from '../billing/guards/subscription.guard';
import { LeaderboardQueryDto, SubmitReferralDto } from './dto';

// A referred candidate "reached interview" once their status got this far,
// or if any interview was ever scheduled for them (covers candidates later
// rejected after interviewing).
const REACHED_INTERVIEW_STATUSES: CandidateStatus[] = [
  CandidateStatus.INTERVIEWING,
  CandidateStatus.OFFERED,
  CandidateStatus.HIRED,
];

const CODE_GENERATION_ATTEMPTS = 5;

// Shown to anonymous submitters instead of billing details.
const NOT_ACCEPTING_MESSAGE =
  'This company is not accepting referrals right now. Please try again later.';

export interface LeaderboardRow {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isActive: boolean;
  referred: number;
  reachedInterview: number;
  hires: number;
}

interface ResolvedReferrer {
  id: string;
  firstName: string;
  companyId: string;
  referralCode: string;
  company: { id: string; name: string };
}

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private billingService: BillingService,
    private configService: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return (
      this.configService.get<string>('frontend.url') || 'http://localhost:3001'
    );
  }

  /** Returns the user's persistent referral code, creating it on first use. */
  async getOrCreateCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.referralCode) {
      return user.referralCode;
    }

    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = randomBytes(6).toString('base64url');
      try {
        // Conditional update: if a concurrent request already assigned a
        // code, keep theirs rather than overwriting a link already shared.
        const { count } = await this.prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: code },
        });
        if (count === 0) {
          const current = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { referralCode: true },
          });
          if (current?.referralCode) return current.referralCode;
          continue;
        }
        return code;
      } catch (error) {
        // Unique collision with another user's code — try a fresh one.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not generate a referral code, please retry',
    );
  }

  async getMyLink(userId: string, companyId: string, jobId?: string) {
    let job: { id: string; title: string } | null = null;
    if (jobId) {
      job = await this.prisma.job.findFirst({
        where: { id: jobId, companyId },
        select: { id: true, title: true },
      });
      if (!job) {
        throw new BadRequestException('Job not found');
      }
    }

    const code = await this.getOrCreateCode(userId);
    const url = new URL(`/refer/${code}`, this.frontendUrl);
    if (job) {
      url.searchParams.set('jobId', job.id);
    }

    return { code, url: url.toString(), job };
  }

  private async resolveCode(code: string): Promise<ResolvedReferrer> {
    const user = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        firstName: true,
        companyId: true,
        referralCode: true,
        isActive: true,
        company: { select: { id: true, name: true, status: true } },
      },
    });

    if (
      !user ||
      !user.referralCode ||
      !user.isActive ||
      user.company.status !== 'ACTIVE'
    ) {
      throw new NotFoundException('Referral link is invalid or has expired');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      companyId: user.companyId,
      referralCode: user.referralCode,
      company: { id: user.company.id, name: user.company.name },
    };
  }

  /** Public landing-page data for a referral link. */
  async getPublicReferral(code: string) {
    const referrer = await this.resolveCode(code);
    const jobs = await this.prisma.job.findMany({
      where: { companyId: referrer.companyId, status: 'ACTIVE' },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      companyName: referrer.company.name,
      referrerFirstName: referrer.firstName,
      jobs,
    };
  }

  private async assertCanAcceptCv(companyId: string): Promise<void> {
    // getSubscription may return a cached (untyped) copy; only these fields
    // are relied on, mirroring SubscriptionGuard's status checks.
    const subscription = (await this.billingService.getSubscription(
      companyId,
    )) as {
      status: SubscriptionStatus;
      currentPeriodEnd: Date | string;
    } | null;
    if (
      !subscription ||
      INACTIVE_STATUSES.includes(subscription.status) ||
      new Date(subscription.currentPeriodEnd) < new Date()
    ) {
      throw new ForbiddenException(NOT_ACCEPTING_MESSAGE);
    }

    const limit = await this.billingService.checkLimit(
      companyId,
      UsageType.CV_PROCESSED,
    );
    if (!limit.allowed) {
      throw new ForbiddenException(NOT_ACCEPTING_MESSAGE);
    }
  }

  /**
   * Submit a candidate through a referral link. Anonymous callers can reach
   * this, so the response never includes candidate data.
   */
  async submitReferral(
    code: string,
    dto: SubmitReferralDto,
    file: Express.Multer.File,
  ): Promise<{ status: 'received' }> {
    if (!file) {
      throw new BadRequestException('Please attach a CV (PDF or DOCX)');
    }

    const referrer = await this.resolveCode(code);

    if (dto.jobId) {
      const job = await this.prisma.job.findFirst({
        where: {
          id: dto.jobId,
          companyId: referrer.companyId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!job) {
        throw new BadRequestException('This job is no longer open');
      }
    }

    await this.assertCanAcceptCv(referrer.companyId);

    const result = await this.uploadService.uploadReferralCV(
      file,
      referrer.companyId,
      dto.jobId,
      {
        source: 'REFERRAL',
        sourceChannel: 'REFERRAL',
        referredByUserId: referrer.id,
        referralCode: referrer.referralCode,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
      },
    );

    if (result.status === 'success') {
      return { status: 'received' };
    }

    // Don't reveal whether this person is already in the company's pipeline.
    if (result.duplicate) {
      throw new ConflictException(
        'We already have this candidate on file. Thanks for the referral!',
      );
    }

    throw new BadRequestException(
      result.error === 'Could not extract text from file'
        ? 'We could not read that CV. Please upload a text-based PDF or DOCX.'
        : 'We could not process that CV. Please check the file and try again.',
    );
  }

  private inclusiveEndDate(value: string): Date {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }

  async getLeaderboard(
    companyId: string,
    query: LeaderboardQueryDto,
  ): Promise<LeaderboardRow[]> {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.startDate) createdAt.gte = new Date(query.startDate);
    if (query.endDate) createdAt.lte = this.inclusiveEndDate(query.endDate);

    const base: Prisma.CandidateWhereInput = {
      companyId,
      referredByUserId: { not: null },
      ...(Object.keys(createdAt).length && { createdAt }),
    };

    const [referred, reachedInterview, hires] = await Promise.all([
      this.prisma.candidate.groupBy({
        by: ['referredByUserId'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.candidate.groupBy({
        by: ['referredByUserId'],
        where: {
          ...base,
          OR: [
            { status: { in: REACHED_INTERVIEW_STATUSES } },
            { interviews: { some: {} } },
          ],
        },
        _count: { _all: true },
      }),
      this.prisma.candidate.groupBy({
        by: ['referredByUserId'],
        where: { ...base, status: CandidateStatus.HIRED },
        _count: { _all: true },
      }),
    ]);

    const toMap = (rows: typeof referred) =>
      new Map(rows.map((r) => [r.referredByUserId as string, r._count._all]));
    const interviewMap = toMap(reachedInterview);
    const hireMap = toMap(hires);

    const userIds = referred.map((r) => r.referredByUserId as string);
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isActive: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return referred
      .filter((r) => userMap.has(r.referredByUserId as string))
      .map((r) => {
        const user = userMap.get(r.referredByUserId as string)!;
        return {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          referred: r._count._all,
          reachedInterview: interviewMap.get(user.id) ?? 0,
          hires: hireMap.get(user.id) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.hires - a.hires ||
          b.reachedInterview - a.reachedInterview ||
          b.referred - a.referred ||
          `${a.firstName} ${a.lastName}`.localeCompare(
            `${b.firstName} ${b.lastName}`,
          ),
      );
  }
}
