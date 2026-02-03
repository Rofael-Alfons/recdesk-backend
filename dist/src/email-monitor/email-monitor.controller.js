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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailMonitorController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const email_monitor_service_1 = require("./email-monitor.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client");
const subscription_guard_1 = require("../billing/guards/subscription.guard");
let EmailMonitorController = class EmailMonitorController {
    emailMonitorService;
    constructor(emailMonitorService) {
        this.emailMonitorService = emailMonitorService;
    }
    async triggerSync(user) {
        const result = await this.emailMonitorService.syncAllConnectionsForCompany(user.companyId);
        return result;
    }
    async triggerSyncForConnection(connectionId, user) {
        const result = await this.emailMonitorService.pollEmailsForConnection(connectionId, user.companyId);
        return result;
    }
    async getSyncStatus(user) {
        const status = await this.emailMonitorService.getSyncStatus(user.companyId);
        return status;
    }
    async getConnectionSyncStatus(connectionId, user) {
        const status = await this.emailMonitorService.getConnectionSyncStatus(connectionId, user.companyId);
        return status;
    }
};
exports.EmailMonitorController = EmailMonitorController;
__decorate([
    (0, common_1.Post)('sync'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(subscription_guard_1.SubscriptionGuard),
    (0, subscription_guard_1.UsageCheck)(client_1.UsageType.EMAIL_IMPORTED),
    (0, swagger_1.ApiOperation)({ summary: 'Manually trigger email sync for all connections' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Sync completed successfully' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EmailMonitorController.prototype, "triggerSync", null);
__decorate([
    (0, common_1.Post)('sync/:connectionId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(subscription_guard_1.SubscriptionGuard),
    (0, subscription_guard_1.UsageCheck)(client_1.UsageType.EMAIL_IMPORTED),
    (0, swagger_1.ApiOperation)({
        summary: 'Manually trigger email sync for a specific connection',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Sync completed successfully' }),
    __param(0, (0, common_1.Param)('connectionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailMonitorController.prototype, "triggerSyncForConnection", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get sync status for all email connections' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns sync status' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EmailMonitorController.prototype, "getSyncStatus", null);
__decorate([
    (0, common_1.Get)('status/:connectionId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get sync status for a specific connection' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns connection sync status' }),
    __param(0, (0, common_1.Param)('connectionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailMonitorController.prototype, "getConnectionSyncStatus", null);
exports.EmailMonitorController = EmailMonitorController = __decorate([
    (0, swagger_1.ApiTags)('Email Integration'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('integrations/gmail'),
    __metadata("design:paramtypes", [email_monitor_service_1.EmailMonitorService])
], EmailMonitorController);
//# sourceMappingURL=email-monitor.controller.js.map