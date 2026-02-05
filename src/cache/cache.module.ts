import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

const logger = new Logger('CacheModule');

// Timeout wrapper to prevent hanging during Redis connection
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg)), ms),
  );
  return Promise.race([promise, timeout]);
};

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('redis.host');
        const redisPort = configService.get<number>('redis.port');
        const redisPassword = configService.get<string>('redis.password');
        const isProduction =
          configService.get<string>('nodeEnv') === 'production';

        // Use Redis if configured, otherwise use in-memory cache
        const redisUrl = configService.get<string>('redis.url');

        // Common Redis options for non-blocking connection
        const redisOptions = {
          ttl: 300, // Default TTL: 5 minutes
          lazyConnect: true, // Don't block on connection
          enableOfflineQueue: false, // Fail fast when disconnected
          connectTimeout: 5000, // 5 second connection timeout
          maxRetriesPerRequest: 1, // Fail fast on request errors
          retryStrategy: (times: number) => {
            if (times > 3) {
              logger.warn('Redis retry limit reached, giving up');
              return null;
            }
            return Math.min(times * 500, 2000);
          },
        };

        try {
          if (redisUrl) {
            logger.log('Attempting to connect to Redis via URL...');
            // Use timeout to prevent hanging during startup
            const store = await withTimeout(
              redisStore({ url: redisUrl, ...redisOptions }),
              5000,
              'Redis connection timeout (5s)',
            );
            logger.log('Successfully connected to Redis cache');
            return { store };
          } else if (redisHost && (isProduction || redisHost !== 'localhost')) {
            logger.log(`Attempting to connect to Redis at ${redisHost}:${redisPort}...`);
            const store = await withTimeout(
              redisStore({
                host: redisHost,
                port: redisPort,
                password: redisPassword || undefined,
                ...redisOptions,
              }),
              5000,
              'Redis connection timeout (5s)',
            );
            logger.log('Successfully connected to Redis cache');
            return { store };
          }
        } catch (error) {
          logger.warn(`Redis connection failed, falling back to in-memory cache: ${error.message}`);
          // Fall through to in-memory cache
        }

        // In-memory cache for development or when Redis is unavailable
        logger.log('Using in-memory cache');
        return {
          ttl: 300, // 5 minutes default TTL
          max: 100, // Maximum number of items in cache
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
