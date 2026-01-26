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
var ScoringProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScoringProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ai_service_1 = require("../../ai/ai.service");
const queue_constants_1 = require("../queue.constants");
let ScoringProcessor = ScoringProcessor_1 = class ScoringProcessor {
    prisma;
    aiService;
    logger = new common_1.Logger(ScoringProcessor_1.name);
    constructor(prisma, aiService) {
        this.prisma = prisma;
        this.aiService = aiService;
    }
    async scoreCandidate(job) {
        const { candidateId, jobId } = job.data;
        this.logger.log(`Scoring candidate ${candidateId} for job ${jobId}`);
        try {
            const candidate = await this.prisma.candidate.findUnique({
                where: { id: candidateId },
            });
            if (!candidate) {
                throw new Error(`Candidate ${candidateId} not found`);
            }
            const targetJob = await this.prisma.job.findUnique({
                where: { id: jobId },
            });
            if (!targetJob) {
                throw new Error(`Job ${jobId} not found`);
            }
            const parsedData = {
                personalInfo: {
                    fullName: candidate.fullName,
                    email: candidate.email,
                    phone: candidate.phone,
                    location: candidate.location,
                    linkedinUrl: candidate.linkedinUrl,
                    githubUrl: candidate.githubUrl,
                    portfolioUrl: candidate.portfolioUrl,
                },
                education: candidate.education || [],
                experience: candidate.experience || [],
                skills: candidate.skills || [],
                projects: candidate.projects || [],
                certifications: candidate.certifications || [],
                languages: candidate.languages || [],
                summary: null,
            };
            const requirements = {
                title: targetJob.title,
                requiredSkills: targetJob.requiredSkills,
                preferredSkills: targetJob.preferredSkills,
                experienceLevel: targetJob.experienceLevel,
                requirements: targetJob.requirements || {},
            };
            const scoreResult = await this.aiService.scoreCandidate(parsedData, requirements);
            await this.prisma.candidateScore.upsert({
                where: {
                    candidateId_jobId: {
                        candidateId,
                        jobId,
                    },
                },
                update: {
                    overallScore: scoreResult.overallScore,
                    skillsMatchScore: scoreResult.skillsMatchScore,
                    experienceScore: scoreResult.experienceScore,
                    educationScore: scoreResult.educationScore,
                    growthScore: scoreResult.growthScore,
                    bonusScore: scoreResult.bonusScore,
                    scoreExplanation: scoreResult.scoreExplanation || undefined,
                    recommendation: scoreResult.recommendation,
                    scoredAt: new Date(),
                },
                create: {
                    candidateId,
                    jobId,
                    overallScore: scoreResult.overallScore,
                    skillsMatchScore: scoreResult.skillsMatchScore,
                    experienceScore: scoreResult.experienceScore,
                    educationScore: scoreResult.educationScore,
                    growthScore: scoreResult.growthScore,
                    bonusScore: scoreResult.bonusScore,
                    scoreExplanation: scoreResult.scoreExplanation || undefined,
                    recommendation: scoreResult.recommendation,
                },
            });
            if (candidate.jobId === jobId) {
                await this.prisma.candidate.update({
                    where: { id: candidateId },
                    data: {
                        overallScore: scoreResult.overallScore,
                        scoreBreakdown: scoreResult.scoreExplanation || undefined,
                    },
                });
            }
            return {
                success: true,
                candidateId,
                jobId,
                score: scoreResult.overallScore,
            };
        }
        catch (error) {
            this.logger.error(`Failed to score candidate ${candidateId} for job ${jobId}:`, error);
            throw error;
        }
    }
    onCompleted(job, result) {
        this.logger.log(`Completed scoring job ${job.id}: candidate ${job.data.candidateId} scored ${result?.score}`);
    }
    onFailed(job, error) {
        this.logger.error(`Failed scoring job ${job.id} for candidate ${job.data.candidateId}: ${error.message}`);
    }
};
exports.ScoringProcessor = ScoringProcessor;
__decorate([
    (0, bull_1.Process)('score-candidate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScoringProcessor.prototype, "scoreCandidate", null);
__decorate([
    (0, bull_1.OnQueueCompleted)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ScoringProcessor.prototype, "onCompleted", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], ScoringProcessor.prototype, "onFailed", null);
exports.ScoringProcessor = ScoringProcessor = ScoringProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_NAMES.SCORING),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_service_1.AiService])
], ScoringProcessor);
//# sourceMappingURL=scoring.processor.js.map