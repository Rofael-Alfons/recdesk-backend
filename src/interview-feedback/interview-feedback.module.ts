import { Module } from '@nestjs/common';
import { InterviewFeedbackController } from './interview-feedback.controller';
import { InterviewFeedbackService } from './interview-feedback.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [InterviewFeedbackController],
  providers: [InterviewFeedbackService],
  exports: [InterviewFeedbackService],
})
export class InterviewFeedbackModule {}
