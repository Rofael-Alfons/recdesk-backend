import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsString,
  IsIn,
  IsBoolean,
  IsNumber,
  IsDateString,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  CandidateGender,
  CandidateSource,
  CandidateSourceChannel,
  CandidateStatus,
  DocumentRequestStatus,
  EducationLevel,
  InterviewRecommendation,
} from '@prisma/client';

export const AI_RECOMMENDATIONS = [
  'Highly Recommended',
  'Recommended',
  'Consider',
  'Not Recommended',
] as const;

const MAX_LIST_SIZE = 100;

/**
 * Multi-value params accept "a,b,c" as well as repeated keys, so existing
 * single-value URLs such as `status=NEW` keep working unchanged.
 */
const toList = ({ value }: TransformFnParams): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw: unknown[] = Array.isArray(value) ? value : String(value).split(',');
  const list = raw.map((v) => String(v).trim()).filter(Boolean);
  return list.length ? list : undefined;
};

/**
 * Reads the raw query value: with the global enableImplicitConversion,
 * `value` has already been through Boolean("false") === true.
 */
const toBoolean = ({ obj, key }: TransformFnParams): unknown => {
  const raw = obj[key];
  if (raw === true || raw === 'true' || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === '0') return false;
  return raw;
};

export class QueryCandidatesDto {
  @ApiPropertyOptional({ enum: CandidateStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(CandidateStatus, { each: true })
  status?: CandidateStatus[];

  @ApiPropertyOptional({ enum: CandidateSource, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(CandidateSource, { each: true })
  source?: CandidateSource[];

  @ApiPropertyOptional({ enum: CandidateSourceChannel, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(CandidateSourceChannel, { each: true })
  sourceChannel?: CandidateSourceChannel[];

  @ApiPropertyOptional({ description: 'Job IDs, comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsUUID(undefined, { each: true })
  jobId?: string[];

  @ApiPropertyOptional({
    description: 'Include candidates with no job. Combined with jobId as OR.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional({ description: 'Minimum score (0-100)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Maximum score (0-100)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  @Max(100)
  maxScore?: number;

  @ApiPropertyOptional({ enum: AI_RECOMMENDATIONS, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(AI_RECOMMENDATIONS.length)
  @IsIn(AI_RECOMMENDATIONS, { each: true })
  aiRecommendation?: string[];

  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by a single tag (legacy; prefer tags)' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Tags, comma-separated; matches any' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Countries, comma-separated', example: 'Egypt' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  country?: string[];

  @ApiPropertyOptional({ description: 'Regions, comma-separated', example: 'Cairo' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  region?: string[];

  @ApiPropertyOptional({ description: 'Cities, comma-separated', example: 'Nasr City' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  city?: string[];

  @ApiPropertyOptional({
    enum: CandidateGender,
    isArray: true,
    description:
      'SENSITIVE. Comma-separated. Ignored unless the company has collectGenderData enabled.',
  })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(CandidateGender, { each: true })
  gender?: CandidateGender[];

  @ApiPropertyOptional({ description: 'Skills, comma-separated (case-insensitive)' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ enum: ['any', 'all'], default: 'any' })
  @IsOptional()
  @IsIn(['any', 'all'])
  skillsMatch?: 'any' | 'all';

  @ApiPropertyOptional({ description: 'Languages, comma-separated (case-insensitive); matches any' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @MaxLength(100, { each: true })
  languages?: string[];

  @ApiPropertyOptional({ description: 'Minimum years of experience' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  minExperience?: number;

  @ApiPropertyOptional({ description: 'Maximum years of experience' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  maxExperience?: number;

  @ApiPropertyOptional({
    enum: EducationLevel,
    description: 'Minimum education level; higher levels also match',
  })
  @IsOptional()
  @IsEnum(EducationLevel)
  minEducationLevel?: EducationLevel;

  @ApiPropertyOptional({
    enum: EducationLevel,
    isArray: true,
    description: 'Exact education levels, comma-separated',
  })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(EducationLevel, { each: true })
  educationLevel?: EducationLevel[];

  @ApiPropertyOptional({ description: 'University contains (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  university?: string;

  @ApiPropertyOptional({ description: 'Current job title contains (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentTitle?: string;

  @ApiPropertyOptional({ description: 'Current company contains (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentCompany?: string;

  @ApiPropertyOptional({ description: 'Has (true) or has no (false) scheduled interview' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasScheduledInterview?: boolean;

  @ApiPropertyOptional({ enum: InterviewRecommendation, isArray: true, description: 'Scorecard recommendation, comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(InterviewRecommendation, { each: true })
  interviewRecommendation?: InterviewRecommendation[];

  @ApiPropertyOptional({ enum: DocumentRequestStatus, isArray: true, description: 'Document request status, comma-separated' })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(MAX_LIST_SIZE)
  @IsEnum(DocumentRequestStatus, { each: true })
  documentStatus?: DocumentRequestStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasCv?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasPhone?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasLinkedin?: boolean;

  @ApiPropertyOptional({ description: 'Added on/after (YYYY-MM-DD or ISO)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Added on/before; a bare date is inclusive' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hiredFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hiredTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  updatedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  updatedTo?: string;

  @ApiPropertyOptional({ enum: ['score', 'createdAt', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'score' | 'createdAt' | 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
