import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { CandidatesService } from './candidates.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import { CandidateSelectionService } from './selection/candidate-selection.service';
import { ScheduledEmailsService } from '../email-sending/scheduled-emails.service';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let prisma: any;
  let aiService: { scoreCandidate: jest.Mock };
  let storageService: { getSignedUrl: jest.Mock };
  let queueService: { addScoringJob: jest.Mock };
  let scheduledEmails: {
    schedule: jest.Mock;
    cancelPendingForCandidates: jest.Mock;
  };

  const companyId = 'comp-1';
  const UUID_B = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d';

  beforeEach(async () => {
    prisma = {
      candidate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      job: { findFirst: jest.fn() },
      emailTemplate: { findFirst: jest.fn() },
      company: {
        findUnique: jest.fn().mockResolvedValue({ collectGenderData: false }),
      },
      candidateNote: { create: jest.fn() },
      candidateAction: { createMany: jest.fn() },
      candidateScore: { upsert: jest.fn() },
      candidateScoreHistory: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    aiService = {
      scoreCandidate: jest.fn().mockResolvedValue({
        overallScore: 80,
        skillsMatchScore: 85,
        experienceScore: 75,
        educationScore: 70,
        growthScore: 65,
        bonusScore: 60,
        recommendation: 'Recommended',
        scoreExplanation: {
          skillsMatch: 'Good',
          experience: 'Solid',
          education: 'OK',
          growth: 'Steady',
          bonus: 'None',
        },
      }),
    };
    storageService = {
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
    };
    queueService = { addScoringJob: jest.fn().mockResolvedValue(null) };
    scheduledEmails = {
      schedule: jest.fn((rows: unknown[]) => Promise.resolve(rows.length)),
      cancelPendingForCandidates: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        CandidateSelectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
        { provide: StorageService, useValue: storageService },
        { provide: QueueService, useValue: queueService },
        { provide: ScheduledEmailsService, useValue: scheduledEmails },
      ],
    }).compile();

    service = module.get(CandidatesService);
  });

  describe('create', () => {
    it('rejects duplicate email', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          { fullName: 'Jane', email: 'jane@example.com' },
          companyId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates candidate with normalized email', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'MANUAL',
        status: 'NEW',
        cvFileUrl: '',
        tags: [],
        overallScore: null,
        aiSummary: null,
        cvFileName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
      });

      const result = await service.create(
        { fullName: 'Jane Doe', email: 'Jane@Example.com' },
        companyId,
      );

      expect(result.fullName).toBe('Jane Doe');
      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'jane@example.com' }),
        }),
      );
    });

    it('sets sourceChannel and sourceDetail when provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        source: 'MANUAL',
        sourceChannel: 'REFERRAL',
        sourceDetail: 'Referred by Omar',
        status: 'NEW',
        cvFileUrl: '',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
      });

      const result = await service.create(
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          sourceChannel: 'REFERRAL' as any,
          sourceDetail: 'Referred by Omar',
        },
        companyId,
      );

      expect(result.sourceChannel).toBe('REFERRAL');
      expect(result.sourceDetail).toBe('Referred by Omar');
      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceChannel: 'REFERRAL',
            sourceDetail: 'Referred by Omar',
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('persists startDate when provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        startDate: new Date('2026-08-01T00:00:00.000Z'),
      });

      await service.update(
        'c1',
        { status: 'HIRED' as any, startDate: '2026-08-01' },
        companyId,
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            status: 'HIRED',
            startDate: new Date('2026-08-01'),
          }),
        }),
      );
    });

    it('clears startDate when explicitly set to null', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        startDate: null,
      });

      await service.update('c1', { startDate: null as any }, companyId);

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startDate: null }),
        }),
      );
    });

    it('omits startDate from the update payload when not provided', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
      });

      await service.update('c1', { status: 'SCREENING' as any }, companyId);

      const call = prisma.candidate.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('startDate');
    });

    it('persists structured location fields', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        country: 'Egypt',
        region: 'Cairo',
        city: 'Nasr City',
      });

      const result = await service.update(
        'c1',
        { country: 'Egypt', region: 'Cairo', city: 'Nasr City' },
        companyId,
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            country: 'Egypt',
            region: 'Cairo',
            city: 'Nasr City',
          }),
        }),
      );
      expect(result.country).toBe('Egypt');
      expect(result.region).toBe('Cairo');
      expect(result.city).toBe('Nasr City');
    });

    it('clears a structured location field when explicitly set to null', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        region: null,
      });

      await service.update('c1', { region: null as any }, companyId);

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ region: null }),
        }),
      );
    });

    it('rejects gender when the company has not opted in', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });

      await expect(
        service.update('c1', { gender: 'FEMALE' as any }, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });

    it('persists and returns gender when the company has opted in', async () => {
      prisma.company.findUnique.mockResolvedValue({ collectGenderData: true });
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        gender: 'FEMALE',
      });

      const result = await service.update(
        'c1',
        { gender: 'FEMALE' as any },
        companyId,
      );

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gender: 'FEMALE' }),
        }),
      );
      expect(result.gender).toBe('FEMALE');
    });

    it('omits gender from the response when the company has not opted in', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        email: 'jane@example.com',
      });
      prisma.candidate.update.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane Doe',
        tags: [],
        gender: 'FEMALE',
      });

      const result = await service.update(
        'c1',
        { status: 'SCREENING' as any },
        companyId,
      );

      expect(result).not.toHaveProperty('gender');
    });

    it('sets hiredAt when a candidate transitions from NEW to HIRED', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        status: 'NEW',
        hiredAt: null,
      });
      prisma.candidate.update.mockResolvedValue({ id: 'c1', tags: [] });

      await service.update('c1', { status: 'HIRED' as any }, companyId);

      const call = prisma.candidate.update.mock.calls[0][0];
      expect(call.data.hiredAt).toBeInstanceOf(Date);
    });

    it('does not overwrite hiredAt on a later unrelated update of an already-hired candidate', async () => {
      const originalHiredAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        status: 'HIRED',
        hiredAt: originalHiredAt,
      });
      prisma.candidate.update.mockResolvedValue({ id: 'c1', tags: [] });

      await service.update('c1', { phone: '+201234567890' }, companyId);

      const call = prisma.candidate.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('hiredAt');
    });

    it('does not touch hiredAt when moving an already-hired candidate to another status', async () => {
      const originalHiredAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        status: 'HIRED',
        hiredAt: originalHiredAt,
      });
      prisma.candidate.update.mockResolvedValue({ id: 'c1', tags: [] });

      await service.update('c1', { status: 'REJECTED' as any }, companyId);

      const call = prisma.candidate.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('hiredAt');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when candidate missing', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('includes signed CV URL in detail view', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.cvFileSignedUrl).toBe('https://signed-url');
      expect(storageService.getSignedUrl).toHaveBeenCalled();
    });

    it('includes the referrer for referred candidates', async () => {
      const referredBy = { id: 'u1', firstName: 'Omar', lastName: 'Hassan' };
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        source: 'REFERRAL',
        sourceChannel: 'REFERRAL',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
        referredBy,
        referralCode: 'abc123',
      });

      const result = await service.findOne('c1', companyId);

      expect(prisma.candidate.findFirst.mock.calls[0][0].include.referredBy).toEqual({
        select: { id: true, firstName: true, lastName: true },
      });
      expect(result.referredBy).toEqual(referredBy);
      expect(result.referralCode).toBe('abc123');
    });

    it('generates photoSignedUrl in detail view when photoUrl is set', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: 's3://bucket/photo.jpg',
        photoFileName: 'photo.jpg',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBe('https://signed-url');
      expect(storageService.getSignedUrl).toHaveBeenCalledWith(
        's3://bucket/photo.jpg',
        24 * 60 * 60,
      );
    });

    it('omits photoSignedUrl when photoUrl is not set', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: null,
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBeNull();
    });

    it('falls back to the raw photoUrl when signing fails', async () => {
      storageService.getSignedUrl.mockImplementation((key: string) => {
        if (key === 's3://bucket/photo.jpg') throw new Error('boom');
        return Promise.resolve('https://signed-url');
      });
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        source: 'UPLOAD',
        status: 'NEW',
        cvFileUrl: 's3://bucket/cv.pdf',
        cvFileName: 'cv.pdf',
        photoUrl: 's3://bucket/photo.jpg',
        overallScore: 80,
        aiSummary: null,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        job: null,
        scores: [],
        notes: [],
        stageHistory: [],
      });

      const result = await service.findOne('c1', companyId);

      expect(result.photoSignedUrl).toBe('s3://bucket/photo.jpg');
    });
  });

  describe('findAll', () => {
    it('generates photoSignedUrl for list rows even though includeSignedUrl is false', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          id: 'c1',
          fullName: 'Jane',
          email: 'jane@example.com',
          source: 'UPLOAD',
          sourceChannel: null,
          status: 'NEW',
          cvFileUrl: 's3://bucket/cv.pdf',
          photoUrl: 's3://bucket/photo.jpg',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          job: null,
        },
      ]);
      prisma.candidate.count.mockResolvedValue(1);

      const result = await service.findAll(companyId, {});

      expect(result.data[0].photoSignedUrl).toBe('https://signed-url');
      expect(result.data[0].cvFileSignedUrl).toBeNull();
      expect(result.data[0].sourceChannel).toBeNull();
    });

    const whereConditions = () =>
      prisma.candidate.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];

    it('uses the same where for the page and the total count', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, { status: ['NEW'] } as any);

      expect(prisma.candidate.count).toHaveBeenCalledWith({
        where: prisma.candidate.findMany.mock.calls[0][0].where,
      });
      expect(whereConditions()[0]).toEqual({ companyId });
    });

    it('filters by sourceChannel when provided', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, { sourceChannel: ['BULK_UPLOAD'] } as any);

      expect(whereConditions()).toContainEqual({
        sourceChannel: { in: ['BULK_UPLOAD'] },
      });
    });

    it('filters by country and region when provided', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, {
        country: ['Egypt'],
        region: ['Cairo'],
      } as any);

      expect(whereConditions()).toEqual(
        expect.arrayContaining([
          { country: { in: ['Egypt'] } },
          { region: { in: ['Cairo'] } },
        ]),
      );
    });

    it('drops the gender filter when the company has not opted in', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, { gender: ['FEMALE'] } as any);

      expect(whereConditions().some((c) => 'gender' in c)).toBe(false);
    });

    it('applies the gender filter when the company has opted in', async () => {
      prisma.company.findUnique.mockResolvedValue({ collectGenderData: true });
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, { gender: ['FEMALE'] } as any);

      expect(whereConditions()).toContainEqual({ gender: { in: ['FEMALE'] } });
    });

    it('does not pass pagination or sort keys into the where clause', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll(companyId, {
        page: 2,
        limit: 10,
        sortBy: 'score',
        sortOrder: 'asc',
      } as any);

      const call = prisma.candidate.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ companyId }] });
      expect(call).toMatchObject({
        skip: 10,
        take: 10,
        orderBy: [{ overallScore: 'asc' }, { id: 'asc' }],
      });
    });
  });

  describe('getFilterOptions', () => {
    // Call order of the facet queries inside getFilterOptions.
    const FACETS = ['countries', 'regions', 'cities', 'universities', 'skills', 'languages', 'tags'];

    const option = (value: string, count = 1, label = value) => ({ value, label, count });

    beforeEach(() => {
      prisma.$queryRaw = jest.fn().mockResolvedValue([]);
    });

    it('returns value/label/count lists for every facet', async () => {
      FACETS.forEach((facet) =>
        prisma.$queryRaw.mockResolvedValueOnce([option(`${facet}-value`, 3)]),
      );

      const result = await service.getFilterOptions(companyId);

      for (const facet of FACETS) {
        expect(result[facet as keyof typeof result]).toEqual([option(`${facet}-value`, 3)]);
      }
      expect(result.genderEnabled).toBe(false);
    });

    it('keeps the most common original spelling as the skill label', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([option('node.js', 4, 'Node.js')]);

      const result = await service.getFilterOptions(companyId);

      expect(result.skills).toEqual([{ value: 'node.js', label: 'Node.js', count: 4 }]);
    });

    it('scopes every query to the company as a bound parameter, never inline SQL', async () => {
      await service.getFilterOptions(companyId);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(FACETS.length);
      for (const [strings, ...values] of prisma.$queryRaw.mock.calls) {
        expect(values).toContain(companyId);
        expect((strings as string[]).join('')).not.toContain(companyId);
        expect((strings as string[]).join('')).toContain('"companyId" =');
      }
    });

    it('reports genderEnabled from the company setting', async () => {
      prisma.company.findUnique.mockResolvedValue({ collectGenderData: true });

      const result = await service.getFilterOptions(companyId);

      expect(result.genderEnabled).toBe(true);
    });
  });

  describe('bulkUpdateStatus', () => {
    beforeEach(() => {
      prisma.candidate.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id?.in?.length ?? 1),
      );
    });

    it('rejects when some candidates are missing', async () => {
      prisma.candidate.count.mockResolvedValue(1);

      await expect(
        service.bulkUpdateStatus(
          { candidateIds: ['c1', 'c2'], status: 'SHORTLISTED' },
          companyId,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.updateMany).not.toHaveBeenCalled();
    });

    it('clears the rejection reason and cancels pending rejection emails when leaving REJECTED', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', status: 'REJECTED', hiredAt: null },
        { id: 'c2', status: 'NEW', hiredAt: null },
      ]);

      await service.bulkUpdateStatus(
        { candidateIds: ['c1', 'c2'], status: 'SHORTLISTED' },
        companyId,
        'user-1',
      );

      const call = prisma.candidate.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({
        status: 'SHORTLISTED',
        rejectionReason: null,
        rejectionNote: null,
      });
      expect(scheduledEmails.cancelPendingForCandidates).toHaveBeenCalledWith(
        companyId,
        ['c1'],
        'rejection',
        'user-1',
      );
    });

    it('keeps an existing rejection reason when re-saved as REJECTED', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', status: 'REJECTED', hiredAt: null },
      ]);

      await service.bulkUpdateStatus(
        { candidateIds: ['c1'], status: 'REJECTED' },
        companyId,
        'user-1',
      );

      expect(prisma.candidate.updateMany.mock.calls[0][0].data).toEqual({
        status: 'REJECTED',
      });
      expect(scheduledEmails.cancelPendingForCandidates).toHaveBeenCalledWith(
        companyId,
        [],
        'rejection',
        'user-1',
      );
    });

    it('applies to every candidate matching a filter selection, minus exclusions', async () => {
      prisma.candidate.findMany
        .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c3' }])
        .mockResolvedValueOnce([
          { id: 'c1', status: 'NEW', hiredAt: null },
          { id: 'c3', status: 'NEW', hiredAt: null },
        ]);

      const result = await service.bulkUpdateStatus(
        { filter: 'status=NEW', excludeIds: [UUID_B], status: 'SCREENING' },
        companyId,
        'user-1',
      );

      expect(result.updatedCount).toBe(2);
      const resolveCall = prisma.candidate.findMany.mock.calls[0][0];
      expect(resolveCall.select).toEqual({ id: true });
      expect(resolveCall.where.AND[1]).toEqual({ id: { notIn: [UUID_B] } });
      expect(prisma.candidate.updateMany.mock.calls[0][0].where.id.in).toEqual([
        'c1',
        'c3',
      ]);
    });

    it('updates status and records actions', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      const result = await service.bulkUpdateStatus(
        { candidateIds: ['c1', 'c2'], status: 'SHORTLISTED' },
        companyId,
        'user-1',
      );

      expect(result.updatedCount).toBe(2);
      expect(prisma.candidate.updateMany).toHaveBeenCalled();
      expect(prisma.candidateAction.createMany).toHaveBeenCalled();
    });

    it('sets hiredAt only for candidates newly transitioning to HIRED, in a separate updateMany call', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', status: 'NEW', hiredAt: null },
        { id: 'c2', status: 'HIRED', hiredAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      await service.bulkUpdateStatus(
        { candidateIds: ['c1', 'c2'], status: 'HIRED' },
        companyId,
        'user-1',
      );

      const updateManyCalls = prisma.candidate.updateMany.mock.calls;
      expect(updateManyCalls).toHaveLength(2);

      const newlyHiredCall = updateManyCalls.find((call: any[]) =>
        call[0].where.id.in.includes('c1'),
      );
      expect(newlyHiredCall[0].data.hiredAt).toBeInstanceOf(Date);

      const alreadyHiredCall = updateManyCalls.find((call: any[]) =>
        call[0].where.id.in.includes('c2'),
      );
      expect(alreadyHiredCall[0].data).not.toHaveProperty('hiredAt');
    });

    it('never sets hiredAt when the target status is not HIRED', async () => {
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', status: 'NEW', hiredAt: null },
        { id: 'c2', status: 'SCREENING', hiredAt: null },
      ]);

      await service.bulkUpdateStatus(
        { candidateIds: ['c1', 'c2'], status: 'REJECTED' },
        companyId,
        'user-1',
      );

      expect(prisma.candidate.updateMany).toHaveBeenCalledTimes(1);
      const call = prisma.candidate.updateMany.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('hiredAt');
      expect(call.where.id.in).toEqual(['c1', 'c2']);
    });
  });

  describe('bulkDelete', () => {
    it('rejects when some candidates are missing', async () => {
      prisma.candidate.count.mockResolvedValue(1);

      await expect(
        service.bulkDelete({ candidateIds: ['c1', 'c2'] }, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes all matching candidates', async () => {
      prisma.candidate.count.mockResolvedValue(2);
      prisma.candidate.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkDelete(
        { candidateIds: ['c1', 'c2'] },
        companyId,
      );

      expect(result.deletedCount).toBe(2);
      expect(prisma.candidate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1', 'c2'] }, companyId },
      });
    });
  });

  describe('bulkReject', () => {
    beforeEach(() => {
      prisma.candidate.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id?.in?.length ?? 1),
      );
    });

    it('sets status, reason and note, and logs the reason', async () => {
      const result = await service.bulkReject(
        {
          candidateIds: ['c1', 'c2'],
          reason: 'SKILLS_MISMATCH',
          note: '  Missing React  ',
        },
        companyId,
        'user-1',
      );

      expect(prisma.candidate.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1', 'c2'] }, companyId },
        data: {
          status: 'REJECTED',
          rejectionReason: 'SKILLS_MISMATCH',
          rejectionNote: 'Missing React',
        },
      });
      const actions = prisma.candidateAction.createMany.mock.calls[0][0].data;
      expect(actions[0]).toEqual({
        candidateId: 'c1',
        userId: 'user-1',
        action: 'status_changed',
        details: {
          newStatus: 'REJECTED',
          reason: 'SKILLS_MISMATCH',
          note: 'Missing React',
        },
      });
      expect(scheduledEmails.schedule).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        updatedCount: 2,
        emailsScheduled: 0,
        sendAt: null,
      });
    });

    it('schedules delayed rejection emails only for candidates with an address', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
      prisma.candidate.findMany.mockResolvedValue([{ id: 'c1' }]);
      const before = Date.now();

      const result = await service.bulkReject(
        {
          candidateIds: ['c1', 'c2'],
          reason: 'POSITION_FILLED',
          email: { templateId: 'tpl-1', delayHours: 24 },
        },
        companyId,
        'user-1',
      );

      expect(prisma.emailTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tpl-1', companyId },
        select: { id: true },
      });
      // A still-pending email from an earlier rejection is replaced.
      expect(scheduledEmails.cancelPendingForCandidates).toHaveBeenCalledWith(
        companyId,
        ['c1', 'c2'],
        'rejection',
        'user-1',
      );
      const rows = scheduledEmails.schedule.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        companyId,
        candidateId: 'c1',
        templateId: 'tpl-1',
        purpose: 'rejection',
        createdById: 'user-1',
      });
      const delay = rows[0].sendAt.getTime() - before;
      expect(delay).toBeGreaterThanOrEqual(24 * 3_600_000);
      expect(delay).toBeLessThan(24 * 3_600_000 + 5_000);
      expect(result).toMatchObject({ emailsScheduled: 1, skippedNoEmail: 1 });
    });

    it('rejects an email template from another company before changing anything', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkReject(
          {
            candidateIds: ['c1'],
            reason: 'OTHER',
            email: { templateId: 'tpl-x', delayHours: 0 },
          },
          companyId,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.candidate.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkRemoveTags', () => {
    it('removes only the given tags from candidates that have them', async () => {
      prisma.candidate.count.mockResolvedValue(2);
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1', tags: ['urgent', 'top', 'remote'] },
      ]);

      const result = await service.bulkRemoveTags(
        { candidateIds: ['c1', 'c2'], tags: ['urgent', 'remote'] },
        companyId,
        'user-1',
      );

      expect(prisma.candidate.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['c1', 'c2'] },
        companyId,
        tags: { hasSome: ['urgent', 'remote'] },
      });
      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { tags: ['top'] },
      });
      expect(prisma.candidateAction.createMany.mock.calls[0][0].data).toEqual([
        {
          candidateId: 'c1',
          userId: 'user-1',
          action: 'tags_removed',
          details: { tags: ['urgent', 'remote'] },
        },
      ]);
      expect(result.updatedCount).toBe(1);
    });
  });

  describe('bulkExport', () => {
    it('returns rows in the selection order', async () => {
      prisma.candidate.count.mockResolvedValue(3);
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c2', fullName: 'B' },
        { id: 'c3', fullName: 'C' },
        { id: 'c1', fullName: 'A' },
      ]);

      const result = await service.bulkExport(
        { candidateIds: ['c1', 'c2', 'c3'] },
        companyId,
      );

      expect(result.data.map((row: any) => row.id)).toEqual(['c1', 'c2', 'c3']);
      expect(result.total).toBe(3);
      const select = prisma.candidate.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('cvText');
      expect(select).not.toHaveProperty('experience');
    });
  });

  describe('getNeighbors', () => {
    beforeEach(() => {
      prisma.candidate.count.mockResolvedValue(1);
      prisma.candidate.findMany.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
      ]);
    });

    it('returns position and both neighbors in list order', async () => {
      const result = await service.getNeighbors('c2', companyId, {
        status: ['NEW'],
        sortBy: 'score',
        sortOrder: 'asc',
      } as any);

      expect(result).toEqual({
        position: 2,
        total: 3,
        truncated: false,
        prevId: 'c1',
        nextId: 'c3',
      });
      expect(prisma.candidate.findMany.mock.calls[0][0].orderBy).toEqual([
        { overallScore: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('has no previous at the start and no next at the end', async () => {
      const first = await service.getNeighbors('c1', companyId, {} as any);
      const last = await service.getNeighbors('c3', companyId, {} as any);

      expect(first).toMatchObject({ position: 1, prevId: null, nextId: 'c2' });
      expect(last).toMatchObject({ position: 3, prevId: 'c2', nextId: null });
    });

    it('returns a null position for a candidate outside the list', async () => {
      const result = await service.getNeighbors('c9', companyId, {} as any);
      expect(result).toMatchObject({ position: null, prevId: null, nextId: null });
    });

    it('404s for a candidate of another company', async () => {
      prisma.candidate.count.mockResolvedValue(0);
      await expect(
        service.getNeighbors('c1', companyId, {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update leaving REJECTED', () => {
    it('clears the reason and cancels pending rejection emails', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        status: 'REJECTED',
        email: null,
        jobId: null,
        hiredAt: null,
      });
      prisma.candidate.update.mockResolvedValue({ id: 'c1', status: 'NEW' });

      await service.update('c1', { status: 'NEW' } as any, companyId);

      expect(prisma.candidate.update.mock.calls[0][0].data).toMatchObject({
        status: 'NEW',
        rejectionReason: null,
        rejectionNote: null,
      });
      expect(scheduledEmails.cancelPendingForCandidates).toHaveBeenCalledWith(
        companyId,
        ['c1'],
        'rejection',
        null,
      );
    });

    it('leaves rejection fields alone for unrelated edits', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        status: 'REJECTED',
        email: null,
        jobId: null,
        hiredAt: null,
      });
      prisma.candidate.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });

      await service.update('c1', { phone: '123' } as any, companyId);

      expect(prisma.candidate.update.mock.calls[0][0].data).not.toHaveProperty(
        'rejectionReason',
      );
      expect(scheduledEmails.cancelPendingForCandidates).not.toHaveBeenCalled();
    });
  });

  describe('rescoreForJob', () => {
    it('queues scoring job when queue is available', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        jobId: 'job-1',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
      });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
        status: 'ACTIVE',
        description: null,
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: 'MID',
        requirements: {},
      });

      const result = await service.rescoreForJob(
        'c1',
        { jobId: 'job-1' },
        companyId,
      );

      expect(result.message).toContain('queued');
      expect(queueService.addScoringJob).toHaveBeenCalledWith({
        candidateId: 'c1',
        jobId: 'job-1',
      });
    });

    it('rejects scoring against closed job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        status: 'CLOSED',
      });

      await expect(
        service.rescoreForJob('c1', { jobId: 'job-1' }, companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records a score history row on synchronous scoring (no queue available)', async () => {
      (service as any).queueService = undefined;

      prisma.candidate.findFirst.mockResolvedValue({
        id: 'c1',
        companyId,
        jobId: 'other-job',
        fullName: 'Jane',
        email: 'jane@example.com',
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        education: [],
        experience: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
      });
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Engineer',
        status: 'ACTIVE',
        description: null,
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: 'MID',
        requirements: {},
      });

      await service.rescoreForJob('c1', { jobId: 'job-1' }, companyId);

      expect(prisma.candidateScore.upsert).toHaveBeenCalled();
      expect(prisma.candidateScoreHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 'c1',
          jobId: 'job-1',
          overallScore: 80,
          source: 'manual_rescore_sync',
        }),
      });
    });
  });

  describe('getScoreHistory', () => {
    it('throws NotFoundException when candidate is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(
        service.getScoreHistory('c1', 'job-1', companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.candidateScoreHistory.findMany).not.toHaveBeenCalled();
    });

    it('returns rescore history for the candidate+job, newest first', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: 'c1', companyId });
      const history = [{ id: 'hist-2' }, { id: 'hist-1' }];
      prisma.candidateScoreHistory.findMany.mockResolvedValue(history);

      const result = await service.getScoreHistory('c1', 'job-1', companyId);

      expect(prisma.candidateScoreHistory.findMany).toHaveBeenCalledWith({
        where: { candidateId: 'c1', jobId: 'job-1' },
        orderBy: { scoredAt: 'desc' },
      });
      expect(result).toEqual(history);
    });
  });

  describe('getCvSignedUrl', () => {
    it('throws when candidate has no CV', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        cvFileUrl: null,
      });

      await expect(
        service.getCvSignedUrl('c1', companyId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
  describe('pipeline stages', () => {
    const custom = [
      { id: 'scr', name: 'Screening', orderIndex: 0, category: 'SCREENING', jobId: 'job-1', color: '#3B82F6' },
      { id: 'tech', name: 'Tech Interview', orderIndex: 1, category: 'INTERVIEW', jobId: 'job-1', color: '#8B5CF6' },
      { id: 'assess', name: 'Assessment', orderIndex: 2, category: 'INTERVIEW', jobId: 'job-1', color: '#F59E0B' },
      { id: 'offer', name: 'Offer', orderIndex: 3, category: 'OFFER', jobId: 'job-1', color: '#10B981' },
      { id: 'hired', name: 'Hired', orderIndex: 4, category: 'HIRED', jobId: 'job-1', color: '#059669' },
    ];

    beforeEach(() => {
      prisma.pipelineStage = {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue(custom),
      };
      prisma.candidateStage = {
        create: jest.fn((args) => ({ op: 'history', ...args })),
        createMany: jest.fn((args) => ({ op: 'historyMany', ...args })),
      };
      prisma.candidateAction.create = jest.fn((args) => ({ op: 'action', ...args }));
      prisma.candidate.update.mockImplementation((args: any) => ({ op: 'update', ...args }));
      prisma.candidate.updateMany.mockImplementation((args: any) => ({ op: 'updateMany', ...args }));
      prisma.candidate.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id?.in?.length ?? 1),
      );
    });

    describe('moveToStage', () => {
      const candidate = {
        id: 'c1',
        jobId: 'job-1',
        status: 'SCREENING',
        hiredAt: null,
        currentStageId: 'scr',
      };

      it('moves the candidate, derives status, and records history + action', async () => {
        prisma.candidate.findFirst.mockResolvedValue(candidate);
        prisma.pipelineStage.findFirst.mockResolvedValue(custom[2]);

        const result = await service.moveToStage('c1', 'assess', companyId, 'user-1');

        expect(prisma.candidate.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'c1', companyId } }),
        );
        expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith({
          where: { id: 'assess', jobId: 'job-1' },
        });
        expect(prisma.candidate.update).toHaveBeenCalledWith({
          where: { id: 'c1' },
          data: { currentStageId: 'assess', status: 'INTERVIEWING' },
        });
        expect(prisma.candidateStage.create).toHaveBeenCalledWith({
          data: { candidateId: 'c1', stageId: 'assess' },
        });
        expect(prisma.candidateAction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'moved_to_stage',
            details: expect.objectContaining({ fromStageId: 'scr', toStageId: 'assess', newStatus: 'INTERVIEWING' }),
          }),
        });
        expect(result.status).toBe('INTERVIEWING');
        expect(result.currentStage.name).toBe('Assessment');
      });

      it('sets hiredAt when moved into a HIRED stage', async () => {
        prisma.candidate.findFirst.mockResolvedValue({ ...candidate, status: 'OFFERED' });
        prisma.pipelineStage.findFirst.mockResolvedValue(custom[4]);
        await service.moveToStage('c1', 'hired', companyId, 'user-1');
        expect(prisma.candidate.update.mock.calls[0][0].data).toEqual(
          expect.objectContaining({ status: 'HIRED', hiredAt: expect.any(Date) }),
        );
      });

      it('reopens a rejected candidate and cancels the pending rejection email', async () => {
        prisma.candidate.findFirst.mockResolvedValue({ ...candidate, status: 'REJECTED' });
        prisma.pipelineStage.findFirst.mockResolvedValue(custom[1]);
        await service.moveToStage('c1', 'tech', companyId, 'user-1');
        expect(prisma.candidate.update.mock.calls[0][0].data).toEqual({
          currentStageId: 'tech',
          status: 'INTERVIEWING',
          rejectionReason: null,
          rejectionNote: null,
        });
        expect(scheduledEmails.cancelPendingForCandidates).toHaveBeenCalled();
      });

      it('404s for a candidate outside the company', async () => {
        prisma.candidate.findFirst.mockResolvedValue(null);
        await expect(service.moveToStage('c1', 'tech', companyId, 'u')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('400s when the candidate has no job', async () => {
        prisma.candidate.findFirst.mockResolvedValue({ ...candidate, jobId: null });
        await expect(service.moveToStage('c1', 'tech', companyId, 'u')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it("404s for a stage of another job", async () => {
        prisma.candidate.findFirst.mockResolvedValue(candidate);
        prisma.pipelineStage.findFirst.mockResolvedValue(null);
        await expect(service.moveToStage('c1', 'x', companyId, 'u')).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('bulkUpdateStatus stage sync', () => {
      it('moves candidates to the first stage of the new status category, and leaves same-category ones', async () => {
        prisma.candidate.findMany.mockResolvedValue([
          { id: 'c1', status: 'SCREENING', hiredAt: null, jobId: 'job-1', currentStageId: 'scr' },
          { id: 'c2', status: 'INTERVIEWING', hiredAt: null, jobId: 'job-1', currentStageId: 'assess' },
          { id: 'c3', status: 'NEW', hiredAt: null, jobId: null, currentStageId: null },
        ]);

        await service.bulkUpdateStatus(
          { candidateIds: ['c1', 'c2', 'c3'], status: 'INTERVIEWING' },
          companyId,
          'user-1',
        );

        const ops = prisma.$transaction.mock.calls[0][0];
        const stageUpdate = ops.find((o: any) => o?.op === 'updateMany' && o.data.currentStageId);
        expect(stageUpdate).toEqual(
          expect.objectContaining({ where: { id: { in: ['c1'] } }, data: { currentStageId: 'tech' } }),
        );
        expect(prisma.candidateStage.createMany).toHaveBeenCalledWith({
          data: [{ candidateId: 'c1', stageId: 'tech' }],
        });
      });

      it('keeps the stage when rejecting/withdrawing', async () => {
        prisma.candidate.findMany.mockResolvedValue([
          { id: 'c1', status: 'INTERVIEWING', hiredAt: null, jobId: 'job-1', currentStageId: 'assess' },
        ]);
        await service.bulkUpdateStatus({ candidateIds: ['c1'], status: 'WITHDRAWN' }, companyId, 'u');
        expect(prisma.pipelineStage.findMany).not.toHaveBeenCalled();
        expect(prisma.candidateStage.createMany).not.toHaveBeenCalled();
      });
    });

    describe('bulkAssignJob stage reset', () => {
      it("places moved candidates in the new job's stage for their status", async () => {
        prisma.job.findFirst.mockResolvedValue({ id: 'job-1', title: 'Fullstack' });
        prisma.candidate.findMany.mockResolvedValue([
          { id: 'c1', status: 'OFFERED', jobId: 'job-0', currentStageId: 'old' },
          { id: 'c2', status: 'NEW', jobId: 'job-1', currentStageId: 'scr' }, // already on job
        ]);

        await service.bulkAssignJob({ candidateIds: ['c1', 'c2'], jobId: 'job-1' }, companyId, 'u');

        expect(prisma.pipelineStage.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { jobId: { in: ['job-1'] } } }),
        );
        const ops = prisma.$transaction.mock.calls[0][0];
        const stageUpdate = ops.find((o: any) => o?.op === 'updateMany' && o.data.currentStageId);
        expect(stageUpdate).toEqual(
          expect.objectContaining({ where: { id: { in: ['c1'] } }, data: { currentStageId: 'offer' } }),
        );
      });
    });
  });
});
