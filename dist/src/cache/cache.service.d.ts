import { Cache } from '@nestjs/cache-manager';
export declare const CACHE_KEYS: {
    readonly SUBSCRIPTION: "subscription:";
    readonly SUBSCRIPTION_PLAN: "subscription_plan:";
    readonly JOB_REQUIREMENTS: "job_requirements:";
    readonly COMPANY_SETTINGS: "company:";
};
export declare const CACHE_TTLS: {
    readonly SUBSCRIPTION: 300;
    readonly SUBSCRIPTION_PLAN: 3600;
    readonly JOB_REQUIREMENTS: 600;
    readonly COMPANY_SETTINGS: 300;
};
export declare class CacheService {
    private cacheManager;
    private readonly logger;
    constructor(cacheManager: Cache);
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
    getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
    getSubscription(companyId: string): Promise<any | undefined>;
    setSubscription(companyId: string, subscription: any): Promise<void>;
    invalidateSubscription(companyId: string): Promise<void>;
    getSubscriptionPlan(planId: string): Promise<any | undefined>;
    setSubscriptionPlan(planId: string, plan: any): Promise<void>;
    getJobRequirements(jobId: string): Promise<any | undefined>;
    setJobRequirements(jobId: string, requirements: any): Promise<void>;
    invalidateJobRequirements(jobId: string): Promise<void>;
    getCompanySettings(companyId: string): Promise<any | undefined>;
    setCompanySettings(companyId: string, settings: any): Promise<void>;
    invalidateCompanySettings(companyId: string): Promise<void>;
}
