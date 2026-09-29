import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CandidateSelectionService } from './candidate-selection.service';
import { CandidateSelectionDto, MAX_BULK } from './candidate-selection.dto';
import {
  BulkAddTagsDto,
  BulkRejectDto,
  BulkRemoveTagsDto,
} from '../dto/bulk-action.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('CandidateSelectionService', () => {
  let prisma: any;
  let service: CandidateSelectionService;
  const companyId = 'comp-1';

  beforeEach(() => {
    prisma = {
      candidate: { count: jest.fn(), findMany: jest.fn() },
      company: {
        findUnique: jest.fn().mockResolvedValue({ collectGenderData: false }),
      },
    };
    service = new CandidateSelectionService(prisma);
  });

  describe('ids mode', () => {
    it('dedupes, drops exclusions and checks every id belongs to the company', async () => {
      prisma.candidate.count.mockResolvedValue(1);

      const ids = await service.resolveIds(companyId, {
        candidateIds: [A, A, B],
        excludeIds: [B],
      });

      expect(ids).toEqual([A]);
      expect(prisma.candidate.count).toHaveBeenCalledWith({
        where: { id: { in: [A] }, companyId },
      });
    });

    it('400s when an id is from another company or missing', async () => {
      prisma.candidate.count.mockResolvedValue(1);
      await expect(
        service.resolveIds(companyId, { candidateIds: [A, B] }),
      ).rejects.toThrow('Some candidates were not found');
    });

    it('400s when exclusions remove everything', async () => {
      await expect(
        service.resolveIds(companyId, { candidateIds: [A], excludeIds: [A] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('filter mode', () => {
    it('builds the company-scoped where, applies exclusions and the list order', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: A }]);

      const ids = await service.resolveIds(companyId, {
        filter: '?status=NEW,SCREENING&minScore=70&sortBy=name&sortOrder=asc&page=3',
        excludeIds: [B],
      });

      expect(ids).toEqual([A]);
      const call = prisma.candidate.findMany.mock.calls[0][0];
      const [where, exclusion] = call.where.AND;
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { companyId },
          { status: { in: ['NEW', 'SCREENING'] } },
        ]),
      );
      expect(exclusion).toEqual({ id: { notIn: [B] } });
      expect(call.orderBy).toEqual([{ fullName: 'asc' }, { id: 'asc' }]);
      expect(call.take).toBe(MAX_BULK + 1);
      expect(call.select).toEqual({ id: true });
    });

    it('400s above MAX_BULK instead of silently truncating', async () => {
      prisma.candidate.findMany.mockResolvedValue(
        Array.from({ length: MAX_BULK + 1 }, (_, i) => ({ id: `c${i}` })),
      );
      await expect(
        service.resolveIds(companyId, { filter: 'status=NEW' }),
      ).rejects.toThrow(/more than 5000/);
    });

    it('400s when nothing matches', async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      await expect(
        service.resolveIds(companyId, { filter: 'status=NEW' }),
      ).rejects.toThrow('No candidates match this selection');
    });

    it('400s on a filter the list endpoint would reject', async () => {
      await expect(
        service.resolveIds(companyId, { filter: 'status=NOPE' }),
      ).rejects.toThrow(/Invalid filter query: status/);
      await expect(
        service.resolveIds(companyId, { filter: 'hacker=1' }),
      ).rejects.toThrow(/Invalid filter query: hacker/);
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();
    });

    it('never lets a gender filter through for a company that has not opted in', async () => {
      prisma.candidate.findMany.mockResolvedValue([{ id: A }]);
      await service.resolveIds(companyId, { filter: 'gender=MALE' });
      const where = prisma.candidate.findMany.mock.calls[0][0].where.AND[0];
      expect(JSON.stringify(where)).not.toContain('gender');
    });
  });

  it('400s when both or neither of candidateIds and filter are given', async () => {
    await expect(
      service.resolveIds(companyId, { candidateIds: [A], filter: 'status=NEW' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveIds(companyId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CandidateSelectionDto validation', () => {
  const errorsFor = async (plain: object, cls: any = CandidateSelectionDto) =>
    (await validate(plainToInstance(cls, plain))).map((e) => e.property);

  it('accepts ids or a filter', async () => {
    expect(await errorsFor({ candidateIds: [A] })).toEqual([]);
    expect(await errorsFor({ filter: 'status=NEW', excludeIds: [B] })).toEqual([]);
  });

  it('rejects both, neither, empty ids and non-UUIDs', async () => {
    expect(await errorsFor({ candidateIds: [A], filter: 'x=1' })).toEqual(
      expect.arrayContaining(['candidateIds', 'filter']),
    );
    expect(await errorsFor({})).toEqual(expect.arrayContaining(['candidateIds']));
    expect(await errorsFor({ candidateIds: [] })).toEqual(['candidateIds']);
    expect(await errorsFor({ candidateIds: ['nope'] })).toEqual(['candidateIds']);
    expect(await errorsFor({ filter: 'x=1', excludeIds: ['nope'] })).toEqual([
      'excludeIds',
    ]);
  });

  it('caps explicit ids at MAX_BULK', async () => {
    const ids = Array.from({ length: MAX_BULK + 1 }, () => A);
    expect(await errorsFor({ candidateIds: ids })).toEqual(['candidateIds']);
  });

  it('validates the rejection payload, including the nested email options', async () => {
    expect(
      await errorsFor(
        { candidateIds: [A], reason: 'NOT_QUALIFIED', email: { templateId: B, delayHours: 24 } },
        BulkRejectDto,
      ),
    ).toEqual([]);
    expect(
      await errorsFor({ candidateIds: [A], reason: 'BORED' }, BulkRejectDto),
    ).toEqual(['reason']);
    expect(
      await errorsFor(
        { candidateIds: [A], reason: 'OTHER', email: { templateId: B, delayHours: 5 } },
        BulkRejectDto,
      ),
    ).toEqual(['email']);
  });

  it('accepts an empty filter (the unfiltered list) and caps tag payloads', async () => {
    expect(await errorsFor({ filter: '' })).toEqual([]);
    expect(await errorsFor({ filter: '', tags: ['vip'] }, BulkAddTagsDto)).toEqual([]);
    expect(
      await errorsFor({ candidateIds: [A], tags: ['x'.repeat(101)] }, BulkAddTagsDto),
    ).toEqual(['tags']);
    expect(
      await errorsFor(
        { candidateIds: [A], tags: Array.from({ length: 51 }, (_, i) => `t${i}`) },
        BulkRemoveTagsDto,
      ),
    ).toEqual(['tags']);
  });
});
