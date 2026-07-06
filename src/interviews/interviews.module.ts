import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InterviewsController } from './interviews.controller';
import { PublicInterviewsController } from './public-interviews.controller';
import { InterviewsService } from './interviews.service';
import { InterviewEmailService } from './interview-email.service';
import { InterviewsScheduler } from './interviews.scheduler';
import { EmailSendingModule } from '../email-sending/email-sending.module';
import { BillingModule } from '../billing/billing.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [ScheduleModule.forRoot(), EmailSendingModule, BillingModule, AvailabilityModule],
  controllers: [InterviewsController, PublicInterviewsController],
  providers: [InterviewsService, InterviewEmailService, InterviewsScheduler],
  exports: [InterviewsService],
})
export class InterviewsModule {}
