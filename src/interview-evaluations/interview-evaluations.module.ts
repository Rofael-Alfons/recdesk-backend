import { Module } from '@nestjs/common';
import { InterviewEvaluationsController } from './interview-evaluations.controller';
import { InterviewEvaluationsService } from './interview-evaluations.service';

@Module({
  controllers: [InterviewEvaluationsController],
  providers: [InterviewEvaluationsService],
  exports: [InterviewEvaluationsService],
})
export class InterviewEvaluationsModule {}
