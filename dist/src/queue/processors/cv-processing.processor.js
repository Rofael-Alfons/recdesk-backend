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
var CvProcessingProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CvProcessingProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ai_service_1 = require("../../ai/ai.service");
const file_processing_service_1 = require("../../file-processing/file-processing.service");
const notifications_service_1 = require("../../notifications/notifications.service");
const billing_service_1 = require("../../billing/billing.service");
const queue_constants_1 = require("../queue.constants");
const client_1 = require("@prisma/client");
let CvProcessingProcessor = CvProcessingProcessor_1 = class CvProcessingProcessor {
    prisma;
    aiService;
    fileProcessingService;
    notificationsService;
    billingService;
    logger = new common_1.Logger(CvProcessingProcessor_1.name);
    constructor(prisma, aiService, fileProcessingService, notificationsService, billingService) {
        this.prisma = prisma;
        this.aiService = aiService;
        this.fileProcessingService = fileProcessingService;
        this.notificationsService = notificationsService;
        this.billingService = billingService;
    }
    async processCv(job) {
        const { candidateId, jobId } = job.data;
        this.logger.log(`Processing CV for candidate ${candidateId}`);
        try {
            const candidate = await this.prisma.candidate.findUnique({
                where: { id: candidateId },
                include: { job: true },
            });
            if (!candidate) {
                throw new Error(`Candidate ${candidateId} not found`);
            }
            let cvText = candidate.cvText;
            if (!cvText && candidate.cvFileUrl) {
                this.logger.log(`Extracting text from CV: ${candidate.cvFileName}`);
                const extractionResult = await this.fileProcessingService.extractTextFromFile(candidate.cvFileUrl);
                cvText = extractionResult.text;
                await this.prisma.candidate.update({
                    where: { id: candidateId },
                    data: {
                        cvText,
                        extractionConfidence: extractionResult.confidence,
                    },
                });
            }
            if (cvText) {
                this.logger.log(`Parsing CV with AI for candidate ${candidateId}`);
                const parsed = await this.aiService.parseCV(cvText, candidate.cvFileName || null);
                await this.billingService.trackUsage(candidate.companyId, client_1.UsageType.AI_PARSING_CALL);
                await this.prisma.candidate.update({
                    where: { id: candidateId },
                    data: {
                        fullName: parsed.personalInfo?.fullName || candidate.fullName,
                        email: parsed.personalInfo?.email || candidate.email,
                        phone: parsed.personalInfo?.phone || candidate.phone,
                        location: parsed.personalInfo?.location || candidate.location,
                        linkedinUrl: parsed.personalInfo?.linkedinUrl || candidate.linkedinUrl,
                        githubUrl: parsed.personalInfo?.githubUrl || candidate.githubUrl,
                        education: parsed.education || undefined,
                        experience: parsed.experience || undefined,
                        skills: parsed.skills || undefined,
                        projects: parsed.projects || undefined,
                        certifications: parsed.certifications || undefined,
                        languages: parsed.languages || undefined,
                        aiSummary: parsed.summary || undefined,
                    },
                });
                const targetJobId = jobId || candidate.jobId;
                if (targetJobId) {
                    this.logger.log(`Scoring candidate ${candidateId} for job ${targetJobId}`);
                    await this.scoreCandidate(candidateId, targetJobId, parsed, candidate.companyId);
                }
            }
            return { success: true, candidateId };
        }
        catch (error) {
            this.logger.error(`Failed to process CV for candidate ${candidateId}:`, error);
            throw error;
        }
    }
    async scoreCandidate(candidateId, jobId, parsedData, companyId) {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId },
        });
        if (!job) {
            this.logger.warn(`Job ${jobId} not found for scoring`);
            return;
        }
        const requirements = {
            title: job.title,
            requiredSkills: job.requiredSkills,
            preferredSkills: job.preferredSkills,
            experienceLevel: job.experienceLevel,
            requirements: job.requirements || {},
        };
        const scoreResult = await this.aiService.scoreCandidate(parsedData, requirements);
        await this.billingService.trackUsage(companyId, client_1.UsageType.AI_SCORING_CALL);
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
        await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
                overallScore: scoreResult.overallScore,
                scoreBreakdown: scoreResult.scoreExplanation || undefined,
            },
        });
    }
    onActive(job) {
        this.logger.log(`Processing job ${job.id} for candidate ${job.data.candidateId}`);
    }
    async onCompleted(job) {
        this.logger.log(`Completed job ${job.id} for candidate ${job.data.candidateId}`);
        const candidate = await this.prisma.candidate.findUnique({
            where: { id: job.data.candidateId },
            select: { companyId: true, fullName: true },
        });
        if (candidate) {
            await this.billingService.trackUsage(candidate.companyId, client_1.UsageType.CV_PROCESSED);
            await this.notificationsService.createNotification({
                type: client_1.NotificationType.CV_PROCESSING_COMPLETE,
                companyId: candidate.companyId,
                title: 'CV Processed',
                message: `CV for ${candidate.fullName || 'candidate'} has been processed and scored.`,
                metadata: { candidateId: job.data.candidateId, jobId: job.data.jobId },
            });
            await this.notificationsService.checkAndNotifyUsageLimits(candidate.companyId);
        }
    }
    onFailed(job, error) {
        this.logger.error(`Failed job ${job.id} for candidate ${job.data.candidateId}: ${error.message}`);
    }
};
exports.CvProcessingProcessor = CvProcessingProcessor;
__decorate([
    (0, bull_1.Process)('process-cv'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CvProcessingProcessor.prototype, "processCv", null);
__decorate([
    (0, bull_1.OnQueueActive)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CvProcessingProcessor.prototype, "onActive", null);
__decorate([
    (0, bull_1.OnQueueCompleted)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CvProcessingProcessor.prototype, "onCompleted", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], CvProcessingProcessor.prototype, "onFailed", null);
exports.CvProcessingProcessor = CvProcessingProcessor = CvProcessingProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_NAMES.CV_PROCESSING),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_service_1.AiService,
        file_processing_service_1.FileProcessingService,
        notifications_service_1.NotificationsService,
        billing_service_1.BillingService])
], CvProcessingProcessor);
//# sourceMappingURL=cv-processing.processor.js.map