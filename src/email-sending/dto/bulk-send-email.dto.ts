import {
  IsArray,
  IsUUID,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkSendEmailDto {
  @ApiProperty({
    description: 'Array of candidate IDs to send emails to',
    type: [String],
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  candidateIds: string[];

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
