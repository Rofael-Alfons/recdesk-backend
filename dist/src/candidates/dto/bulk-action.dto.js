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
exports.BulkAssignJobDto = exports.BulkAddTagsDto = exports.BulkUpdateStatusDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class BulkUpdateStatusDto {
    candidateIds;
    status;
}
exports.BulkUpdateStatusDto = BulkUpdateStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of candidate IDs' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    __metadata("design:type", Array)
], BulkUpdateStatusDto.prototype, "candidateIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.CandidateStatus }),
    (0, class_validator_1.IsEnum)(client_1.CandidateStatus),
    __metadata("design:type", String)
], BulkUpdateStatusDto.prototype, "status", void 0);
class BulkAddTagsDto {
    candidateIds;
    tags;
}
exports.BulkAddTagsDto = BulkAddTagsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of candidate IDs' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    __metadata("design:type", Array)
], BulkAddTagsDto.prototype, "candidateIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['top-talent', 'urgent'] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    __metadata("design:type", Array)
], BulkAddTagsDto.prototype, "tags", void 0);
class BulkAssignJobDto {
    candidateIds;
    jobId;
}
exports.BulkAssignJobDto = BulkAssignJobDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of candidate IDs' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    __metadata("design:type", Array)
], BulkAssignJobDto.prototype, "candidateIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Job ID to assign candidates to' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkAssignJobDto.prototype, "jobId", void 0);
//# sourceMappingURL=bulk-action.dto.js.map