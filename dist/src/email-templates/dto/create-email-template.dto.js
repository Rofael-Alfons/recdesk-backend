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
exports.CreateEmailTemplateDto = exports.EmailTemplateType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var EmailTemplateType;
(function (EmailTemplateType) {
    EmailTemplateType["REJECTION"] = "REJECTION";
    EmailTemplateType["INTERVIEW_INVITE"] = "INTERVIEW_INVITE";
    EmailTemplateType["OFFER"] = "OFFER";
    EmailTemplateType["FOLLOW_UP"] = "FOLLOW_UP";
    EmailTemplateType["CUSTOM"] = "CUSTOM";
})(EmailTemplateType || (exports.EmailTemplateType = EmailTemplateType = {}));
class CreateEmailTemplateDto {
    name;
    subject;
    body;
    type;
    isDefault;
}
exports.CreateEmailTemplateDto = CreateEmailTemplateDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Template name',
        example: 'Professional Rejection',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateEmailTemplateDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Email subject line',
        example: 'Update on your application for {{job_title}}',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateEmailTemplateDto.prototype, "subject", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Email body with personalization tokens',
        example: 'Dear {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position...',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    __metadata("design:type", String)
], CreateEmailTemplateDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Template type',
        enum: EmailTemplateType,
        example: EmailTemplateType.REJECTION,
    }),
    (0, class_validator_1.IsEnum)(EmailTemplateType),
    __metadata("design:type", String)
], CreateEmailTemplateDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Set as default template for this type',
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateEmailTemplateDto.prototype, "isDefault", void 0);
//# sourceMappingURL=create-email-template.dto.js.map