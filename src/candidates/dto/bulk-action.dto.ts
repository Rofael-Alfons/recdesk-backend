import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CandidateStatus, RejectionReason } from '@prisma/client';
import { CandidateSelectionDto } from '../selection/candidate-selection.dto';

// Every bulk DTO takes either `candidateIds` or `filter` (+ `excludeIds`);
// see CandidateSelectionDto.

export class BulkUpdateStatusDto extends CandidateSelectionDto {
  @ApiProperty({ enum: CandidateStatus })
  @IsEnum(CandidateStatus)
  status: CandidateStatus;
}

export class BulkAddTagsDto extends CandidateSelectionDto {
  @ApiProperty({ example: ['top-talent', 'urgent'] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  tags: string[];
}

export class BulkRemoveTagsDto extends CandidateSelectionDto {
  @ApiProperty({ example: ['urgent'] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  tags: string[];
}

export class BulkAssignJobDto extends CandidateSelectionDto {
  @ApiProperty({ description: 'Job ID to assign candidates to' })
  @IsUUID()
  jobId: string;
}

export class BulkDeleteDto extends CandidateSelectionDto {}

export class BulkExportDto extends CandidateSelectionDto {}

export const REJECTION_EMAIL_DELAYS_HOURS = [0, 1, 24, 48] as const;

export class RejectionEmailOptionsDto {
  @ApiProperty({ description: 'Email template to send' })
  @IsUUID()
  templateId: string;

  @ApiProperty({ enum: REJECTION_EMAIL_DELAYS_HOURS, example: 24 })
  @IsIn(REJECTION_EMAIL_DELAYS_HOURS)
  delayHours: (typeof REJECTION_EMAIL_DELAYS_HOURS)[number];
}

export class BulkRejectDto extends CandidateSelectionDto {
  @ApiProperty({ enum: RejectionReason })
  @IsEnum(RejectionReason)
  reason: RejectionReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    type: RejectionEmailOptionsDto,
    description: 'Schedule a rejection email; cancellable until it is sent',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RejectionEmailOptionsDto)
  email?: RejectionEmailOptionsDto;
}
