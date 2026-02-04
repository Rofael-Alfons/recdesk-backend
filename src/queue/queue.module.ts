import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CvProcessingProcessor } from './processors/cv-processing.processor';
import { EmailClassificationProcessor } from './processors/email-classification.processor';
import { ScoringProcessor } from './processors/scoring.processor';
import { QueueService } from './queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { FileProcessingModule } from '../file-processing/file-processing.module';
import { BillingModule } from '../billing/billing.module';
import { QUEUE_NAMES } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        
        // Use REDIS_URL if available (Railway format), otherwise use individual config
        const redisConfig = redisUrl
          ? { url: redisUrl }
          : {
              host: configService.get<string>('redis.host'),
              port: configService.get<number>('redis.port'),
              password: configService.get<string>('redis.password') || undefined,
            };

        return {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 50, // Keep last 50 failed jobs
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.CV_PROCESSING },
      { name: QUEUE_NAMES.EMAIL_CLASSIFICATION },
      { name: QUEUE_NAMES.SCORING },
    ),
    PrismaModule,
    AiModule,
    FileProcessingModule,
    BillingModule,
  ],
  providers: [
    QueueService,
    CvProcessingProcessor,
    EmailClassificationProcessor,
    ScoringProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
