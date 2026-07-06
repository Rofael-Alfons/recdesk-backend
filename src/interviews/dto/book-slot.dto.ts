import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BookSlotDto {
  @ApiPropertyOptional({ description: 'The chosen slot id, for FIXED-offer interviews' })
  @IsOptional()
  @IsUUID()
  slotId?: string;

  @ApiPropertyOptional({
    description:
      'Wall-clock local start time ("YYYY-MM-DDTHH:mm") in the interview timezone, for LIVE-offer interviews',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  start?: string;
}
