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
exports.SubscriptionGuard = exports.UsageCheck = exports.USAGE_TYPE_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const billing_service_1 = require("../billing.service");
exports.USAGE_TYPE_KEY = 'usageType';
const UsageCheck = (type) => (target, key, descriptor) => {
    Reflect.defineMetadata(exports.USAGE_TYPE_KEY, type, descriptor.value);
    return descriptor;
};
exports.UsageCheck = UsageCheck;
let SubscriptionGuard = class SubscriptionGuard {
    reflector;
    billingService;
    constructor(reflector, billingService) {
        this.reflector = reflector;
        this.billingService = billingService;
    }
    async canActivate(context) {
        const usageType = this.reflector.get(exports.USAGE_TYPE_KEY, context.getHandler());
        if (!usageType) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user?.companyId) {
            return true;
        }
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