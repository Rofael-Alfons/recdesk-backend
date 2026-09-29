import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { SavedViewsService } from './saved-views.service';
import { WelcomeEmailScheduler } from './welcome-email.scheduler';
import { SavedViewAlertScheduler } from './saved-view-alert.scheduler';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { EmailSendingModule } from '../email-sending/email-sending.module';
import { CandidateSelectionModule } from './selection/candidate-selection.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AiModule,
    BillingModule,
    EmailSendingModule,
    CandidateSelectionModule,
    // QueueModule is now globally available via AppModule with graceful degradation
  ],
  controllers: [CandidatesController],
  providers: [
    CandidatesService,
    SavedViewsService,
    WelcomeEmailScheduler,
    SavedViewAlertScheduler,
  ],
  exports: [CandidatesService],
})
export class CandidatesModule { }
