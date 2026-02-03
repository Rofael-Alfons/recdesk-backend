import {
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EmailTemplateType {
  REJECTION = 'REJECTION',
  INTERVIEW_INVITE = 'INTERVIEW_INVITE',
  OFFER = 'OFFER',
  FOLLOW_UP = 'FOLLOW_UP',
  CUSTOM = 'CUSTOM',
}

export class CreateEmailTemplateDto {
  @ApiProperty({
    description: 'Template name',
    example: 'Professional Rejection',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'Update on your application for {{job_title}}',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email body with personalization tokens',
    example:
      'Dear {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position...',
  })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiProperty({
    description: 'Template type',
    enum: EmailTemplateType,
    example: EmailTemplateType.REJECTION,
  })
  @IsEnum(EmailTemplateType)
  type: EmailTemplateType;

  @ApiPropertyOptional({
    description: 'Set as default template for this type',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
