import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackRecommendation } from '@prisma/client';

export class SubmitFeedbackDto {
  @ApiProperty({ description: 'Pipeline stage the feedback is for' })
  @IsUUID()
  stageId: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Rating, 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ enum: FeedbackRecommendation })
  @IsEnum(FeedbackRecommendation)
  recommendation: FeedbackRecommendation;

  @ApiPropertyOptional({ description: 'Free-text interview notes' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
