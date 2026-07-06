import { IsBoolean, IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm, 24h

export class UpsertOverrideDto {
  @ApiProperty({ example: '2026-07-10', description: 'Calendar date, YYYY-MM-DD' })
  @IsDateString()
  date: string;

  @ApiProperty()
  @IsBoolean()
  isAvailable: boolean;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_RE, { message: 'startTime must be in HH:mm 24h format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_RE, { message: 'endTime must be in HH:mm 24h format' })
  endTime?: string;
}
