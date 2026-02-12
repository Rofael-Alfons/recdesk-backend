import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { EmailMonitorScheduler } from './email-monitor.scheduler';
import { EmailMonitorController } from './email-monitor.controller';
import { GmailWebhookController } from './gmail-webhook.controller';
import { EmailPrefilterService } from './email-prefilter.service';
import { EmailCleanupService } from './email-cleanup.service';
import { GmailPubsubService } from './gmail-pubsub.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';
import { FileProcessingModule } from '../file-processing/file-processing.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    forwardRef(() => IntegrationsModule),
    AiModule,
    FileProcessingModule,
    BillingModule,
  ],
  controllers: [EmailMonitorController, GmailWebhookController],
  providers: [
    EmailMonitorService,
    EmailMonitorScheduler,
    EmailPrefilterService,
    EmailCleanupService,
    GmailPubsubService,
  ],
  exports: [EmailMonitorService, EmailPrefilterService, GmailPubsubService],
})
export class EmailMonitorModule {}
