import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JobStatus, ExperienceLevel } from '@prisma/client';
import { PipelineStageInputDto } from '../../common/dto/pipeline-stage-input.dto';
import { MAX_PIPELINE_STAGES } from '../../common/pipeline-stage.util';

export class CreateJobDto {
  @ApiProperty({ example: 'Senior Backend Developer' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'We are looking for an experienced backend developer...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: JobStatus, default: JobStatus.DRAFT })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({
    enum: ExperienceLevel,
    default: ExperienceLevel.JUNIOR,
  })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({
    example: ['Node.js', 'TypeScript', 'PostgreSQL'],
    description: 'Required skills for the position',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional({
    example: ['Docker', 'AWS', 'GraphQL'],
    description: 'Nice-to-have skills',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSkills?: string[];

  @ApiPropertyOptional({
    example: {
      yearsOfExperience: 5,
      education: 'Bachelor in CS',
      languages: ['English'],
    },
    description: 'Additional requirements as JSON',
  })
  @IsOptional()
  @IsObject()
  requirements?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Pipeline template to seed stages from ("standard" = built-in). Ignored when `stages` is given.',
  })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({
    type: [PipelineStageInputDto],
    description: 'Explicit pipeline stages, in order (overrides templateId)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PIPELINE_STAGES)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages?: PipelineStageInputDto[];
}

export class ReplaceJobStagesDto {
  @ApiProperty({
    type: [PipelineStageInputDto],
    description:
      'The full pipeline in order. Existing stages keep their `id`; stages left out are deleted (only if unused).',
  })
  @IsArray()
  @ArrayMaxSize(MAX_PIPELINE_STAGES)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages: PipelineStageInputDto[];
}
