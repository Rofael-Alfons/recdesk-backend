import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StageCategory } from '@prisma/client';

/** One pipeline stage, as sent by the stage editor (jobs and templates). */
export class PipelineStageInputDto {
  @ApiPropertyOptional({
    description: 'Existing stage ID (job stage editor only); omit for new stages',
  })
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @ApiProperty({ example: 'Tech Interview' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    enum: StageCategory,
    description: 'Which candidate status this stage counts as',
  })
  @IsEnum(StageCategory)
  category: StageCategory;

  @ApiProperty({ example: '#8B5CF6' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a hex color like #8B5CF6' })
  color: string;
}
