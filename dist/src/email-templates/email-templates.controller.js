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
exports.EmailTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const email_templates_service_1 = require("./email-templates.service");
const dto_1 = require("./dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let EmailTemplatesController = class EmailTemplatesController {
    emailTemplatesService;
    constructor(emailTemplatesService) {
        this.emailTemplatesService = emailTemplatesService;
    }
    async create(dto, user) {
        return this.emailTemplatesService.create(dto, user.companyId);
    }
    async findAll(query, user) {
        return this.emailTemplatesService.findAll(query, user.companyId);
    }
    async getTokens() {
        return this.emailTemplatesService.getAvailableTokens();
    }
    async findOne(id, user) {
        return this.emailTemplatesService.findOne(id, user.companyId);
    }
    async update(id, dto, user) {
        return this.emailTemplatesService.update(id, dto, user.companyId);
    }
    async remove(id, user) {
        return this.emailTemplatesService.remove(id, user.companyId);
    }
    async seedDefaults(user) {
        return this.emailTemplatesService.seedDefaults(user.companyId);
    }
};
exports.EmailTemplatesController = EmailTemplatesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new email template' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Email template created successfully',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateEmailTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all email templates' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email templates list retrieved' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.QueryEmailTemplatesDto, Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('tokens'),
    (0, swagger_1.ApiOperation)({ summary: 'Get available personalization tokens' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Available tokens retrieved' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "getTokens", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get email template by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email template retrieved' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Email template not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Update email template by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email template updated' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Email template not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateEmailTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Delete email template by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email template deleted' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Email template not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('seed-defaults'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Seed default email templates for your company' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Default templates seeded' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EmailTemplatesController.prototype, "seedDefaults", null);
exports.EmailTemplatesController = EmailTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('Email Templates'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('email-templates'),
    __metadata("design:paramtypes", [email_templates_service_1.EmailTemplatesService])
], EmailTemplatesController);
//# sourceMappingURL=email-templates.controller.js.map