import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsUUID,
  IsUrl,
  IsDateString,
  MaxLength,
} from 'class-validator';
import {
  CandidateGender,
  CandidateSource,
  CandidateSourceChannel,
  CandidateStatus,
} from '@prisma/client';

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

  @ApiPropertyOptional({ example: 'Nasr City, Cairo, Egypt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'Egypt' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    example: 'Cairo',
    description: 'Governorate, state or province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: 'Nasr City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    enum: CandidateGender,
    description:
      'SENSITIVE. Rejected unless the company has collectGenderData enabled.',
  })
  @IsOptional()
  @IsEnum(CandidateGender)
  gender?: CandidateGender;

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

  @ApiPropertyOptional({ enum: CandidateSourceChannel })
  @IsOptional()
  @IsEnum(CandidateSourceChannel)
  sourceChannel?: CandidateSourceChannel;

  @ApiPropertyOptional({
    example: 'careers@acme.com',
    description: 'Free-text detail for the channel, e.g. which inbox or career fair name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceDetail?: string;

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

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Onboarding start date, typically set once status is HIRED',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
