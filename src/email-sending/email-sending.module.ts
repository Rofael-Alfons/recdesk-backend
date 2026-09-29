import { Module } from '@nestjs/common';
import { EmailSendingController } from './email-sending.controller';
import { EmailSendingService } from './email-sending.service';
import { TemplateEngineService } from './template-engine.service';
import { TransactionalEmailService } from './transactional-email.service';
import { ScheduledEmailsService } from './scheduled-emails.service';
import { ScheduledEmailScheduler } from './scheduled-email.scheduler';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { BillingModule } from '../billing/billing.module';
import { CandidateSelectionModule } from '../candidates/selection/candidate-selection.module';

@Module({
  imports: [EmailTemplatesModule, BillingModule, CandidateSelectionModule],
  controllers: [EmailSendingController],
  providers: [
    EmailSendingService,
    TemplateEngineService,
    TransactionalEmailService,
    ScheduledEmailsService,
    ScheduledEmailScheduler,
  ],
  exports: [
    EmailSendingService,
    TemplateEngineService,
    TransactionalEmailService,
    ScheduledEmailsService,
  ],
})
export class EmailSendingModule {}
