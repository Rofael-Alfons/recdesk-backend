import { Module, Logger, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CvProcessingProcessor } from './processors/cv-processing.processor';
import { EmailClassificationProcessor } from './processors/email-classification.processor';
import { ScoringProcessor } from './processors/scoring.processor';
import { QueueService } from './queue.service';
import { NoOpQueueService } from './noop-queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { FileProcessingModule } from '../file-processing/file-processing.module';
import { BillingModule } from '../billing/billing.module';
import { QUEUE_NAMES } from './queue.constants';
import Redis from 'ioredis';

const logger = new Logger('QueueModule');

// Check if Redis is available - only when explicitly configured via URL or host
const isRedisConfigured = (): boolean => {
  return !!process.env.REDIS_URL || !!process.env.REDIS_HOST;
};

// Test Redis connection with timeout
async function testRedisConnection(config: any, timeoutMs: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const redis = new Redis({
      ...config,
      lazyConnect: true,
      connectTimeout: timeoutMs,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry
    });

    const timeout = setTimeout(() => {
      logger.warn('Redis connection test timed out');
      redis.disconnect();
      resolve(false);
    }, timeoutMs);

    redis.on('error', (err) => {
      clearTimeout(timeout);
      logger.warn(`Redis connection test failed: ${err.message}`);
      redis.disconnect();
      resolve(false);
    });

    redis.connect()
      .then(() => redis.ping())
      .then(() => {
        clearTimeout(timeout);
        logger.log('Redis connection test successful');
        redis.disconnect();
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        logger.warn(`Redis connection test failed: ${err.message}`);
        redis.disconnect();
        resolve(false);
      });
  });
}

// Build Redis configuration from environment
function buildRedisConfig(configService: ConfigService): any {
  const redisUrl = configService.get<string>('redis.url');
  const redisHost = configService.get<string>('redis.host');
  const redisPort = configService.get<number>('redis.port');
  const redisPassword = configService.get<string>('redis.password');

  let redisConfig: any;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      redisConfig = {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        password: url.password || undefined,
        // Add TLS support for rediss:// URLs (Railway may use TLS)
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      };
      logger.log(`Redis config from URL: ${url.hostname}:${url.port}`);
    } catch (e) {
      logger.warn(`Invalid REDIS_URL, falling back to localhost`);
      redisConfig = { host: 'localhost', port: 6379 };
    }
  } else {
    redisConfig = {
      host: redisHost || 'localhost',
      port: redisPort || 6379,
      password: redisPassword || undefined,
    };
    logger.log(`Redis config: ${redisConfig.host}:${redisConfig.port}`);
  }

  // Add common options for Railway compatibility
  redisConfig.family = 0; // Support both IPv4 and IPv6
  redisConfig.connectTimeout = 5000;
  redisConfig.enableOfflineQueue = false;
  redisConfig.maxRetriesPerRequest = 1;
  redisConfig.lazyConnect = true;
  redisConfig.retryStrategy = (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 500, 2000);
  };

  return redisConfig;
}

@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    // If Redis is not configured, return a minimal module with NoOpQueueService
    if (!isRedisConfigured()) {
      logger.log('Redis not configured - using NoOp QueueService');
      return {
        module: QueueModule,
        global: true, // Make QueueService available globally
        providers: [
          {
            provide: QueueService,
            useClass: NoOpQueueService,
          },
        ],
        exports: [QueueService],
      };
    }

    // Redis is configured - return full module with Bull
    return {
      module: QueueModule,
      global: true, // Make QueueService available globally
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const redisConfig = buildRedisConfig(configService);

            // Test connection before proceeding (with timeout)
            const canConnect = await testRedisConnection(redisConfig, 5000);
            if (!canConnect) {
              logger.warn('Redis connection test failed - Bull queues may not work');
              // Still return config - let Bull handle the connection
              // This prevents blocking but queues might fail at runtime
            }

            return {
              redis: redisConfig,
              defaultJobOptions: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 2000,
                },
                removeOnComplete: 100,
                removeOnFail: 50,
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
    };
  }
}
