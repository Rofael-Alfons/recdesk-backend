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
exports.UploadController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const upload_service_1 = require("./upload.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const subscription_guard_1 = require("../billing/guards/subscription.guard");
let UploadController = class UploadController {
    uploadService;
    constructor(uploadService) {
        this.uploadService = uploadService;
    }
    async uploadCVs(files, jobId, user) {
        return this.uploadService.uploadBulkCVs(files, user.companyId, jobId);
    }
};
exports.UploadController = UploadController;
__decorate([
    (0, common_1.Post)('cvs'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, common_1.UseGuards)(subscription_guard_1.SubscriptionGuard),
    (0, subscription_guard_1.UsageCheck)(client_1.UsageType.CV_PROCESSED),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 200, {
        limits: {
            fileSize: 10 * 1024 * 1024,
        },
    })),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk upload CVs' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                    description: 'CV files (PDF, DOCX). Max 200 files, 10MB each.',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'CVs uploaded and processed' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid files or parameters' }),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, common_1.Query)('jobId', new common_1.ParseUUIDPipe({ optional: true }))),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object, Object]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadCVs", null);
exports.UploadController = UploadController = __decorate([
    (0, swagger_1.ApiTags)('Upload'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('upload'),
    __metadata("design:paramtypes", [upload_service_1.UploadService])
], UploadController);
//# sourceMappingURL=upload.controller.js.map