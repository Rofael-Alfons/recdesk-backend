import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { InterviewLocationType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InterviewMode {
  REQUEST_MANAGER = 'request_manager',
  MANUAL_SLOTS = 'manual_slots',
}

export class CreateInterviewDto {
  @ApiProperty({ description: 'Candidate to interview' })
  @IsUUID()
  candidateId: string;

  @ApiPropertyOptional({
    enum: InterviewMode,
    description:
      'request_manager: ask the internal hiring manager for availability. ' +
      'manual_slots: recruiter provides the times directly.',
  })
  @IsOptional()
  @IsEnum(InterviewMode)
  mode?: InterviewMode;

  @ApiPropertyOptional({
    description: 'Internal hiring manager (team member) who will interview',
  })
  @IsOptional()
  @IsUUID()
  interviewerUserId?: string;

  @ApiPropertyOptional({ default: 45 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ default: 'Africa/Cairo', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ enum: InterviewLocationType })
  @IsOptional()
  @IsEnum(InterviewLocationType)
  locationType?: InterviewLocationType;

  @ApiPropertyOptional({ description: 'Meeting URL, phone number, or address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationDetails?: string;

  @ApiPropertyOptional({ description: 'Optional note shown to the candidate' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ description: 'Extra attendee emails cc-d on the invite' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  additionalAttendees?: string[];

  @ApiPropertyOptional({
    description:
      'Wall-clock local start times (YYYY-MM-DDTHH:mm) for manual_slots mode',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  slots?: string[];
}
