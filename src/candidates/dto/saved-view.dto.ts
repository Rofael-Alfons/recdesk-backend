import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSavedViewDto {
  @ApiProperty({ example: 'Cairo backend, 3+ years' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({
    description: 'Candidate list query string',
    example: 'country=Egypt&minExperience=3&skills=node.js',
  })
  @IsString()
  @MaxLength(2000)
  query: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

export class SetViewAlertDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Also include this view in the daily email digest',
  })
  @IsOptional()
  @IsBoolean()
  emailDigest?: boolean;
}

export class UpdateSavedViewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}
