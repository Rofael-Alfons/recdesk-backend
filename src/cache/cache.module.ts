import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('redis.host');
        const redisPort = configService.get<number>('redis.port');
        const redisPassword = configService.get<string>('redis.password');
        const isProduction = configService.get<string>('nodeEnv') === 'production';

        // Use Redis if configured, otherwise use in-memory cache
        if (redisHost && (isProduction || redisHost !== 'localhost')) {
          return {
            store: await redisStore({
              host: redisHost,
              port: redisPort,
              password: redisPassword || undefined,
              ttl: 300, // Default TTL: 5 minutes
            }),
          };
        }

        // In-memory cache for development
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
export class CacheModule { }
