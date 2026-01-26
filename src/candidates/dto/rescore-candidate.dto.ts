import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RescoreCandidateDto {
  @ApiProperty({ description: 'Job ID to score the candidate against' })
  @IsUUID()
  jobId: string;
}
