"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailSendingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailSendingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const email_templates_service_1 = require("../email-templates/email-templates.service");
const template_engine_service_1 = require("./template-engine.service");
const billing_service_1 = require("../billing/billing.service");
const sgMail = __importStar(require("@sendgrid/mail"));
let EmailSendingService = EmailSendingService_1 = class EmailSendingService {
    prisma;
    configService;
    emailTemplatesService;
    templateEngine;
    billingService;
    logger = new common_1.Logger(EmailSendingService_1.name);
    fromEmail;
    isConfigured;
    constructor(prisma, configService, emailTemplatesService, templateEngine, billingService) {
        this.prisma = prisma;
        this.configService = configService;
        this.emailTemplatesService = emailTemplatesService;
        this.templateEngine = templateEngine;
        this.billingService = billingService;
        const apiKey = this.configService.get('sendgrid.apiKey');
        this.fromEmail = this.configService.get('sendgrid.fromEmail') || 'noreply@recdesk.io';
        if (apiKey) {
            sgMail.setApiKey(apiKey);
            this.isConfigured = true;
            this.logger.log('SendGrid configured successfully');
        }
        else {
            this.isConfigured = false;
            this.logger.warn('SendGrid API key not configured - emails will be logged only');
        }
    }
    async sendEmail(dto, userId, companyId) {
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: dto.candidateId, companyId },
            include: { job: { select: { title: true } } },
        });
        if (!candidate) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        if (!candidate.email) {
            throw new common_1.BadRequestException('Candidate does not have an email address');
        }
        const template = await this.emailTemplatesService.findOne(dto.templateId, companyId);
        const [company, user] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId } }),
            this.prisma.user.findUnique({ where: { id: userId } }),
        ]);
        if (!company || !user) {
            throw new common_1.NotFoundException('Company or user not found');
        }
        const context = {
            candidate: {
                fullName: candidate.fullName,
                email: candidate.email,
            },
            job: candidate.job,
            company: { name: company.name },
            sender: { firstName: user.firstName, lastName: user.lastName },
        };
        const subject = this.templateEngine.render(dto.subjectOverride || template.subject, context);
        const body = this.templateEngine.render(template.body, context);
        const result = await this.sendViaProvider(candidate.email, subject, body);
        if (result.success) {
            await this.prisma.emailSent.create({
                data: {
                    subject,
                    body,
                    candidateId: candidate.id,
                    sentById: userId,
                },
            });
            await this.billingService.trackUsage(companyId, 'EMAIL_SENT');
            await this.prisma.candidateAction.create({
                data: {
                    candidateId: candidate.id,
                    userId,
                    action: 'email_sent',
                    details: {
                        templateId: template.id,
                        templateName: template.name,
                        subject,
                    },
                },
            });
        }
        return {
            candidateId: candidate.id,
            candidateName: candidate.fullName,
            candidateEmail: candidate.email,
            ...result,
        };
    }
    async bulkSendEmails(dto, userId, companyId) {
        const template = await this.emailTemplatesService.findOne(dto.templateId, companyId);
        const candidates = await this.prisma.candidate.findMany({
            where: {
                id: { in: dto.candidateIds },
                companyId,
            },
            include: { job: { select: { title: true } } },
        });
        if (candidates.length === 0) {
            throw new common_1.NotFoundException('No candidates found');
        }
        const [company, user] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId } }),
            this.prisma.user.findUnique({ where: { id: userId } }),
        ]);
        if (!company || !user) {
            throw new common_1.NotFoundException('Company or user not found');
        }
        const results = [];
        let successful = 0;
        let failed = 0;
        for (const candidate of candidates) {
            if (!candidate.email) {
                results.push({
                    candidateId: candidate.id,
                    candidateName: candidate.fullName,
                    candidateEmail: '',
                    success: false,
                    error: 'No email address',
                });
                failed++;
                continue;
            }
            const context = {
                candidate: {
                    fullName: candidate.fullName,
                    email: candidate.email,
                },
                job: candidate.job,
                company: { name: company.name },
                sender: { firstName: user.firstName, lastName: user.lastName },
            };
            const subject = this.templateEngine.render(dto.subjectOverride || template.subject, context);
            const body = this.templateEngine.render(template.body, context);
            const result = await this.sendViaProvider(candidate.email, subject, body);
            if (result.success) {
                successful++;
                await this.prisma.emailSent.create({
                    data: {
                        subject,
                        body,
                        candidateId: candidate.id,
                        sentById: userId,
                    },
                });
                await this.billingService.trackUsage(companyId, 'EMAIL_SENT');
                await this.prisma.candidateAction.create({
                    data: {
                        candidateId: candidate.id,
                        userId,
                        action: 'email_sent',
                        details: {
                            templateId: template.id,
                            templateName: template.name,
                            subject,
                            bulkSend: true,
                        },
                    },
                });
            }
            else {
                failed++;
            }
            results.push({
                candidateId: candidate.id,
                candidateName: candidate.fullName,
                candidateEmail: candidate.email,
                ...result,
            });
        }
        this.logger.log(`Bulk email sent: ${successful} successful, ${failed} failed out of ${candidates.length}`);
        return {
            total: candidates.length,
            successful,
            failed,
            results,
        };
    }
    async previewEmail(dto, companyId, userId) {
        const template = await this.emailTemplatesService.findOne(dto.templateId, companyId);
        let context;
        if (dto.candidateId) {
            const candidate = await this.prisma.candidate.findFirst({
                where: { id: dto.candidateId, companyId },
                include: { job: { select: { title: true } } },
            });
            if (!candidate) {
                throw new common_1.NotFoundException('Candidate not found');
            }
            const [company, user] = await Promise.all([
                this.prisma.company.findUnique({ where: { id: companyId } }),
                this.prisma.user.findUnique({ where: { id: userId } }),
            ]);
            context = {
                candidate: {
                    fullName: candidate.fullName,
                    email: candidate.email,
                },
                job: candidate.job,
                company: { name: company?.name || 'Your Company' },
                sender: {
                    firstName: user?.firstName || 'Your',
                    lastName: user?.lastName || 'Name'
                },
            };
        }
        else {
            const [company, user] = await Promise.all([
                this.prisma.company.findUnique({ where: { id: companyId } }),
                this.prisma.user.findUnique({ where: { id: userId } }),
            ]);
            context = {
                ...this.templateEngine.createSampleContext(),
                company: { name: company?.name || 'Your Company' },
                sender: {
                    firstName: user?.firstName || 'Your',
                    lastName: user?.lastName || 'Name'
                },
            };
        }
        const subject = this.templateEngine.render(template.subject, context);
        const body = this.templateEngine.render(template.body, context);
        const tokens = this.templateEngine.extractTokens(template.subject + template.body);
        return { subject, body, tokens };
    }
    async getSentEmails(companyId, options = {}) {
        const { candidateId, page = 1, limit = 50 } = options;
        const skip = (page - 1) * limit;
        const where = {
            candidate: { companyId },
            ...(candidateId && { candidateId }),
        };
        const [emails, total] = await Promise.all([
            this.prisma.emailSent.findMany({
                where,
                include: {
                    candidate: {
                        select: { id: true, fullName: true, email: true },
                    },
                    sentBy: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                },
                orderBy: { sentAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.emailSent.count({ where }),
        ]);
        return {
            data: emails,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async sendViaProvider(to, subject, body) {
        if (!this.isConfigured) {
            this.logger.log(`[DEV MODE] Email would be sent to: ${to}`);
            this.logger.log(`[DEV MODE] Subject: ${subject}`);
            this.logger.debug(`[DEV MODE] Body: ${body.substring(0, 200)}...`);
            return { success: true };
        }
        try {
            await sgMail.send({
                to,
                from: this.fromEmail,
                subject,
                text: body,
                html: body.replace(/\n/g, '<br>'),
            });
            this.logger.log(`Email sent successfully to: ${to}`);
            return { success: true };
        }
        catch (error) {
            this.logger.error(`Failed to send email to ${to}: ${error.message}`);
            return {
                success: false,
                error: error.message || 'Failed to send email',
            };
        }
    }
};
exports.EmailSendingService = EmailSendingService;
exports.EmailSendingService = EmailSendingService = EmailSendingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        email_templates_service_1.EmailTemplatesService,
        template_engine_service_1.TemplateEngineService,
        billing_service_1.BillingService])
], EmailSendingService);
//# sourceMappingURL=email-sending.service.js.map