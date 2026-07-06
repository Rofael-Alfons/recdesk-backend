import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageType } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../cache/cache.service';

const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    subscriptions: { retrieve: jest.fn() },
  }));
});

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;
  let cache: { getSubscription: jest.Mock; setSubscription: jest.Mock };
  let notifications: { checkAndNotifyUsageLimits: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subscriptionPlan: { findMany: jest.fn() },
      subscription: { findUnique: jest.fn(), count: jest.fn() },
      company: { findUnique: jest.fn(), update: jest.fn() },
      usageRecord: { create: jest.fn().mockResolvedValue({}) },
    };
    cache = {
      getSubscription: jest.fn().mockResolvedValue(undefined),
      setSubscription: jest.fn().mockResolvedValue(undefined),
      invalidateSubscription: jest.fn(),
    };
    notifications = {
      checkAndNotifyUsageLimits: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
              if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test';
              return undefined;
            },
          },
        },
        { provide: NotificationsService, useValue: notifications },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  describe('getPlans', () => {
    it('marks current plan for company', async () => {
      prisma.subscriptionPlan.findMany.mockResolvedValue([
        { id: 'plan-1', name: 'Starter', stripePriceId: null, monthlyPrice: 0, annualPrice: null, cvLimit: 100, aiCallLimit: 100, emailSentLimit: 100, emailImportLimit: 100, userLimit: 3, features: {}, sortOrder: 1, isActive: true },
        { id: 'plan-2', name: 'Pro', stripePriceId: 'price_1', monthlyPrice: 99, annualPrice: 999, cvLimit: 1000, aiCallLimit: 1000, emailSentLimit: 1000, emailImportLimit: 1000, userLimit: 10, features: {}, sortOrder: 2, isActive: true },
      ]);
      prisma.subscription.findUnique.mockResolvedValue({ planId: 'plan-2' });

      const plans = await service.getPlans('comp-1');

      expect(plans.find((p) => p.id === 'plan-2')?.isCurrentPlan).toBe(true);
      expect(plans.find((p) => p.id === 'plan-1')?.isCurrentPlan).toBe(false);
    });
  });

  describe('getSubscription', () => {
    it('returns cached subscription when available', async () => {
      cache.getSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });

      const result = await service.getSubscription('comp-1');

      expect(result).toEqual({ id: 'sub-1', status: 'ACTIVE' });
      expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
    });

    it('caches subscription fetched from database', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        plan: {
          id: 'plan-1',
          name: 'Starter',
          cvLimit: 100,
          userLimit: 3,
          aiCallLimit: 100,
          emailSentLimit: 100,
          emailImportLimit: 100,
          features: {},
        },
        company: { id: 'comp-1', name: 'Acme', stripeCustomerId: null },
      });

      const result = await service.getSubscription('comp-1');

      expect(result?.plan.name).toBe('Starter');
      expect(cache.setSubscription).toHaveBeenCalled();
    });
  });

  describe('trackUsage', () => {
    it('creates usage record and checks CV limits', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        currentPeriodStart: new Date('2026-07-01'),
        currentPeriodEnd: new Date('2026-07-31'),
      });

      await service.trackUsage('comp-1', UsageType.CV_PROCESSED);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'comp-1',
          type: UsageType.CV_PROCESSED,
          count: 1,
        }),
      });
      expect(notifications.checkAndNotifyUsageLimits).toHaveBeenCalledWith(
        'comp-1',
      );
    });
  });

  describe('checkLimit', () => {
    it('denies usage when no subscription exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.checkLimit('comp-1', UsageType.CV_PROCESSED);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('No active subscription');
    });

    it('allows unlimited usage when limit is -1', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        plan: { cvLimit: -1, aiCallLimit: -1, emailSentLimit: -1, emailImportLimit: -1 },
      });
      jest.spyOn(service, 'getUsage').mockResolvedValue({
        cvProcessed: 999,
        cvLimit: -1,
        cvUsagePercentage: 0,
        aiCalls: 0,
        aiCallLimit: -1,
        aiCallUsagePercentage: 0,
        emailsSent: 0,
        emailSentLimit: -1,
        emailSentUsagePercentage: 0,
        emailsImported: 0,
        emailImportLimit: -1,
        emailImportUsagePercentage: 0,
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      const result = await service.checkLimit('comp-1', UsageType.CV_PROCESSED);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });
  });

  describe('handleWebhook', () => {
    it('rejects invalid webhook signature', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createCheckoutSession', () => {
    it('throws when Stripe is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BillingService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: { get: () => undefined } },
          { provide: NotificationsService, useValue: notifications },
          { provide: CacheService, useValue: cache },
        ],
      }).compile();

      const unconfigured = module.get(BillingService);

      await expect(
        unconfigured.createCheckoutSession(
          'comp-1',
          'price_1',
          'http://success',
          'http://cancel',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
