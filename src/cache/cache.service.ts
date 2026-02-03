import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

// Cache key prefixes for different data types
export const CACHE_KEYS = {
  SUBSCRIPTION: 'subscription:',
  SUBSCRIPTION_PLAN: 'subscription_plan:',
  JOB_REQUIREMENTS: 'job_requirements:',
  COMPANY_SETTINGS: 'company:',
} as const;

// Cache TTLs in seconds
export const CACHE_TTLS = {
  SUBSCRIPTION: 300, // 5 minutes - subscription data changes rarely
  SUBSCRIPTION_PLAN: 3600, // 1 hour - plans almost never change
  JOB_REQUIREMENTS: 600, // 10 minutes - job requirements for scoring
  COMPANY_SETTINGS: 300, // 5 minutes - company settings
} as const;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}: ${error.message}`);
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed for key ${key}: ${error.message}`);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // ============================================
  // SUBSCRIPTION CACHING
  // ============================================

  async getSubscription(companyId: string): Promise<any | undefined> {
    return this.get(`${CACHE_KEYS.SUBSCRIPTION}${companyId}`);
  }

  async setSubscription(companyId: string, subscription: any): Promise<void> {
    await this.set(
      `${CACHE_KEYS.SUBSCRIPTION}${companyId}`,
      subscription,
      CACHE_TTLS.SUBSCRIPTION,
    );
  }

  async invalidateSubscription(companyId: string): Promise<void> {
    await this.del(`${CACHE_KEYS.SUBSCRIPTION}${companyId}`);
  }

  // ============================================
  // SUBSCRIPTION PLAN CACHING
  // ============================================

  async getSubscriptionPlan(planId: string): Promise<any | undefined> {
    return this.get(`${CACHE_KEYS.SUBSCRIPTION_PLAN}${planId}`);
  }

  async setSubscriptionPlan(planId: string, plan: any): Promise<void> {
    await this.set(
      `${CACHE_KEYS.SUBSCRIPTION_PLAN}${planId}`,
      plan,
      CACHE_TTLS.SUBSCRIPTION_PLAN,
    );
  }

  // ============================================
  // JOB REQUIREMENTS CACHING
  // ============================================

  async getJobRequirements(jobId: string): Promise<any | undefined> {
    return this.get(`${CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`);
  }

  async setJobRequirements(jobId: string, requirements: any): Promise<void> {
    await this.set(
      `${CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`,
      requirements,
      CACHE_TTLS.JOB_REQUIREMENTS,
    );
  }

  async invalidateJobRequirements(jobId: string): Promise<void> {
    await this.del(`${CACHE_KEYS.JOB_REQUIREMENTS}${jobId}`);
  }

  // ============================================
  // COMPANY SETTINGS CACHING
  // ============================================

  async getCompanySettings(companyId: string): Promise<any | undefined> {
    return this.get(`${CACHE_KEYS.COMPANY_SETTINGS}${companyId}`);
  }

  async setCompanySettings(companyId: string, settings: any): Promise<void> {
    await this.set(
      `${CACHE_KEYS.COMPANY_SETTINGS}${companyId}`,
      settings,
      CACHE_TTLS.COMPANY_SETTINGS,
    );
  }

  async invalidateCompanySettings(companyId: string): Promise<void> {
    await this.del(`${CACHE_KEYS.COMPANY_SETTINGS}${companyId}`);
  }
}
