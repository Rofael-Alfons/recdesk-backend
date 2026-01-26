import { IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreviewEmailDto {
  @ApiProperty({ description: 'Email template ID to preview' })
  @IsUUID()
  templateId: string;

  @ApiPropertyOptional({ description: 'Candidate ID to use for personalization (optional - uses sample data if not provided)' })
  @IsUUID()
  @IsOptional()
  candidateId?: string;
}
