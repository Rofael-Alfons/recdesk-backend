import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewRecommendation } from '@prisma/client';

export class EvaluationCriteriaDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  technicalSkill?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  problemSolving?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cultureFit?: number;
}

export class CreateInterviewEvaluationDto {
  @ApiProperty({ description: 'Candidate being evaluated' })
  @IsUUID()
  candidateId: string;

  @ApiProperty({ description: 'Job the candidate is being evaluated for' })
  @IsUUID()
  jobId: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Overall rating, 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating: number;

  @ApiPropertyOptional({ type: EvaluationCriteriaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationCriteriaDto)
  criteria?: EvaluationCriteriaDto;

  @ApiPropertyOptional({ description: 'Free-text interview notes' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({ enum: InterviewRecommendation })
  @IsEnum(InterviewRecommendation)
  recommendation: InterviewRecommendation;
}
