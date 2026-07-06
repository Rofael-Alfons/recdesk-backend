import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitAvailabilityDto {
  @ApiProperty({
    description: 'Wall-clock local start times (YYYY-MM-DDTHH:mm) that work',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  slots: string[];
}
