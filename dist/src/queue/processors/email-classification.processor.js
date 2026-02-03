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
var EmailClassificationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailClassificationProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ai_service_1 = require("../../ai/ai.service");
const queue_constants_1 = require("../queue.constants");
const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 80;
let EmailClassificationProcessor = EmailClassificationProcessor_1 = class EmailClassificationProcessor {
    prisma;
    aiService;
    logger = new common_1.Logger(EmailClassificationProcessor_1.name);
    constructor(prisma, aiService) {
        this.prisma = prisma;
        this.aiService = aiService;
    }
    async classifyEmail(job) {
        const { emailConnectionId, messageId, subject, senderEmail, senderName, bodyText, } = job.data;
        this.logger.log(`Classifying email ${messageId}`);
        try {
            const existingImport = await this.prisma.emailImport.findUnique({
                where: { messageId },
            });
            if (existingImport) {
                this.logger.log(`Email ${messageId} already processed, skipping`);
                return { skipped: true, messageId };
            }
            const connection = await this.prisma.emailConnection.findUnique({
                where: { id: emailConnectionId },
                include: { company: true },
            });
            if (!connection) {
                throw new Error(`Email connection ${emailConnectionId} not found`);
            }
            const classification = await this.aiService.classifyEmail(subject, bodyText, senderEmail, senderName || null);
            const emailImport = await this.prisma.emailImport.create({
                data: {
                    messageId,
                    subject,
                    senderEmail,
                    senderName,
                    receivedAt: new Date(),
                    isJobApplication: classification.isJobApplication,
                    confidence: classification.confidence,
                    detectedPosition: classification.detectedPosition,
                    bodyText,
                    status: 'PENDING',
                    emailConnectionId,
                },
            });
            if (connection.autoImport &&
                classification.isJobApplication &&
                classification.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD) {
                this.logger.log(`Email ${messageId} classified as job application (${classification.confidence}% confidence), auto-importing`);
                await this.prisma.emailImport.update({
                    where: { id: emailImport.id },
                    data: { status: 'PROCESSING' },
                });
                await this.prisma.emailImport.update({
                    where: { id: emailImport.id },
                    data: {
                        status: 'IMPORTED',
                        processedAt: new Date(),
                    },
                });
            }
            else if (!classification.isJobApplication) {
                await this.prisma.emailImport.update({
                    where: { id: emailImport.id },
                    data: {
                        status: 'SKIPPED',
                        processedAt: new Date(),
                    },
                });
            }
            return {
                success: true,
                messageId,
                isJobApplication: classification.isJobApplication,
                confidence: classification.confidence,
            };
        }
        catch (error) {
            this.logger.error(`Failed to classify email ${messageId}:`, error);
            throw error;
        }
    }
    onFailed(job, error) {
        this.logger.error(`Failed job ${job.id} for email ${job.data.messageId}: ${error.message}`);
    }
};
exports.EmailClassificationProcessor = EmailClassificationProcessor;
__decorate([
    (0, bull_1.Process)('classify-email'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EmailClassificationProcessor.prototype, "classifyEmail", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], EmailClassificationProcessor.prototype, "onFailed", null);
exports.EmailClassificationProcessor = EmailClassificationProcessor = EmailClassificationProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_NAMES.EMAIL_CLASSIFICATION),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_service_1.AiService])
], EmailClassificationProcessor);
//# sourceMappingURL=email-classification.processor.js.map