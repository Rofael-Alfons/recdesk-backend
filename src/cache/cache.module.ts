import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

const logger = new Logger('CacheModule');

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
        
        try {
          if (redisUrl) {
            logger.log('Attempting to connect to Redis via URL...');
            // Use REDIS_URL directly (Railway format)
            const store = await redisStore({
              url: redisUrl,
              ttl: 300, // Default TTL: 5 minutes
              // Add error handling
              lazyConnect: false,
              maxRetriesPerRequest: 3,
              retryStrategy: (times: number) => {
                if (times > 3) return null;
                return Math.min(times * 200, 2000);
              },
            });
            logger.log('Successfully connected to Redis cache');
            return { store };
          } else if (redisHost && (isProduction || redisHost !== 'localhost')) {
            logger.log(`Attempting to connect to Redis at ${redisHost}:${redisPort}...`);
            const store = await redisStore({
              host: redisHost,
              port: redisPort,
              password: redisPassword || undefined,
              ttl: 300, // Default TTL: 5 minutes
              lazyConnect: false,
              maxRetriesPerRequest: 3,
              retryStrategy: (times: number) => {
                if (times > 3) return null;
                return Math.min(times * 200, 2000);
              },
            });
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
