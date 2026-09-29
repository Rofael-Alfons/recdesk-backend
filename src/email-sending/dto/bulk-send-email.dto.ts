import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSelectionDto } from '../../candidates/selection/candidate-selection.dto';

// Recipients: `candidateIds`, or `filter` (+ `excludeIds`) for "all matching".
export class BulkSendEmailDto extends CandidateSelectionDto {
  @ApiProperty({ description: 'Email template ID to use' })
  @IsUUID()
  templateId: string;

  @ApiPropertyOptional({
    description: 'Override subject line for all emails (optional)',
  })
  @IsString()
  @IsOptional()
  subjectOverride?: string;
}
