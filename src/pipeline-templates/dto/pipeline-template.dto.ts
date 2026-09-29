import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PipelineStageInputDto } from '../../common/dto/pipeline-stage-input.dto';
import { MAX_PIPELINE_STAGES } from '../../common/pipeline-stage.util';

export class CreatePipelineTemplateDto {
  @ApiProperty({ example: 'Engineering' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ type: [PipelineStageInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PIPELINE_STAGES)
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages: PipelineStageInputDto[];

  @ApiPropertyOptional({ description: 'Make this the default for new jobs' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePipelineTemplateDto extends PartialType(CreatePipelineTemplateDto) {}

export class TemplateFromJobDto {
  @ApiProperty({ example: 'Engineering' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;
}
