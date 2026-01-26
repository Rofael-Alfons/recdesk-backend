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
exports.SendEmailDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SendEmailDto {
    candidateId;
    templateId;
    subjectOverride;
}
exports.SendEmailDto = SendEmailDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Candidate ID to send email to' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "candidateId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email template ID to use' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "templateId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Override subject line (optional)' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "subjectOverride", void 0);
//# sourceMappingURL=send-email.dto.js.map