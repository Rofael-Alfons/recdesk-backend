import { Module } from '@nestjs/common';
import { EmailSendingController } from './email-sending.controller';
import { EmailSendingService } from './email-sending.service';
import { TemplateEngineService } from './template-engine.service';
import { TransactionalEmailService } from './transactional-email.service';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [EmailTemplatesModule, BillingModule],
  controllers: [EmailSendingController],
  providers: [EmailSendingService, TemplateEngineService, TransactionalEmailService],
  exports: [EmailSendingService, TemplateEngineService, TransactionalEmailService],
})
export class EmailSendingModule {}
