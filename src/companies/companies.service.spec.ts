import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: any;

  const companyId = 'comp-1';
  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      job: {
        count: jest.fn(),
      },
      candidate: {
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CompaniesService);
  });

  describe('findOne', () => {
    it('throws ForbiddenException when user belongs to another company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 'other' });

      await expect(service.findOne(companyId, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when company is missing', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId });
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.findOne(companyId, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns company with stats', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId });
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme',
        domain: 'acme.com',
        mode: 'FULL_ATS',
        plan: 'STARTER',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        _count: { users: 3, jobs: 2, candidates: 10 },
      });

      const result = await service.findOne(companyId, userId);

      expect(result.stats).toEqual({
        totalUsers: 3,
        totalJobs: 2,
        totalCandidates: 10,
      });
      expect(result.name).toBe('Acme');
    });
  });

  describe('update', () => {
    it('rejects non-admin updates', async () => {
      await expect(
        service.update(
          companyId,
          { name: 'New Name' },
          userId,
          UserRole.RECRUITER,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects domain already in use', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId });
      prisma.company.findFirst.mockResolvedValue({ id: 'other-comp' });

      await expect(
        service.update(
          companyId,
          { domain: 'Taken.com' },
          userId,
          UserRole.ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates company fields with normalized domain', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId });
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.update.mockResolvedValue({
        id: companyId,
        name: 'Acme Inc',
        domain: 'acme.io',
        mode: 'FULL_ATS',
        plan: 'PRO',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update(
        companyId,
        { name: 'Acme Inc', domain: 'ACME.IO' },
        userId,
        UserRole.ADMIN,
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: { name: 'Acme Inc', domain: 'acme.io' },
      });
      expect(result.domain).toBe('acme.io');
    });
  });

  describe('getStats', () => {
    it('throws when user cannot access company stats', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 'other' });

      await expect(service.getStats(companyId, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns aggregated hiring stats', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId });
      prisma.user.count.mockResolvedValue(5);
      prisma.job.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);
      prisma.candidate.count
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(3);
      prisma.candidate.aggregate.mockResolvedValue({
        _avg: { overallScore: 72.4 },
      });
      prisma.candidate.groupBy.mockResolvedValue([
        { status: 'NEW', _count: 5 },
        { status: 'SHORTLISTED', _count: 2 },
      ]);

      const result = await service.getStats(companyId, userId);

      expect(result.users.total).toBe(5);
      expect(result.jobs).toEqual({ total: 4, active: 2 });
      expect(result.candidates.total).toBe(20);
      expect(result.candidates.newToday).toBe(3);
      expect(result.candidates.averageScore).toBe(72);
      expect(result.candidates.byStatus.new).toBe(5);
      expect(result.candidates.byStatus.shortlisted).toBe(2);
    });
  });
});
