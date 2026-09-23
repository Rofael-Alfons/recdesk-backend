import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { WelcomeEmailScheduler } from './welcome-email.scheduler';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { EmailSendingModule } from '../email-sending/email-sending.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AiModule,
    BillingModule,
    EmailSendingModule,
    // QueueModule is now globally available via AppModule with graceful degradation
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService, WelcomeEmailScheduler],
  exports: [CandidatesService],
})
export class CandidatesModule { }
