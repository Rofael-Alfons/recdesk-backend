import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { JobsModule } from './jobs/jobs.module';
import { CandidatesModule } from './candidates/candidates.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AiModule } from './ai/ai.module';
import { FileProcessingModule } from './file-processing/file-processing.module';
import { UploadModule } from './upload/upload.module';
import { QueueModule } from './queue/queue.module';
import { EmailMonitorModule } from './email-monitor/email-monitor.module';
import { BillingModule } from './billing/billing.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { EmailSendingModule } from './email-sending/email-sending.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';

// Check if Redis is available
const isRedisConfigured = (): boolean => {
  return !!process.env.REDIS_HOST || process.env.NODE_ENV === 'production';
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    CompaniesModule,
    UsersModule,
    JobsModule,
    CandidatesModule,
    IntegrationsModule,
    AiModule,
    FileProcessingModule,
    UploadModule,
    EmailMonitorModule,
    BillingModule,
    EmailTemplatesModule,
    EmailSendingModule,
    NotificationsModule,
    // Only import QueueModule if Redis is configured
    ...(isRedisConfigured() ? [QueueModule] : []),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
