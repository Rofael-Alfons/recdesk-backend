import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class QueryScheduledEmailsDto {
  @ApiPropertyOptional({ description: 'Only emails for this candidate' })
  @IsOptional()
  @IsUUID()
  candidateId?: string;
}

export class CancelScheduledEmailsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  ids: string[];
}
