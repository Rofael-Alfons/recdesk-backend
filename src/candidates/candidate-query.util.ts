import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryCandidatesDto } from './dto/query-candidates.dto';

export interface ParsedCandidateQuery {
  /** The query with pagination removed, in its original key order. */
  params: URLSearchParams;
  dto: QueryCandidatesDto;
}

/**
 * Parses a candidate-list URL query string and validates it exactly like the
 * list endpoint's global ValidationPipe would, so anything stored or sent as
 * a filter string can never mean something GET /candidates would reject.
 * Pagination is dropped: a filter string describes a set, not a page.
 */
export async function parseCandidateQuery(
  raw: string,
): Promise<ParsedCandidateQuery> {
  const params = new URLSearchParams(raw.trim().replace(/^\?/, ''));
  params.delete('page');
  params.delete('limit');

  const plain: Record<string, string> = {};
  params.forEach((value, key) => {
    plain[key] = value;
  });

  const dto = plainToInstance(QueryCandidatesDto, plain, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const fields = errors.map((e) => e.property).join(', ');
    throw new BadRequestException(`Invalid filter query: ${fields}`);
  }

  return { params, dto };
}
