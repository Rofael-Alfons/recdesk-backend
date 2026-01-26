import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../billing.service';
import { UsageType, SubscriptionStatus } from '@prisma/client';

export const USAGE_TYPE_KEY = 'usageType';
export const UsageCheck = (type: UsageType) => (target: any, key: string, descriptor: PropertyDescriptor) => {
  Reflect.defineMetadata(USAGE_TYPE_KEY, type, descriptor.value);
  return descriptor;
};

// Decorator to skip subscription status check (only check usage limits)
export const SKIP_STATUS_CHECK_KEY = 'skipStatusCheck';
export const SkipSubscriptionStatusCheck = () => (target: any, key: string, descriptor: PropertyDescriptor) => {
  Reflect.defineMetadata(SKIP_STATUS_CHECK_KEY, true, descriptor.value);
  return descriptor;
};

// Subscription statuses that indicate an inactive subscription
const INACTIVE_STATUSES: SubscriptionStatus[] = [
  'CANCELED',
  'UNPAID',
  'INCOMPLETE_EXPIRED',
  'EXPIRED',
];

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.companyId) {
      return true; // Let the auth guard handle this
    }

    const skipStatusCheck = this.reflector.get<boolean>(
      SKIP_STATUS_CHECK_KEY,
      context.getHandler(),
    );

    // Check subscription status unless explicitly skipped
    if (!skipStatusCheck) {
      let subscription = await this.billingService.getSubscription(user.companyId);

      // No subscription found - auto-create a trial subscription
      if (!subscription) {
        try {
          await this.billingService.createTrialSubscription(user.companyId);
          subscription = await this.billingService.getSubscription(user.companyId);
        } catch (error) {
          // If we can't create a trial, allow the request with default limits
          // This ensures the system doesn't break during initial setup
          return true;
        }
      }

      // If still no subscription after trying to create one, allow with default limits
      if (!subscription) {
        return true;
      }

      // Check if subscription status is inactive
      if (INACTIVE_STATUSES.includes(subscription.status as SubscriptionStatus)) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Subscription Inactive',
          message: `Your subscription is ${subscription.status.toLowerCase()}. Please update your subscription to continue.`,
        });
      }

      // Check if subscription has expired (period end has passed)
      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);
      if (periodEnd < now) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Subscription Expired',
          message: 'Your subscription period has expired. Please renew your subscription.',
        });
      }

      // Check if trial has expired
      if (subscription.status === 'TRIALING' && subscription.trialEndsAt) {
        const trialEnd = new Date(subscription.trialEndsAt);
        if (trialEnd < now) {
          throw new ForbiddenException({
            statusCode: 403,
            error: 'Trial Expired',
            message: 'Your free trial has expired. Please upgrade to a paid plan to continue.',
          });
        }
      }
    }

    // Check usage limits if a usage type is specified
    const usageType = this.reflector.get<UsageType>(
      USAGE_TYPE_KEY,
      context.getHandler(),
    );

    if (usageType) {
      const result = await this.billingService.checkLimit(user.companyId, usageType);

      if (!result.allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Usage Limit Exceeded',
          message: result.message,
          usageInfo: {
            current: result.current,
            limit: result.limit,
          },
        });
      }
    }

    return true;
  }
}
