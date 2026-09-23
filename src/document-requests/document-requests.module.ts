import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentRequestsController } from './document-requests.controller';
import { PublicDocumentRequestsController } from './public-document-requests.controller';
import { DocumentRequestsService } from './document-requests.service';
import { DocumentsEmailService } from './documents-email.service';
import { DocumentRequestsScheduler } from './document-requests.scheduler';
import { EmailSendingModule } from '../email-sending/email-sending.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MulterModule.register({ storage: memoryStorage() }),
    EmailSendingModule,
  ],
  controllers: [DocumentRequestsController, PublicDocumentRequestsController],
  providers: [DocumentRequestsService, DocumentsEmailService, DocumentRequestsScheduler],
  exports: [DocumentRequestsService],
})
export class DocumentRequestsModule {}
