import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveStageDto {
  @ApiProperty({ description: "Pipeline stage of the candidate's job" })
  @IsUUID('all')
  stageId: string;
}
