"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisHealthIndicator = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisHealthIndicator = class RedisHealthIndicator extends terminus_1.HealthIndicator {
    configService;
    redis = null;
    constructor(configService) {
        super();
        this.configService = configService;
        this.initRedis();
    }
    initRedis() {
        const redisHost = this.configService.get('redis.host');
        const redisPort = this.configService.get('redis.port');
        const redisPassword = this.configService.get('redis.password');
        if (redisHost) {
            this.redis = new ioredis_1.default({
                host: redisHost,
                port: redisPort || 6379,
                password: redisPassword || undefined,
                maxRetriesPerRequest: 1,
                connectTimeout: 5000,
                lazyConnect: true,
            });
        }
    }
    async isHealthy(key) {
        if (!this.redis) {
            return this.getStatus(key, true, { message: 'Redis not configured' });
        }
        try {
            await this.redis.ping();
            return this.getStatus(key, true);
        }
        catch (error) {
            throw new terminus_1.HealthCheckError('Redis health check failed', this.getStatus(key, false, { message: error.message }));
        }
    }
    async onModuleDestroy() {
        if (this.redis) {
            await this.redis.quit();
        }
    }
};
exports.RedisHealthIndicator = RedisHealthIndicator;
exports.RedisHealthIndicator = RedisHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisHealthIndicator);
//# sourceMappingURL=redis.health.js.map