import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CandidateSource, CandidateStatus } from '@prisma/client';

export class CreateCandidateDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional({ example: 'john.doe@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'Cairo, Egypt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/johndoe' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 'https://github.com/johndoe' })
  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional({ example: 'https://johndoe.com' })
  @IsOptional()
  @IsUrl()
  portfolioUrl?: string;

  @ApiPropertyOptional({
    enum: CandidateSource,
    default: CandidateSource.MANUAL,
  })
  @IsOptional()
  @IsEnum(CandidateSource)
  source?: CandidateSource;

  @ApiPropertyOptional({ enum: CandidateStatus, default: CandidateStatus.NEW })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ description: 'Job ID to assign candidate to' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ example: ['javascript', 'react'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
