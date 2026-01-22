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
exports.CompaniesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const companies_service_1 = require("./companies.service");
const dto_1 = require("./dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let CompaniesController = class CompaniesController {
    companiesService;
    constructor(companiesService) {
        this.companiesService = companiesService;
    }
    async getCurrentCompany(user) {
        return this.companiesService.findOne(user.companyId, user.id);
    }
    async getCurrentCompanyStats(user) {
        return this.companiesService.getStats(user.companyId, user.id);
    }
    async updateCurrentCompany(dto, user) {
        return this.companiesService.update(user.companyId, dto, user.id, user.role);
    }
    async findOne(id, user) {
        return this.companiesService.findOne(id, user.id);
    }
    async getStats(id, user) {
        return this.companiesService.getStats(id, user.id);
    }
    async update(id, dto, user) {
        return this.companiesService.update(id, dto, user.id, user.role);
    }
};
exports.CompaniesController = CompaniesController;
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user company details' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company details retrieved' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "getCurrentCompany", null);
__decorate([
    (0, common_1.Get)('me/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current company statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company statistics retrieved' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "getCurrentCompanyStats", null);
__decorate([
    (0, common_1.Patch)('me'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Update current user company' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company updated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Only admins can update company' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.UpdateCompanyDto, Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "updateCurrentCompany", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get company by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company details retrieved' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Can only view your own company' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Company not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get company statistics by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company statistics retrieved' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Can only view your own company stats' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "getStats", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Update company by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Company updated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Only admins can update company' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Company not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateCompanyDto, Object]),
    __metadata("design:returntype", Promise)
], CompaniesController.prototype, "update", null);
exports.CompaniesController = CompaniesController = __decorate([
    (0, swagger_1.ApiTags)('Companies'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('companies'),
    __metadata("design:paramtypes", [companies_service_1.CompaniesService])
], CompaniesController);
//# sourceMappingURL=companies.controller.js.map