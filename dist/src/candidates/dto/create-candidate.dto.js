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
exports.CreateCandidateDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateCandidateDto {
    fullName;
    email;
    phone;
    location;
    linkedinUrl;
    githubUrl;
    portfolioUrl;
    source;
    status;
    jobId;
    tags;
}
exports.CreateCandidateDto = CreateCandidateDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'John Doe' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'john.doe@example.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '+201234567890' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Cairo, Egypt' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://linkedin.com/in/johndoe' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "linkedinUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://github.com/johndoe' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "githubUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://johndoe.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "portfolioUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.CandidateSource, default: client_1.CandidateSource.MANUAL }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.CandidateSource),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.CandidateStatus, default: client_1.CandidateStatus.NEW }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.CandidateStatus),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Job ID to assign candidate to' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateCandidateDto.prototype, "jobId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['javascript', 'react'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateCandidateDto.prototype, "tags", void 0);
//# sourceMappingURL=create-candidate.dto.js.map