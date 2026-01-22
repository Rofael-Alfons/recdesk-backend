import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { CandidateStatus } from '@prisma/client';

export class BulkUpdateStatusDto {
  @ApiProperty({ description: 'Array of candidate IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  candidateIds: string[];

  @ApiProperty({ enum: CandidateStatus })
  @IsEnum(CandidateStatus)
  status: CandidateStatus;
}

export class BulkAddTagsDto {
  @ApiProperty({ description: 'Array of candidate IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  candidateIds: string[];

  @ApiProperty({ example: ['top-talent', 'urgent'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  tags: string[];
}

export class BulkAssignJobDto {
  @ApiProperty({ description: 'Array of candidate IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  candidateIds: string[];

  @ApiProperty({ description: 'Job ID to assign candidates to' })
  @IsUUID()
  jobId: string;
}
