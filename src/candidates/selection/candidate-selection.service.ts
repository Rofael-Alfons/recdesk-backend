import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCandidateQuery } from '../candidate-query.util';
import {
  buildCandidateOrderBy,
  buildCandidateWhere,
  splitCandidateQuery,
} from '../candidate-where.builder';
import { QueryCandidatesDto } from '../dto/query-candidates.dto';
import { CandidateSelectionDto, MAX_BULK } from './candidate-selection.dto';

@Injectable()
export class CandidateSelectionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves a bulk selection to company-scoped candidate IDs. Filter
   * selections come back in the filter's list order, so exports keep the
   * order the user was looking at.
   */
  async resolveIds(
    companyId: string,
    selection: CandidateSelectionDto,
  ): Promise<string[]> {
    const hasIds = selection.candidateIds !== undefined;
    if (hasIds === (selection.filter !== undefined)) {
      throw new BadRequestException(
        'Provide exactly one of candidateIds or filter',
      );
    }
    const excluded = new Set(selection.excludeIds ?? []);

    if (hasIds) {
      const ids = [...new Set(selection.candidateIds)].filter(
        (id) => !excluded.has(id),
      );
      if (!ids.length) throw new BadRequestException('No candidates selected');
      const found = await this.prisma.candidate.count({
        where: { id: { in: ids }, companyId },
      });
      if (found !== ids.length) {
        throw new BadRequestException('Some candidates were not found');
      }
      return ids;
    }

    const { dto } = await parseCandidateQuery(selection.filter!);
    const ids = await this.orderedIds(companyId, dto, MAX_BULK + 1, [
      ...excluded,
    ]);
    if (ids.length > MAX_BULK) {
      throw new BadRequestException(
        `This selection matches more than ${MAX_BULK} candidates; narrow the filters first`,
      );
    }
    if (!ids.length) {
      throw new BadRequestException('No candidates match this selection');
    }
    return ids;
  }

  /** IDs matching a list query, in list order, capped at `take`. */
  async orderedIds(
    companyId: string,
    query: QueryCandidatesDto,
    take: number,
    excludeIds: string[] = [],
  ): Promise<string[]> {
    const { filters, sortBy, sortOrder } = splitCandidateQuery(query);
    const genderEnabled = await this.isGenderEnabled(companyId);
    const where: Prisma.CandidateWhereInput = {
      AND: [
        buildCandidateWhere(companyId, filters, genderEnabled),
        ...(excludeIds.length ? [{ id: { notIn: excludeIds } }] : []),
      ],
    };
    const rows = await this.prisma.candidate.findMany({
      where,
      select: { id: true },
      orderBy: buildCandidateOrderBy(sortBy, sortOrder),
      take,
    });
    return rows.map((row) => row.id);
  }

  /** How many candidates match a list query plus an extra condition. */
  async countMatching(
    companyId: string,
    query: QueryCandidatesDto,
    extra: Prisma.CandidateWhereInput,
  ): Promise<number> {
    const { filters } = splitCandidateQuery(query);
    const genderEnabled = await this.isGenderEnabled(companyId);
    return this.prisma.candidate.count({
      where: {
        AND: [buildCandidateWhere(companyId, filters, genderEnabled), extra],
      },
    });
  }

  private async isGenderEnabled(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { collectGenderData: true },
    });
    return company?.collectGenderData ?? false;
  }
}
