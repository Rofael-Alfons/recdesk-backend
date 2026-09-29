import { BadRequestException } from '@nestjs/common';
import { parseCandidateQuery } from './candidate-query.util';
import {
  buildCandidateOrderBy,
  splitCandidateQuery,
} from './candidate-where.builder';

describe('parseCandidateQuery', () => {
  it('drops pagination, keeps key order and parses list values', async () => {
    const { params, dto } = await parseCandidateQuery(
      '?status=NEW,SCREENING&page=4&limit=20&minScore=70&sortBy=score',
    );
    expect(params.toString()).toBe('status=NEW%2CSCREENING&minScore=70&sortBy=score');
    expect(dto.status).toEqual(['NEW', 'SCREENING']);
    expect(dto.minScore).toBe(70);
  });

  it('rejects unknown keys and invalid values with the offending field names', async () => {
    await expect(parseCandidateQuery('foo=1')).rejects.toThrow(
      new BadRequestException('Invalid filter query: foo'),
    );
    await expect(parseCandidateQuery('minScore=500')).rejects.toThrow(
      /minScore/,
    );
  });
});

describe('buildCandidateOrderBy', () => {
  it('maps the sort key and always adds an id tiebreaker', () => {
    expect(buildCandidateOrderBy('score', 'asc')).toEqual([
      { overallScore: 'asc' },
      { id: 'asc' },
    ]);
    expect(buildCandidateOrderBy('name', 'desc')).toEqual([
      { fullName: 'desc' },
      { id: 'desc' },
    ]);
    expect(buildCandidateOrderBy()).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('falls back to desc for an unexpected sort order', () => {
    expect(buildCandidateOrderBy('createdAt', 'sideways' as any)).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('splitCandidateQuery', () => {
  it('separates filters from sort and paging', () => {
    const { filters, sortBy, sortOrder } = splitCandidateQuery({
      status: ['NEW'],
      sortBy: 'name',
      sortOrder: 'asc',
      page: 2,
      limit: 10,
    } as any);
    expect(filters).toEqual({ status: ['NEW'] });
    expect(sortBy).toBe('name');
    expect(sortOrder).toBe('asc');
  });
});
