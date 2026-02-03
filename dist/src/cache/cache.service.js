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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = exports.CACHE_TTLS = exports.CACHE_KEYS = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
exports.CACHE_KEYS = {
    SUBSCRIPTION: 'subscription:',
    SUBSCRIPTION_PLAN: 'subscription_plan:',
    JOB_REQUIREMENTS: 'job_requirements:',
    COMPANY_SETTINGS: 'company:',
};
exports.CACHE_TTLS = {
    SUBSCRIPTION: 300,
    SUBSCRIPTION_PLAN: 3600,
    JOB_REQUIREMENTS: 600,
    COMPANY_SETTINGS: 300,
};
let CacheService = CacheService_1 = class CacheService {
    cacheManager;
    logger = new common_1.Logger(CacheService_1.name);
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
    }
    async get(key) {
        try {
            return await this.cacheManager.get(key);
        }
        catch (error) {
            this.logger.warn(`Cache get failed for key ${key}: ${error.message}`);
            return undefined;
        }
    }
    async set(key, value, ttl) {
        try {
            await this.cacheManager.set(key, value, ttl);
        }
        catch (error) {
            this.logger.warn(`Cache set failed for key ${key}: ${error.message}`);
        }
    }
    async del(key) {
        try {
            await this.cacheManager.del(key);
        }
        catch (error) {
            this.logger.warn(`Cache delete failed for key ${key}: ${error.message}`);
        }
    }
    async getOrSet(key, factory, ttl) {
        const cached = await this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const value = await factory();
        await this.set(key, value, ttl);
        return value;
    }
    async getSubscription(companyId) {
        return this.get(`${exports.CACHE_KEYS.SUBSCRIPTION}${companyId}`);
    }
    async setSubscription(companyId, subscription) {
        await this.set(`${exports.CACHE_KEYS.SUBSCRIPTION}${companyId}`, subscription, exports.CACHE_TTLS.SUBSCRIPTION);
    }
    async invalidateSubscription(companyId) {
        await this.del(`${exports.CACHE_KEYS.SUBSCRIPTION}${companyId}`);
    }
    async getSubscriptionPlan(planId) {
        return this.get(`${exports.CACHE_KEYS.SUBSCRIPTION_PLAN}${planId}`);
    }
    async setSubscriptionPlan(planId, plan) {
        await this.set(`${exports.CACHE_KEYS.SUBSCRIPTION_PLAN}${planId}`, plan, exports.CACHE_TTLS.SUBSCRIPTION_PLAN);
    }
    async getJobRequirements(jobId) {
        return this.get(`${exports.CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`);
    }
    async setJobRequirements(jobId, requirements) {
        await this.set(`${exports.CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`, requirements, exports.CACHE_TTLS.JOB_REQUIREMENTS);
    }
    async invalidateJobRequirements(jobId) {
        await this.del(`${exports.CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`);
    }
    async getCompanySettings(companyId) {
        return this.get(`${exports.CACHE_KEYS.COMPANY_SETTINGS}${companyId}`);
    }
    async setCompanySettings(companyId, settings) {
        await this.set(`${exports.CACHE_KEYS.COMPANY_SETTINGS}${companyId}`, settings, exports.CACHE_TTLS.COMPANY_SETTINGS);
    }
    async invalidateCompanySettings(companyId) {
        await this.del(`${exports.CACHE_KEYS.COMPANY_SETTINGS}${companyId}`);
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [cache_manager_1.Cache])
], CacheService);
//# sourceMappingURL=cache.service.js.map