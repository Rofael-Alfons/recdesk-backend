import { IsString, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendEmailDto {
  @ApiProperty({ description: 'Candidate ID to send email to' })
  @IsUUID()
  candidateId: string;

  @ApiProperty({ description: 'Email template ID to use' })
  @IsUUID()
  templateId: string;

  @ApiPropertyOptional({ description: 'Override subject line (optional)' })
  @IsString()
  @IsOptional()
  subjectOverride?: string;
}
