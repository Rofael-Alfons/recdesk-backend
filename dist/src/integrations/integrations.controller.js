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
exports.IntegrationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const integrations_service_1 = require("./integrations.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const config_1 = require("@nestjs/config");
const update_connection_dto_1 = require("./dto/update-connection.dto");
let IntegrationsController = class IntegrationsController {
    integrationsService;
    configService;
    constructor(integrationsService, configService) {
        this.integrationsService = integrationsService;
        this.configService = configService;
    }
    async getConnections(user) {
        return this.integrationsService.getEmailConnections(user.companyId);
    }
    async connectGmail(user) {
        return this.integrationsService.getGmailAuthUrl(user.companyId, user.id);
    }
    async gmailCallback(code, state, error, res) {
        const frontendUrl = this.configService.get('frontend.url') || 'http://localhost:3000';
        if (error) {
            return res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
            return res.redirect(`${frontendUrl}/integrations?error=missing_params`);
        }
        try {
            const result = await this.integrationsService.handleGmailCallback(code, state);
            return res.redirect(`${frontendUrl}/integrations?success=true&email=${encodeURIComponent(result.email)}`);
        }
        catch (err) {
            console.error('Gmail callback error:', err);
            return res.redirect(`${frontendUrl}/integrations?error=connection_failed`);
        }
    }
    async updateConnection(id, updateDto, user) {
        return this.integrationsService.updateConnection(id, user.companyId, updateDto);
    }
    async disconnect(id, user) {
        return this.integrationsService.disconnectEmail(id, user.companyId);
    }
};
exports.IntegrationsController = IntegrationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all email connections' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email connections retrieved' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "getConnections", null);
__decorate([
    (0, common_1.Get)('gmail/connect'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Get Gmail OAuth URL' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OAuth URL generated' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "connectGmail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('gmail/callback'),
    (0, swagger_1.ApiOperation)({ summary: 'Handle Gmail OAuth callback' }),
    (0, swagger_1.ApiResponse)({ status: 302, description: 'Redirects to frontend' }),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('error')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "gmailCallback", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Update email connection settings' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Connection updated' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Connection not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_connection_dto_1.UpdateConnectionDto, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "updateConnection", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect email integration' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email disconnected' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Connection not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "disconnect", null);
exports.IntegrationsController = IntegrationsController = __decorate([
    (0, swagger_1.ApiTags)('Integrations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [integrations_service_1.IntegrationsService,
        config_1.ConfigService])
], IntegrationsController);
//# sourceMappingURL=integrations.controller.js.map