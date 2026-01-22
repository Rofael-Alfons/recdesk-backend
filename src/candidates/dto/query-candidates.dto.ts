import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsUUID, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { CandidateSource, CandidateStatus } from '@prisma/client';

export class QueryCandidatesDto {
  @ApiPropertyOptional({ enum: CandidateStatus })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ enum: CandidateSource })
  @IsOptional()
  @IsEnum(CandidateSource)
  source?: CandidateSource;

  @ApiPropertyOptional({ description: 'Filter by job ID' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ description: 'Minimum score (0-100)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Maximum score (0-100)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  @Max(100)
  maxScore?: number;

  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ enum: ['score', 'createdAt', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'score' | 'createdAt' | 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
