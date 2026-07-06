import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PlanType, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import {
  GrantSubscriptionDto,
  ListQueryDto,
  UpdateSubscriptionDto,
} from '../dto';

// Maps a plan NAME to the coarse Company.plan enum kept in sync with the
// subscription (mirrors the grant-subscription CLI script).
const PLAN_TO_PLAN_TYPE: Record<string, PlanType> = {
  Starter: PlanType.STARTER,
  Professional: PlanType.PROFESSIONAL,
  Enterprise: PlanType.ENTERPRISE,
};

@Injectable()
export class AdminSubscriptionsService {
  private readonly logger = new Logger(AdminSubscriptionsService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  /**
   * List all subscription plans (including inactive) for the admin UI.
   */
  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Paginated list of company subscriptions across the platform.
   */
  async findAll(query: ListQueryDto) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SubscriptionWhereInput = search
      ? { company: { name: { contains: search, mode: 'insensitive' } } }
      : {};

    const [total, subscriptions] = await this.prisma.$transaction([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { currentPeriodEnd: 'desc' },
        include: {
          plan: { select: { name: true, monthlyPrice: true } },
          company: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);

    return {
      data: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        stripeSubscriptionId: s.stripeSubscriptionId,
        plan: s.plan,
        company: s.company,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Grant / comp an ACTIVE subscription without Stripe. Idempotent per company.
   */
  async grant(dto: GrantSubscriptionDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { name: { equals: dto.plan, mode: 'insensitive' } },
    });

    if (!plan) {
      throw new BadRequestException(
        `Plan "${dto.plan}" not found. Seed plans first or use an existing plan name.`,
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + dto.months);

    const companyPlanType =
      PLAN_TO_PLAN_TYPE[plan.name] ?? PlanType.PROFESSIONAL;

    await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { companyId: company.id },
        create: {
          companyId: company.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
      }),
      this.prisma.company.update({
        where: { id: company.id },
        data: { plan: companyPlanType },
      }),
    ]);

    await this.cacheService.invalidateSubscription(company.id).catch(() => {});

    this.logger.log(
      `Granted ${plan.name} subscription to company ${company.id} for ${dto.months} months`,
    );

    return this.findByCompany(company.id);
  }

  /**
   * Change a company's plan and/or subscription status.
   */
  async update(companyId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      throw new NotFoundException('Company has no subscription to update');
    }

    const data: Prisma.SubscriptionUpdateInput = {};

    if (dto.plan) {
      const plan = await this.prisma.subscriptionPlan.findFirst({
        where: { name: { equals: dto.plan, mode: 'insensitive' } },
      });
      if (!plan) {
        throw new BadRequestException(`Plan "${dto.plan}" not found.`);
      }
      data.plan = { connect: { id: plan.id } };

      await this.prisma.company.update({
        where: { id: companyId },
        data: { plan: PLAN_TO_PLAN_TYPE[plan.name] ?? PlanType.PROFESSIONAL },
      });
    }

    if (dto.status) {
      data.status = dto.status;
    }

    await this.prisma.subscription.update({
      where: { companyId },
      data,
    });

    await this.cacheService.invalidateSubscription(companyId).catch(() => {});

    return this.findByCompany(companyId);
  }

  /**
   * Invoices for a company.
   */
  async getInvoices(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async findByCompany(companyId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: {
        plan: true,
        company: { select: { id: true, name: true, status: true } },
      },
    });

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      plan: { id: subscription.plan.id, name: subscription.plan.name },
      company: subscription.company,
    };
  }
}
