"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModule = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const config_1 = require("@nestjs/config");
const cache_manager_ioredis_yet_1 = require("cache-manager-ioredis-yet");
const cache_service_1 = require("./cache.service");
let CacheModule = class CacheModule {
};
exports.CacheModule = CacheModule;
exports.CacheModule = CacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            cache_manager_1.CacheModule.registerAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => {
                    const redisHost = configService.get('redis.host');
                    const redisPort = configService.get('redis.port');
                    const redisPassword = configService.get('redis.password');
                    const isProduction = configService.get('nodeEnv') === 'production';
                    if (redisHost && (isProduction || redisHost !== 'localhost')) {
                        return {
                            store: await (0, cache_manager_ioredis_yet_1.redisStore)({
                                host: redisHost,
                                port: redisPort,
                                password: redisPassword || undefined,
                                ttl: 300,
                            }),
                        };
                    }
                    return {
                        ttl: 300,
                        max: 100,
                    };
                },
                inject: [config_1.ConfigService],
            }),
        ],
        providers: [cache_service_1.CacheService],
        exports: [cache_manager_1.CacheModule, cache_service_1.CacheService],
    })
], CacheModule);
//# sourceMappingURL=cache.module.js.map