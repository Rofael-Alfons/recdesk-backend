import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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
import { HealthModule } from './health/health.module';
import { CacheModule } from './cache/cache.module';
import { StorageModule } from './storage/storage.module';
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
    // Rate limiting - prevents brute force attacks while allowing normal frontend operation
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 20 },    // 20 requests/second (allows page load bursts)
        { name: 'medium', ttl: 10000, limit: 100 }, // 100 requests/10 seconds
        { name: 'long', ttl: 60000, limit: 300 },   // 300 requests/minute
      ],
    }),
    // Structured logging with Pino
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('nodeEnv') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined // JSON output in production for log aggregation
              : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                },
              },
            autoLogging: {
              ignore: (req) => {
                // Don't log health check requests
                return req.url?.startsWith('/health') || false;
              },
            },
            customProps: (req) => ({
              context: 'HTTP',
              correlationId: req.headers['x-correlation-id'] || (req as any).correlationId,
            }),
            redact: ['req.headers.authorization'], // Don't log auth tokens
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    CacheModule,
    StorageModule,
    HealthModule,
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
    // Global exception filter with Pino logger
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
