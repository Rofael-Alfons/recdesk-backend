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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../common/decorators/public.decorator");
const prisma_health_1 = require("./prisma.health");
const redis_health_1 = require("./redis.health");
let HealthController = class HealthController {
    health;
    db;
    redis;
    memory;
    disk;
    constructor(health, db, redis, memory, disk) {
        this.health = health;
        this.db = db;
        this.redis = redis;
        this.memory = memory;
        this.disk = disk;
    }
    check() {
        return this.health.check([
            () => this.db.isHealthy('database'),
            () => this.redis.isHealthy('redis'),
            () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
        ]);
    }
    liveness() {
        return this.health.check([]);
    }
    readiness() {
        return this.health.check([
            () => this.db.isHealthy('database'),
            () => this.redis.isHealthy('redis'),
        ]);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, public_decorator_1.Public)(),
    (0, terminus_1.HealthCheck)(),
    (0, swagger_1.ApiOperation)({ summary: 'Overall health check' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('live'),
    (0, public_decorator_1.Public)(),
    (0, terminus_1.HealthCheck)(),
    (0, swagger_1.ApiOperation)({ summary: 'Liveness probe - is the service running?' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "liveness", null);
__decorate([
    (0, common_1.Get)('ready'),
    (0, public_decorator_1.Public)(),
    (0, terminus_1.HealthCheck)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Readiness probe - is the service ready to accept traffic?',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "readiness", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('Health'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        prisma_health_1.PrismaHealthIndicator,
        redis_health_1.RedisHealthIndicator,
        terminus_1.MemoryHealthIndicator,
        terminus_1.DiskHealthIndicator])
], HealthController);
//# sourceMappingURL=health.controller.js.map