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
var BillingScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const billing_service_1 = require("./billing.service");
let BillingScheduler = BillingScheduler_1 = class BillingScheduler {
    billingService;
    logger = new common_1.Logger(BillingScheduler_1.name);
    constructor(billingService) {
        this.billingService = billingService;
    }
    async checkExpiredSubscriptions() {
        this.logger.log('Starting daily subscription expiration check...');
        try {
            const result = await this.billingService.checkAndExpireSubscriptions();
            this.logger.log(`Subscription expiration check completed: ${result.expired} expired, ${result.notified} notified`);
        }
        catch (error) {
            this.logger.error('Error during subscription expiration check:', error);
        }
    }
    async sendTrialExpirationWarnings() {
        this.logger.log('Starting trial expiration warning check...');
        try {
            const result = await this.billingService.sendTrialWarnings();
            this.logger.log(`Trial warning check completed: ${result.notified} notifications sent`);
        }
        catch (error) {
            this.logger.error('Error during trial warning check:', error);
        }
    }
    async checkGracePeriods() {
        this.logger.log('Starting grace period check...');
        try {
            const result = await this.billingService.checkGracePeriods();
            this.logger.log(`Grace period check completed: ${result.expired} grace periods expired`);
        }
        catch (error) {
            this.logger.error('Error during grace period check:', error);
        }
    }
    async seedSubscriptionPlans() {
        this.logger.log('Seeding subscription plans...');
        try {
            await this.billingService.seedPlans();
            this.logger.log('Subscription plans seeded successfully');
        }
        catch (error) {
            this.logger.error('Error seeding subscription plans:', error);
        }
    }
};
exports.BillingScheduler = BillingScheduler;
__decorate([
    (0, schedule_1.Cron)('0 1 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BillingScheduler.prototype, "checkExpiredSubscriptions", null);
__decorate([
    (0, schedule_1.Cron)('0 9 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BillingScheduler.prototype, "sendTrialExpirationWarnings", null);
__decorate([
    (0, schedule_1.Cron)('0 2 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BillingScheduler.prototype, "checkGracePeriods", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_WEEK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BillingScheduler.prototype, "seedSubscriptionPlans", null);
exports.BillingScheduler = BillingScheduler = BillingScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [billing_service_1.BillingService])
], BillingScheduler);
//# sourceMappingURL=billing.scheduler.js.map