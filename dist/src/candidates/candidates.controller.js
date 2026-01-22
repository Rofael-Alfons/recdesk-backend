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
exports.CandidatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const candidates_service_1 = require("./candidates.service");
const dto_1 = require("./dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let CandidatesController = class CandidatesController {
    candidatesService;
    constructor(candidatesService) {
        this.candidatesService = candidatesService;
    }
    async create(dto, user) {
        return this.candidatesService.create(dto, user.companyId);
    }
    async findAll(query, user) {
        return this.candidatesService.findAll(user.companyId, query);
    }
    async getStats(user) {
        return this.candidatesService.getStats(user.companyId);
    }
    async bulkUpdateStatus(dto, user) {
        return this.candidatesService.bulkUpdateStatus(dto, user.companyId, user.id);
    }
    async bulkAddTags(dto, user) {
        return this.candidatesService.bulkAddTags(dto, user.companyId);
    }
    async bulkAssignJob(dto, user) {
        return this.candidatesService.bulkAssignJob(dto, user.companyId, user.id);
    }
    async findOne(id, user) {
        return this.candidatesService.findOne(id, user.companyId);
    }
    async update(id, dto, user) {
        return this.candidatesService.update(id, dto, user.companyId);
    }
    async remove(id, user) {
        return this.candidatesService.remove(id, user.companyId);
    }
    async addNote(id, content, user) {
        return this.candidatesService.addNote(id, content, user.companyId, user.id);
    }
};
exports.CandidatesController = CandidatesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new candidate' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Candidate created successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateCandidateDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all candidates' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidates list retrieved' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.QueryCandidatesDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get candidate statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Statistics retrieved' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "getStats", null);
__decorate([
    (0, common_1.Post)('bulk/status'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk update candidate status' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidates updated' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.BulkUpdateStatusDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "bulkUpdateStatus", null);
__decorate([
    (0, common_1.Post)('bulk/tags'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk add tags to candidates' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Tags added' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.BulkAddTagsDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "bulkAddTags", null);
__decorate([
    (0, common_1.Post)('bulk/assign-job'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk assign candidates to job' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidates assigned' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.BulkAssignJobDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "bulkAssignJob", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get candidate by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidate details retrieved' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Candidate not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Update candidate by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidate updated' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Candidate not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateCandidateDto, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Delete candidate by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Candidate deleted' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Candidate not found' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/notes'),
    (0, swagger_1.ApiOperation)({ summary: 'Add note to candidate' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Note added' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('content')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], CandidatesController.prototype, "addNote", null);
exports.CandidatesController = CandidatesController = __decorate([
    (0, swagger_1.ApiTags)('Candidates'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('candidates'),
    __metadata("design:paramtypes", [candidates_service_1.CandidatesService])
], CandidatesController);
//# sourceMappingURL=candidates.controller.js.map