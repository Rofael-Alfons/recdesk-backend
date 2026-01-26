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
exports.EmailSendingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const email_sending_service_1 = require("./email-sending.service");
const dto_1 = require("./dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
let EmailSendingController = class EmailSendingController {
    emailSendingService;
    constructor(emailSendingService) {
        this.emailSendingService = emailSendingService;
    }
    async sendEmail(dto, user) {
        return this.emailSendingService.sendEmail(dto, user.id, user.companyId);
    }
    async bulkSendEmails(dto, user) {
        return this.emailSendingService.bulkSendEmails(dto, user.id, user.companyId);
    }
    async previewEmail(dto, user) {
        return this.emailSendingService.previewEmail(dto, user.companyId, user.id);
    }
    async getSentEmails(user, candidateId, page, limit) {
        return this.emailSendingService.getSentEmails(user.companyId, {
            candidateId,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }
};
exports.EmailSendingController = EmailSendingController;
__decorate([
    (0, common_1.Post)('send'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Send email to a single candidate' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Email sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Candidate or template not found' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Candidate has no email address' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.SendEmailDto, Object]),
    __metadata("design:returntype", Promise)
], EmailSendingController.prototype, "sendEmail", null);
__decorate([
    (0, common_1.Post)('bulk-send'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN, client_1.UserRole.RECRUITER),
    (0, swagger_1.ApiOperation)({ summary: 'Send bulk emails to multiple candidates' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Bulk emails sent' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Candidates or template not found' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.BulkSendEmailDto, Object]),
    __metadata("design:returntype", Promise)
], EmailSendingController.prototype, "bulkSendEmails", null);
__decorate([
    (0, common_1.Post)('preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Preview email with personalization' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email preview generated' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Template or candidate not found' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.PreviewEmailDto, Object]),
    __metadata("design:returntype", Promise)
], EmailSendingController.prototype, "previewEmail", null);
__decorate([
    (0, common_1.Get)('sent'),
    (0, swagger_1.ApiOperation)({ summary: 'Get sent emails history' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Sent emails retrieved' }),
    (0, swagger_1.ApiQuery)({ name: 'candidateId', required: false, description: 'Filter by candidate ID' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: 'Page number' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Items per page' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('candidateId')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], EmailSendingController.prototype, "getSentEmails", null);
exports.EmailSendingController = EmailSendingController = __decorate([
    (0, swagger_1.ApiTags)('Emails'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('emails'),
    __metadata("design:paramtypes", [email_sending_service_1.EmailSendingService])
], EmailSendingController);
//# sourceMappingURL=email-sending.controller.js.map