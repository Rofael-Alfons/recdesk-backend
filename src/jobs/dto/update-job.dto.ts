import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateJobDto } from './create-job.dto';

// Stages are edited through PUT /jobs/:id/stages, not the job update.
export class UpdateJobDto extends PartialType(
  OmitType(CreateJobDto, ['templateId', 'stages'] as const),
) {}
