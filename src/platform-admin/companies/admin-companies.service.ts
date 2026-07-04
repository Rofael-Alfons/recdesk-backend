import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { ListQueryDto, UpdateCompanyStatusDto } from '../dto';

@Injectable()
export class AdminCompaniesService {
  private readonly logger = new Logger(AdminCompaniesService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  /**
   * Paginated, searchable list of ALL companies across the platform.
   */
  async findAll(query: ListQueryDto) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { domain: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, companies] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, jobs: true, candidates: true } },
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              plan: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: companies.map((c) => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
        mode: c.mode,
        plan: c.plan,
        status: c.status,
        createdAt: c.createdAt,
        stats: {
          users: c._count.users,
          jobs: c._count.jobs,
          candidates: c._count.candidates,
        },
        subscription: c.subscription
          ? {
              status: c.subscription.status,
              planName: c.subscription.plan?.name ?? null,
              currentPeriodEnd: c.subscription.currentPeriodEnd,
            }
          : null,
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
   * Full detail for a single company.
   */
  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            users: true,
            jobs: true,
            candidates: true,
            emailConnections: true,
          },
        },
        subscription: { include: { plan: true } },
        users: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return {
      id: company.id,
      name: company.name,
      domain: company.domain,
      mode: company.mode,
      plan: company.plan,
      status: company.status,
      stripeCustomerId: company.stripeCustomerId,
      lastActivityAt: company.lastActivityAt,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      stats: {
        users: company._count.users,
        jobs: company._count.jobs,
        candidates: company._count.candidates,
        emailConnections: company._count.emailConnections,
      },
      subscription: company.subscription
        ? {
            id: company.subscription.id,
            status: company.subscription.status,
            currentPeriodStart: company.subscription.currentPeriodStart,
            currentPeriodEnd: company.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: company.subscription.cancelAtPeriodEnd,
            plan: {
              id: company.subscription.plan.id,
              name: company.subscription.plan.name,
              cvLimit: company.subscription.plan.cvLimit,
              userLimit: company.subscription.plan.userLimit,
            },
          }
        : null,
      users: company.users,
    };
  }

  /**
   * Suspend or reactivate a company. Suspension is enforced at tenant
   * login/token validation. On suspend we also revoke all tenant refresh
   * tokens so active sessions cannot silently refresh.
   */
  async updateStatus(companyId: string, dto: UpdateCompanyStatusDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, status: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { status: dto.status },
      select: { id: true, name: true, status: true },
    });

    if (dto.status === 'SUSPENDED') {
      // Revoke all refresh tokens for users of this company so existing
      // sessions cannot be refreshed once the access token expires.
      await this.prisma.refreshToken.deleteMany({
        where: { user: { companyId } },
      });
      // Drop any cached "active subscription" so guards re-evaluate.
      await this.cacheService.invalidateSubscription(companyId).catch(() => {});
    }

    this.logger.log(
      `Company ${companyId} status set to ${dto.status}` +
        (dto.reason ? ` (reason: ${dto.reason})` : ''),
    );

    return updated;
  }
}
