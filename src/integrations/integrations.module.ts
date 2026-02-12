import { Module, forwardRef } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { EmailMonitorModule } from '../email-monitor/email-monitor.module';

@Module({
  imports: [
    // forwardRef needed: IntegrationsModule <-> EmailMonitorModule
    // GmailPubsubService is used by IntegrationsController for watch/stop on connect/disconnect
    forwardRef(() => EmailMonitorModule),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
