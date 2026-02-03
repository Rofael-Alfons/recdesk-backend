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
exports.BulkSendEmailDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class BulkSendEmailDto {
    candidateIds;
    templateId;
    subjectOverride;
}
exports.BulkSendEmailDto = BulkSendEmailDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Array of candidate IDs to send emails to',
        type: [String],
        example: ['uuid-1', 'uuid-2', 'uuid-3'],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    __metadata("design:type", Array)
], BulkSendEmailDto.prototype, "candidateIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Email template ID to use' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkSendEmailDto.prototype, "templateId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Override subject line for all emails (optional)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], BulkSendEmailDto.prototype, "subjectOverride", void 0);
//# sourceMappingURL=bulk-send-email.dto.js.map