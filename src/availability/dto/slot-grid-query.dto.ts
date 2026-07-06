import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SlotGridQueryDto {
  @ApiProperty({ description: 'IANA timezone the slot grid should be expressed in' })
  @IsString()
  @MaxLength(64)
  interviewTimezone: string;

  @ApiProperty({ minimum: 10, maximum: 480 })
  @IsInt()
  @Min(10)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({ default: 14, minimum: 1, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  withinDays: number = 14;

  @ApiPropertyOptional({ default: 15, minimum: 5, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  stepMinutes: number = 15;
}
