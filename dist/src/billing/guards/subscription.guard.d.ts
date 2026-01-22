import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../billing.service';
import { UsageType } from '@prisma/client';
export declare const USAGE_TYPE_KEY = "usageType";
export declare const UsageCheck: (type: UsageType) => (target: any, key: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare class SubscriptionGuard implements CanActivate {
    private reflector;
    private billingService;
    constructor(reflector: Reflector, billingService: BillingService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
