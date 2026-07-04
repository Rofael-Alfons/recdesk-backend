import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

describe('AdminSubscriptionsService', () => {
  let service: AdminSubscriptionsService;
  let prisma: any;
  let cache: { invalidateSubscription: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn(), update: jest.fn() },
      subscriptionPlan: { findFirst: jest.fn(), findMany: jest.fn() },
      subscription: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      invoice: { findMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    cache = { invalidateSubscription: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(AdminSubscriptionsService);
  });

  describe('grant', () => {
    it('throws NotFound when company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(
        service.grant({ companyId: 'x', plan: 'Starter', months: 12 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequest when plan is missing', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
      await expect(
        service.grant({ companyId: 'c1', plan: 'Nope', months: 12 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts an ACTIVE subscription and invalidates cache', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
      prisma.subscriptionPlan.findFirst.mockResolvedValue({
        id: 'plan-pro',
        name: 'Professional',
      });
      prisma.subscription.upsert.mockResolvedValue({});
      prisma.company.update.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        plan: { id: 'plan-pro', name: 'Professional' },
        company: { id: 'c1', name: 'Acme', status: 'ACTIVE' },
      });

      const result = await service.grant({
        companyId: 'c1',
        plan: 'Professional',
        months: 6,
      });

      expect(prisma.subscription.upsert).toHaveBeenCalled();
      const upsertArg = prisma.subscription.upsert.mock.calls[0][0];
      expect(upsertArg.where).toEqual({ companyId: 'c1' });
      expect(upsertArg.create.status).toBe('ACTIVE');
      expect(cache.invalidateSubscription).toHaveBeenCalledWith('c1');
      expect(result?.status).toBe('ACTIVE');
    });
  });

  describe('update', () => {
    it('throws NotFound when there is no subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(
        service.update('c1', { status: 'CANCELED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies status changes and invalidates cache', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({ id: 'sub-1' }) // existence check
        .mockResolvedValueOnce({
          id: 'sub-1',
          status: 'CANCELED',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false,
          plan: { id: 'p', name: 'Starter' },
          company: { id: 'c1', name: 'Acme', status: 'ACTIVE' },
        });
      prisma.subscription.update.mockResolvedValue({});

      const result = await service.update('c1', { status: 'CANCELED' });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { companyId: 'c1' },
        data: { status: 'CANCELED' },
      });
      expect(cache.invalidateSubscription).toHaveBeenCalledWith('c1');
      expect(result?.status).toBe('CANCELED');
    });
  });

  describe('getInvoices', () => {
    it('throws NotFound for an unknown company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.getInvoices('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
