import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  PipelineTemplatesService,
  STANDARD_STAGES,
  STANDARD_TEMPLATE_ID,
} from './pipeline-templates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PipelineTemplatesService', () => {
  let service: PipelineTemplatesService;
  let prisma: any;
  const companyId = 'comp-1';

  const engStages = [
    { name: 'Screening', category: 'SCREENING' as const, color: '#3B82F6' },
    { name: 'Tech Interview', category: 'INTERVIEW' as const, color: '#8B5CF6' },
    { name: 'Offer', category: 'OFFER' as const, color: '#10B981' },
  ];

  beforeEach(async () => {
    prisma = {
      pipelineTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args) => ({ op: 'create', id: `id-${args.data.name}`, ...args.data })),
        update: jest.fn((args) => ({ op: 'update', id: args.where.id, name: 'X', isDefault: false, stages: [], ...args.data })),
        updateMany: jest.fn((args) => ({ op: 'updateMany', ...args })),
        delete: jest.fn().mockResolvedValue({}),
      },
      job: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.resolve(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PipelineTemplatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PipelineTemplatesService);
  });

  describe('list', () => {
    it('returns the built-in Standard template when the company has none', async () => {
      const result = await service.list(companyId);
      expect(result).toEqual([
        expect.objectContaining({ id: STANDARD_TEMPLATE_ID, builtIn: true, isDefault: true, stages: STANDARD_STAGES }),
      ]);
    });

    it("returns the company's stored templates", async () => {
      prisma.pipelineTemplate.findMany.mockResolvedValue([
        { id: 't-1', name: 'Engineering', isDefault: true, stages: engStages },
      ]);
      const result = await service.list(companyId);
      expect(result).toEqual([
        { id: 't-1', name: 'Engineering', isDefault: true, stages: engStages, builtIn: false },
      ]);
      expect(prisma.pipelineTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId } }),
      );
    });
  });

  describe('resolveStages', () => {
    it('uses the requested template, scoped to the company', async () => {
      prisma.pipelineTemplate.findFirst.mockResolvedValue({ id: 't-1', name: 'Eng', isDefault: false, stages: engStages });
      await expect(service.resolveStages(companyId, 't-1')).resolves.toEqual(engStages);
      expect(prisma.pipelineTemplate.findFirst).toHaveBeenCalledWith({ where: { id: 't-1', companyId } });
    });

    it("404s for another company's template", async () => {
      await expect(service.resolveStages(companyId, 't-x')).rejects.toThrow(NotFoundException);
    });

    it('returns Standard for the built-in id without a lookup', async () => {
      await expect(service.resolveStages(companyId, STANDARD_TEMPLATE_ID)).resolves.toEqual(STANDARD_STAGES);
      expect(prisma.pipelineTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the company default, then Standard', async () => {
      await expect(service.resolveStages(companyId)).resolves.toEqual(STANDARD_STAGES);
      prisma.pipelineTemplate.findFirst.mockResolvedValue({ id: 't-1', name: 'Eng', isDefault: true, stages: engStages });
      await expect(service.resolveStages(companyId)).resolves.toEqual(engStages);
    });
  });

  describe('create', () => {
    it('stores Standard (as default) alongside the first custom template', async () => {
      const result = await service.create({ name: 'Engineering', stages: engStages }, companyId);

      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops.map((o: any) => [o.op, o.name, o.isDefault])).toEqual([
        ['create', 'Standard', true],
        ['create', 'Engineering', false],
      ]);
      expect(result.name).toBe('Engineering');
    });

    it('makes the new template the only default when asked', async () => {
      prisma.pipelineTemplate.count.mockResolvedValue(2);
      await service.create({ name: 'Operations', stages: engStages, isDefault: true }, companyId);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops[0]).toEqual(
        expect.objectContaining({ op: 'updateMany', where: { companyId, isDefault: true }, data: { isDefault: false } }),
      );
      expect(ops[1]).toEqual(expect.objectContaining({ name: 'Operations', isDefault: true }));
    });

    it('409s on a duplicate name (case-insensitive)', async () => {
      prisma.pipelineTemplate.findFirst.mockResolvedValue({ id: 't-1' });
      await expect(service.create({ name: 'engineering', stages: engStages }, companyId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects duplicate stage names', async () => {
      await expect(
        service.create({ name: 'Eng', stages: [engStages[0], { ...engStages[0], name: 'screening ' }] }, companyId),
      ).rejects.toThrow(/Duplicate stage name/);
    });
  });

  describe('update / setDefault / remove', () => {
    const row = { id: 't-1', name: 'Engineering', isDefault: false, stages: engStages, companyId };

    it('setDefault clears the previous default in the same transaction', async () => {
      prisma.pipelineTemplate.findFirst.mockResolvedValueOnce(row);
      await service.setDefault('t-1', companyId);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops[0].op).toBe('updateMany');
      expect(ops[1]).toEqual(expect.objectContaining({ op: 'update', isDefault: true }));
    });

    it("404s when updating another company's template", async () => {
      await expect(service.update('t-x', { name: 'X' }, companyId)).rejects.toThrow(NotFoundException);
    });

    it('deletes an owned template', async () => {
      prisma.pipelineTemplate.findFirst.mockResolvedValueOnce(row);
      await service.remove('t-1', companyId);
      expect(prisma.pipelineTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-1' } });
    });
  });

  describe('createFromJob', () => {
    it("copies the job's stages (with name-derived categories when missing)", async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        pipelineStages: [
          { name: 'Screening', category: null, color: '#3B82F6' },
          { name: 'Assessment', category: 'INTERVIEW', color: '#F59E0B' },
        ],
      });
      prisma.pipelineTemplate.count.mockResolvedValue(1);
      await service.createFromJob('job-1', 'Engineering', companyId);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops[ops.length - 1].stages).toEqual([
        { name: 'Screening', category: 'SCREENING', color: '#3B82F6' },
        { name: 'Assessment', category: 'INTERVIEW', color: '#F59E0B' },
      ]);
    });

    it('404s for a job outside the company', async () => {
      prisma.job.findFirst.mockResolvedValue(null);
      await expect(service.createFromJob('job-x', 'Eng', companyId)).rejects.toThrow(NotFoundException);
    });
  });
});
