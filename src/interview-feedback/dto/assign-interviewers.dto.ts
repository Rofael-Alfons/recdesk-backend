import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignInterviewersDto {
  @ApiProperty({
    type: [String],
    description:
      'Full list of interviewer user IDs for this stage (replaces the current list)',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  userIds: string[];
}
