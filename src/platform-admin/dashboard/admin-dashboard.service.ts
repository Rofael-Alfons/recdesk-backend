import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Platform-wide KPIs for the super-admin dashboard.
   */
  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];

    const [
      totalCompanies,
      suspendedCompanies,
      totalUsers,
      totalCandidates,
      activeSubscriptions,
      companiesToday,
      recentCompanies,
    ] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count(),
      this.prisma.candidate.count(),
      this.prisma.subscription.count({
        where: { status: { in: activeStatuses } },
      }),
      this.prisma.company.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.company.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          plan: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      companies: {
        total: totalCompanies,
        suspended: suspendedCompanies,
        newToday: companiesToday,
      },
      users: { total: totalUsers },
      candidates: { total: totalCandidates },
      subscriptions: { active: activeSubscriptions },
      recentCompanies,
    };
  }
}
