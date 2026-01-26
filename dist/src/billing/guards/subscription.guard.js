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
exports.SubscriptionGuard = exports.SkipSubscriptionStatusCheck = exports.SKIP_STATUS_CHECK_KEY = exports.UsageCheck = exports.USAGE_TYPE_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const billing_service_1 = require("../billing.service");
exports.USAGE_TYPE_KEY = 'usageType';
const UsageCheck = (type) => (target, key, descriptor) => {
    Reflect.defineMetadata(exports.USAGE_TYPE_KEY, type, descriptor.value);
    return descriptor;
};
exports.UsageCheck = UsageCheck;
exports.SKIP_STATUS_CHECK_KEY = 'skipStatusCheck';
const SkipSubscriptionStatusCheck = () => (target, key, descriptor) => {
    Reflect.defineMetadata(exports.SKIP_STATUS_CHECK_KEY, true, descriptor.value);
    return descriptor;
};
exports.SkipSubscriptionStatusCheck = SkipSubscriptionStatusCheck;
const INACTIVE_STATUSES = [
    'CANCELED',
    'UNPAID',
    'INCOMPLETE_EXPIRED',
    'EXPIRED',
];
let SubscriptionGuard = class SubscriptionGuard {
    reflector;
    billingService;
    constructor(reflector, billingService) {
        this.reflector = reflector;
        this.billingService = billingService;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user?.companyId) {
            return true;
        }
        const skipStatusCheck = this.reflector.get(exports.SKIP_STATUS_CHECK_KEY, context.getHandler());
        if (!skipStatusCheck) {
            let subscription = await this.billingService.getSubscription(user.companyId);
            if (!subscription) {
                try {
                    await this.billingService.createTrialSubscription(user.companyId);
                    subscription = await this.billingService.getSubscription(user.companyId);
                }
                catch (error) {
                    return true;
                }
            }
            if (!subscription) {
                return true;
            }
            if (INACTIVE_STATUSES.includes(subscription.status)) {
                throw new common_1.ForbiddenException({
                    statusCode: 403,
                    error: 'Subscription Inactive',
                    message: `Your subscription is ${subscription.status.toLowerCase()}. Please update your subscription to continue.`,
                });
            }
            const now = new Date();
            const periodEnd = new Date(subscription.currentPeriodEnd);
            if (periodEnd < now) {
                throw new common_1.ForbiddenException({
                    statusCode: 403,
                    error: 'Subscription Expired',
                    message: 'Your subscription period has expired. Please renew your subscription.',
                });
            }
            if (subscription.status === 'TRIALING' && subscription.trialEndsAt) {
                const trialEnd = new Date(subscription.trialEndsAt);
                if (trialEnd < now) {
                    throw new common_1.ForbiddenException({
                        statusCode: 403,
                        error: 'Trial Expired',
                        message: 'Your free trial has expired. Please upgrade to a paid plan to continue.',
                    });
                }
            }
        }
        const usageType = this.reflector.get(exports.USAGE_TYPE_KEY, context.getHandler());
        if (usageType) {
            const result = await this.billingService.checkLimit(user.companyId, usageType);
            if (!result.allowed) {
                throw new common_1.ForbiddenException({
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
};
exports.SubscriptionGuard = SubscriptionGuard;
exports.SubscriptionGuard = SubscriptionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        billing_service_1.BillingService])
], SubscriptionGuard);
//# sourceMappingURL=subscription.guard.js.map