import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Multipart form fields arrive as strings; treat "" as absent.
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class MyLinkQueryDto {
  @ApiPropertyOptional({
    description: 'Tie the link to a specific job posting',
  })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    description: 'ISO date; filters on candidate creation date',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date; inclusive when date-only' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SubmitReferralDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
