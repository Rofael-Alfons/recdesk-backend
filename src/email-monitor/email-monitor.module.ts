import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { EmailMonitorScheduler } from './email-monitor.scheduler';
import { EmailMonitorController } from './email-monitor.controller';
import { EmailPrefilterService } from './email-prefilter.service';
import { EmailCleanupService } from './email-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';
import { FileProcessingModule } from '../file-processing/file-processing.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    IntegrationsModule,
    AiModule,
    FileProcessingModule,
    BillingModule,
  ],
  controllers: [EmailMonitorController],
  providers: [EmailMonitorService, EmailMonitorScheduler, EmailPrefilterService, EmailCleanupService],
  exports: [EmailMonitorService, EmailPrefilterService],
})
export class EmailMonitorModule {}
