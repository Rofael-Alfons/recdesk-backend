import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private redis: Redis | null = null;
  private connectionError: string | null = null;

  constructor(private configService: ConfigService) {
    super();
    this.initRedis();
  }

  private initRedis() {
    const redisUrl = this.configService.get<string>('redis.url');
    const redisHost = this.configService.get<string>('redis.host');
    const redisPort = this.configService.get<number>('redis.port');
    const redisPassword = this.configService.get<string>('redis.password');

    const redisOptions = {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry on connection failure
    };

    if (redisUrl) {
      // Use REDIS_URL directly (Railway format)
      this.redis = new Redis(redisUrl, redisOptions);
    } else if (redisHost) {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort || 6379,
        password: redisPassword || undefined,
        ...redisOptions,
      });
    }

    // Handle error events to prevent unhandled exceptions
    if (this.redis) {
      this.redis.on('error', (err) => {
        this.connectionError = err.message;
        this.logger.warn(`Redis connection error (non-fatal): ${err.message}`);
      });
    }
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redis) {
      // Redis not configured, report as optional/skipped
      return this.getStatus(key, true, { message: 'Redis not configured (optional)' });
    }

    try {
      await this.redis.ping();
      return this.getStatus(key, true);
    } catch (error) {
      // Don't fail health check for Redis - it's optional
      // Just report the status
      return this.getStatus(key, true, { 
        message: `Redis unavailable (optional): ${error.message}`,
        optional: true 
      });
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
