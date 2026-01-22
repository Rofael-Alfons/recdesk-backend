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
exports.CreateJobDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateJobDto {
    title;
    description;
    status;
    experienceLevel;
    requiredSkills;
    preferredSkills;
    requirements;
}
exports.CreateJobDto = CreateJobDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Senior Backend Developer' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateJobDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'We are looking for an experienced backend developer...' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(10000),
    __metadata("design:type", String)
], CreateJobDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.JobStatus, default: client_1.JobStatus.DRAFT }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.JobStatus),
    __metadata("design:type", String)
], CreateJobDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.ExperienceLevel, default: client_1.ExperienceLevel.JUNIOR }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ExperienceLevel),
    __metadata("design:type", String)
], CreateJobDto.prototype, "experienceLevel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: ['Node.js', 'TypeScript', 'PostgreSQL'],
        description: 'Required skills for the position'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateJobDto.prototype, "requiredSkills", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: ['Docker', 'AWS', 'GraphQL'],
        description: 'Nice-to-have skills'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateJobDto.prototype, "preferredSkills", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: { yearsOfExperience: 5, education: 'Bachelor in CS', languages: ['English'] },
        description: 'Additional requirements as JSON'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateJobDto.prototype, "requirements", void 0);
//# sourceMappingURL=create-job.dto.js.map