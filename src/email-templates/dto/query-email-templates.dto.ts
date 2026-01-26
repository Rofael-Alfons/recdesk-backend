import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailTemplateType } from './create-email-template.dto';

export class QueryEmailTemplatesDto {
  @ApiPropertyOptional({ 
    description: 'Filter by template type', 
    enum: EmailTemplateType 
  })
  @IsEnum(EmailTemplateType)
  @IsOptional()
  type?: EmailTemplateType;
}
