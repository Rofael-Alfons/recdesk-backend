import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { ReferralsService } from './referrals.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { BillingService } from '../billing/billing.service';

describe('ReferralsService', () => {
  let service: ReferralsService;
  let prisma: any;
  let uploadService: { uploadReferralCV: jest.Mock };
  let billingService: { getSubscription: jest.Mock; checkLimit: jest.Mock };

  const companyId = 'comp-1';
  const future = new Date(Date.now() + 86_400_000);

  const referrerRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    firstName: 'Omar',
    companyId,
    referralCode: 'abc123',
    isActive: true,
    company: { id: companyId, name: 'Acme', status: 'ACTIVE' },
    ...overrides,
  });

  const makeFile = () =>
    ({
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('cv'),
    }) as Express.Multer.File;

  const dto = { fullName: 'Jane Doe', email: 'jane@example.com' };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      job: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      candidate: { groupBy: jest.fn() },
    };
    uploadService = {
      uploadReferralCV: jest.fn().mockResolvedValue({
        fileName: 'cv.pdf',
        status: 'success',
        candidateId: 'c1',
      }),
    };
    billingService = {
      getSubscription: jest
        .fn()
        .mockResolvedValue({ status: 'ACTIVE', currentPeriodEnd: future }),
      checkLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, current: 0, limit: 100 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: uploadService },
        { provide: BillingService, useValue: billingService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'frontend.url' ? 'https://recdesk.io' : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(ReferralsService);
  });

  describe('getOrCreateCode', () => {
    it('returns the existing code without writing', async () => {
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'existing' });

      await expect(service.getOrCreateCode('user-1')).resolves.toBe('existing');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('creates a code only when none is set', async () => {
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const code = await service.getOrCreateCode('user-1');

      expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', referralCode: null },
        data: { referralCode: code },
      });
    });

    it('retries with a new code on a unique collision', async () => {
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      prisma.user.updateMany
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        )
        .mockResolvedValueOnce({ count: 1 });

      const code = await service.getOrCreateCode('user-1');

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.user.updateMany.mock.calls[1][0].data.referralCode).toBe(
        code,
      );
    });

    it('keeps a code assigned by a concurrent request', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ referralCode: null })
        .mockResolvedValueOnce({ referralCode: 'won-race' });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.getOrCreateCode('user-1')).resolves.toBe('won-race');
    });
  });

  describe('getMyLink', () => {
    it('builds the link from the primary frontend URL', async () => {
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'abc123' });

      const result = await service.getMyLink('user-1', companyId);

      expect(result).toEqual({
        code: 'abc123',
        url: 'https://recdesk.io/refer/abc123',
        job: null,
      });
    });

    it('adds the job to the link when it belongs to the company', async () => {
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'abc123' });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
      });

      const result = await service.getMyLink('user-1', companyId, 'job-1');

      expect(prisma.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', companyId },
        select: { id: true, title: true },
      });
      expect(result.url).toBe('https://recdesk.io/refer/abc123?jobId=job-1');
    });

    it("rejects another company's job", async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.getMyLink('user-1', companyId, 'job-x'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPublicReferral', () => {
    it('returns company, referrer first name and active jobs only', async () => {
      prisma.user.findUnique.mockResolvedValue(referrerRow());
      prisma.job.findMany.mockResolvedValue([
        { id: 'job-1', title: 'Engineer' },
      ]);

      const result = await service.getPublicReferral('abc123');

      expect(result).toEqual({
        companyName: 'Acme',
        referrerFirstName: 'Omar',
        jobs: [{ id: 'job-1', title: 'Engineer' }],
      });
      expect(prisma.job.findMany.mock.calls[0][0].where).toEqual({
        companyId,
        status: 'ACTIVE',
      });
    });

    it.each([
      ['unknown code', null],
      ['inactive user', referrerRow({ isActive: false })],
      [
        'suspended company',
        referrerRow({
          company: { id: companyId, name: 'Acme', status: 'SUSPENDED' },
        }),
      ],
    ])('404s for %s', async (_label, row) => {
      prisma.user.findUnique.mockResolvedValue(row);

      await expect(service.getPublicReferral('abc123')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('submitReferral', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(referrerRow());
    });

    it('submits through the upload pipeline with referral attribution', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job-1' });
      const file = makeFile();

      const result = await service.submitReferral(
        'abc123',
        { ...dto, jobId: 'job-1' },
        file,
      );

      expect(result).toEqual({ status: 'received' });
      expect(prisma.job.findFirst.mock.calls[0][0].where).toEqual({
        id: 'job-1',
        companyId,
        status: 'ACTIVE',
      });
      expect(uploadService.uploadReferralCV).toHaveBeenCalledWith(
        file,
        companyId,
        'job-1',
        {
          source: 'REFERRAL',
          sourceChannel: 'REFERRAL',
          referredByUserId: 'user-1',
          referralCode: 'abc123',
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: undefined,
        },
      );
    });

    it('requires a file', async () => {
      await expect(
        service.submitReferral('abc123', dto, undefined as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a job that is not open', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.submitReferral(
          'abc123',
          { ...dto, jobId: 'job-closed' },
          makeFile(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadService.uploadReferralCV).not.toHaveBeenCalled();
    });

    it('refuses when the company is over its CV limit', async () => {
      billingService.checkLimit.mockResolvedValue({
        allowed: false,
        current: 100,
        limit: 100,
      });

      await expect(
        service.submitReferral('abc123', dto, makeFile()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(uploadService.uploadReferralCV).not.toHaveBeenCalled();
    });

    it('refuses when the subscription is inactive', async () => {
      billingService.getSubscription.mockResolvedValue({
        status: 'CANCELED',
        currentPeriodEnd: future,
      });

      await expect(
        service.submitReferral('abc123', dto, makeFile()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns a generic conflict for duplicates', async () => {
      uploadService.uploadReferralCV.mockResolvedValue({
        fileName: 'cv.pdf',
        status: 'failed',
        duplicate: true,
        error:
          'Duplicate: candidate with email jane@example.com already exists',
      });

      const error = await service
        .submitReferral('abc123', dto, makeFile())
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).not.toContain('jane@example.com');
    });
  });

  describe('getLeaderboard', () => {
    it('merges counts, scopes to the company and sorts by hires', async () => {
      prisma.candidate.groupBy
        .mockResolvedValueOnce([
          { referredByUserId: 'u1', _count: { _all: 10 } },
          { referredByUserId: 'u2', _count: { _all: 3 } },
          { referredByUserId: 'u3', _count: { _all: 5 } },
        ])
        .mockResolvedValueOnce([
          { referredByUserId: 'u1', _count: { _all: 4 } },
          { referredByUserId: 'u2', _count: { _all: 2 } },
          { referredByUserId: 'u3', _count: { _all: 4 } },
        ])
        .mockResolvedValueOnce([
          { referredByUserId: 'u2', _count: { _all: 2 } },
          { referredByUserId: 'u3', _count: { _all: 1 } },
        ]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          firstName: 'A',
          lastName: 'One',
          avatarUrl: null,
          isActive: true,
        },
        {
          id: 'u2',
          firstName: 'B',
          lastName: 'Two',
          avatarUrl: null,
          isActive: true,
        },
        {
          id: 'u3',
          firstName: 'C',
          lastName: 'Three',
          avatarUrl: null,
          isActive: false,
        },
      ]);

      const rows = await service.getLeaderboard(companyId, {});

      expect(rows.map((r) => r.userId)).toEqual(['u2', 'u3', 'u1']);
      expect(rows[0]).toMatchObject({
        referred: 3,
        reachedInterview: 2,
        hires: 2,
      });
      expect(rows[2]).toMatchObject({
        referred: 10,
        reachedInterview: 4,
        hires: 0,
      });

      for (const [args] of prisma.candidate.groupBy.mock.calls) {
        expect(args.where).toMatchObject({
          companyId,
          referredByUserId: { not: null },
        });
      }
      expect(prisma.candidate.groupBy.mock.calls[1][0].where.OR).toEqual([
        { status: { in: ['INTERVIEWING', 'OFFERED', 'HIRED'] } },
        { interviews: { some: {} } },
      ]);
      expect(prisma.candidate.groupBy.mock.calls[2][0].where.status).toBe(
        'HIRED',
      );
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['u1', 'u2', 'u3'] },
        companyId,
      });
    });

    it('applies an inclusive date range', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);

      await service.getLeaderboard(companyId, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      const where = prisma.candidate.groupBy.mock.calls[0][0].where;
      expect(where.createdAt.gte).toEqual(new Date('2026-09-01'));
      expect(where.createdAt.lte.toISOString()).toBe(
        '2026-09-30T23:59:59.999Z',
      );
    });

    it('returns an empty list when nobody has referred', async () => {
      prisma.candidate.groupBy.mockResolvedValue([]);

      await expect(service.getLeaderboard(companyId, {})).resolves.toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
