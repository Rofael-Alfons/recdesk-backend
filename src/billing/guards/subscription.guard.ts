import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../billing.service';
import { UsageType } from '@prisma/client';

export const USAGE_TYPE_KEY = 'usageType';
export const UsageCheck = (type: UsageType) => (target: any, key: string, descriptor: PropertyDescriptor) => {
  Reflect.defineMetadata(USAGE_TYPE_KEY, type, descriptor.value);
  return descriptor;
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const usageType = this.reflector.get<UsageType>(
      USAGE_TYPE_KEY,
      context.getHandler(),
    );

    // If no usage type specified, allow the request
    if (!usageType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.companyId) {
      return true; // Let the auth guard handle this
    }

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

    return true;
  }
}
