import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { QueryCandidatesDto } from '../../candidates/dto/query-candidates.dto';

/**
 * The same candidate filters as GET /candidates (the "segment"), minus
 * sorting/paging and the candidate-page date filters: in reports the period
 * below decides which dates count.
 */
export class ReportsQueryDto extends OmitType(QueryCandidatesDto, [
  'sortBy',
  'sortOrder',
  'page',
  'limit',
  'createdFrom',
  'createdTo',
  'hiredFrom',
  'hiredTo',
  'startFrom',
  'startTo',
  'updatedFrom',
  'updatedTo',
] as const) {
  @ApiPropertyOptional({ description: 'ISO date. Defaults to the company billing period start.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date. Defaults to the company billing period end.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export const BREAKDOWN_DIMENSIONS = [
  'status',
  'job',
  'country',
  'region',
  'city',
  'university',
  'educationLevel',
  'experience',
  'skills',
  'languages',
  'tags',
  'aiRecommendation',
  'score',
  'interviewRecommendation',
  'documentStatus',
  'gender',
] as const;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export class ReportsBreakdownQueryDto extends ReportsQueryDto {
  @ApiProperty({ enum: BREAKDOWN_DIMENSIONS })
  @IsIn(BREAKDOWN_DIMENSIONS)
  dimension!: BreakdownDimension;
}
