import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateInterviewEvaluationDto } from './create-interview-evaluation.dto';

// candidateId/jobId are immutable after creation — updates only touch the scorecard content
export class UpdateInterviewEvaluationDto extends PartialType(
  OmitType(CreateInterviewEvaluationDto, ['candidateId', 'jobId'] as const),
) {}
