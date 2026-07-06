import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm, 24h

export class AvailabilityRuleDto {
  @ApiProperty({ description: '0=Sunday .. 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_RE, { message: 'startTime must be in HH:mm 24h format' })
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(TIME_RE, { message: 'endTime must be in HH:mm 24h format' })
  endTime: string;
}

export class UpsertScheduleDto {
  @ApiPropertyOptional({ default: 'Africa/Cairo', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiProperty({ type: [AvailabilityRuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules: AvailabilityRuleDto[];
}
