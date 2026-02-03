import { Throttle } from '@nestjs/throttler';

/**
 * Stricter rate limiting for authentication endpoints to prevent brute force attacks.
 * Still allows normal usage with typos and retries.
 */
export const ThrottleAuth = () =>
  Throttle({
    short: { limit: 10, ttl: 60000 }, // 10 attempts per minute
    medium: { limit: 30, ttl: 300000 }, // 30 attempts per 5 minutes
    long: { limit: 60, ttl: 3600000 }, // 60 attempts per hour
  });

/**
 * Stricter rate limiting for registration to prevent spam accounts.
 */
export const ThrottleRegistration = () =>
  Throttle({
    short: { limit: 5, ttl: 60000 }, // 5 attempts per minute
    medium: { limit: 10, ttl: 300000 }, // 10 attempts per 5 minutes
    long: { limit: 20, ttl: 3600000 }, // 20 attempts per hour
  });
