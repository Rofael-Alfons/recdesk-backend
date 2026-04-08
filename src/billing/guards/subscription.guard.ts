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
  ) { }

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
      const subscription = await this.billingService.getSubscription(user.companyId);

      if (!subscription) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Subscription Required',
          message: 'No active subscription found. Please subscribe to a plan to continue.',
        });
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
