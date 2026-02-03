import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
export declare class RedisHealthIndicator extends HealthIndicator {
    private configService;
    private redis;
    constructor(configService: ConfigService);
    private initRedis;
    isHealthy(key: string): Promise<HealthIndicatorResult>;
    onModuleDestroy(): Promise<void>;
}
