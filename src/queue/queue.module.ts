import { Module, Logger } from '@nestjs/common';
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

const logger = new Logger('QueueModule');

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        const redisHost = configService.get<string>('redis.host');
        const redisPort = configService.get<number>('redis.port');
        const redisPassword = configService.get<string>('redis.password');

        // Bull expects redis config as ioredis options
        // For URL: parse and pass as host/port/password
        // See: https://github.com/OptimalBits/bull/blob/master/REFERENCE.md
        let redisConfig: any;
        
        if (redisUrl) {
          try {
            const url = new URL(redisUrl);
            redisConfig = {
              host: url.hostname,
              port: parseInt(url.port || '6379', 10),
              password: url.password || undefined,
            };
            logger.log(`Configuring Bull queue with Redis URL: ${url.hostname}:${url.port}`);
          } catch (e) {
            // Invalid URL, fall back to defaults
            logger.warn(`Invalid REDIS_URL, falling back to localhost`);
            redisConfig = { host: 'localhost', port: 6379 };
          }
        } else {
          redisConfig = {
            host: redisHost || 'localhost',
            port: redisPort || 6379,
            password: redisPassword || undefined,
          };
          logger.log(`Configuring Bull queue with Redis: ${redisConfig.host}:${redisConfig.port}`);
        }

        // Add error handling options to prevent unhandled errors
        redisConfig.maxRetriesPerRequest = 3;
        redisConfig.retryStrategy = (times: number) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null; // Stop retrying
          }
          return Math.min(times * 200, 2000); // Retry with backoff
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
