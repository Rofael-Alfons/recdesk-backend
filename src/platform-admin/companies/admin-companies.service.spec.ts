import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminCompaniesService } from './admin-companies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

describe('AdminCompaniesService', () => {
  let service: AdminCompaniesService;
  let prisma: any;
  let cache: { invalidateSubscription: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      // Resolve every query passed into the array.
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    cache = { invalidateSubscription: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(AdminCompaniesService);
  });

  describe('findAll', () => {
    it('paginates and shapes company rows', async () => {
      prisma.company.count.mockResolvedValue(1);
      prisma.company.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Acme',
          domain: 'acme.com',
          mode: 'FULL_ATS',
          plan: 'STARTER',
          status: 'ACTIVE',
          createdAt: new Date(),
          _count: { users: 2, jobs: 1, candidates: 5 },
          subscription: {
            status: 'ACTIVE',
            currentPeriodEnd: new Date(),
            plan: { name: 'Starter' },
          },
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.pagination.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        id: 'c1',
        stats: { users: 2, jobs: 1, candidates: 5 },
        subscription: { status: 'ACTIVE', planName: 'Starter' },
      });
    });

    it('builds a case-insensitive search filter', async () => {
      prisma.company.count.mockResolvedValue(0);
      prisma.company.findMany.mockResolvedValue([]);

      await service.findAll({ page: 2, limit: 10, search: 'acme' });

      const findManyArg = prisma.company.findMany.mock.calls[0][0];
      expect(findManyArg.skip).toBe(10);
      expect(findManyArg.where.OR).toEqual([
        { name: { contains: 'acme', mode: 'insensitive' } },
        { domain: { contains: 'acme', mode: 'insensitive' } },
      ]);
    });
  });

  describe('findOne', () => {
    it('throws NotFound when the company is missing', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('suspends a company and revokes tenant refresh tokens', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'ACTIVE',
      });
      prisma.company.update.mockResolvedValue({
        id: 'c1',
        name: 'Acme',
        status: 'SUSPENDED',
      });

      const result = await service.updateStatus('c1', { status: 'SUSPENDED' });

      expect(result.status).toBe('SUSPENDED');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { user: { companyId: 'c1' } },
      });
      expect(cache.invalidateSubscription).toHaveBeenCalledWith('c1');
    });

    it('reactivating does NOT revoke refresh tokens', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'SUSPENDED',
      });
      prisma.company.update.mockResolvedValue({
        id: 'c1',
        name: 'Acme',
        status: 'ACTIVE',
      });

      await service.updateStatus('c1', { status: 'ACTIVE' });

      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('nope', { status: 'SUSPENDED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
