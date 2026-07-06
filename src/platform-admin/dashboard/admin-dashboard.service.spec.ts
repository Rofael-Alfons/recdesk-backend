import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      company: { count: jest.fn(), findMany: jest.fn() },
      user: { count: jest.fn() },
      candidate: { count: jest.fn() },
      subscription: { count: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prisma.company.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    prisma.user.count.mockResolvedValue(25);
    prisma.candidate.count.mockResolvedValue(500);
    prisma.subscription.count.mockResolvedValue(8);
    prisma.company.findMany.mockResolvedValue([
      { id: 'comp-1', name: 'Acme', status: 'ACTIVE', plan: 'STARTER', createdAt: new Date() },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AdminDashboardService);
  });

  it('returns platform-wide KPIs', async () => {
    const stats = await service.getStats();

    expect(stats.companies.total).toBe(10);
    expect(stats.companies.suspended).toBe(1);
    expect(stats.companies.newToday).toBe(2);
    expect(stats.users.total).toBe(25);
    expect(stats.candidates.total).toBe(500);
    expect(stats.subscriptions.active).toBe(8);
    expect(stats.recentCompanies).toHaveLength(1);
    expect(prisma.subscription.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
    });
  });
});
