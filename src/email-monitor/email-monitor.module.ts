import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { EmailMonitorScheduler } from './email-monitor.scheduler';
import { EmailMonitorController } from './email-monitor.controller';
import { EmailPrefilterService } from './email-prefilter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';
import { FileProcessingModule } from '../file-processing/file-processing.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    IntegrationsModule,
    AiModule,
    FileProcessingModule,
  ],
  controllers: [EmailMonitorController],
  providers: [EmailMonitorService, EmailMonitorScheduler, EmailPrefilterService],
  exports: [EmailMonitorService, EmailPrefilterService],
})
export class EmailMonitorModule {}
