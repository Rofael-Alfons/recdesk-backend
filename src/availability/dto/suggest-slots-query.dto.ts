import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestSlotsQueryDto {
  @ApiProperty({ description: 'IANA timezone the suggested slots should be expressed in' })
  @IsString()
  @MaxLength(64)
  interviewTimezone: string;

  @ApiProperty({ minimum: 10, maximum: 480 })
  @IsInt()
  @Min(10)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  count: number = 5;

  @ApiPropertyOptional({ default: 14, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  withinDays: number = 14;
}
