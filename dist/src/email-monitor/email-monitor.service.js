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
var EmailMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailMonitorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const googleapis_1 = require("googleapis");
const prisma_service_1 = require("../prisma/prisma.service");
const integrations_service_1 = require("../integrations/integrations.service");
const ai_service_1 = require("../ai/ai.service");
const file_processing_service_1 = require("../file-processing/file-processing.service");
const email_prefilter_service_1 = require("./email-prefilter.service");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 80;
const CV_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
let EmailMonitorService = EmailMonitorService_1 = class EmailMonitorService {
    prisma;
    configService;
    integrationsService;
    aiService;
    fileProcessingService;
    emailPrefilterService;
    logger = new common_1.Logger(EmailMonitorService_1.name);
    oauth2Client;
    uploadDir;
    constructor(prisma, configService, integrationsService, aiService, fileProcessingService, emailPrefilterService) {
        this.prisma = prisma;
        this.configService = configService;
        this.integrationsService = integrationsService;
        this.aiService = aiService;
        this.fileProcessingService = fileProcessingService;
        this.emailPrefilterService = emailPrefilterService;
        const clientId = this.configService.get('google.clientId');
        const clientSecret = this.configService.get('google.clientSecret');
        const redirectUri = this.configService.get('google.redirectUri');
        this.oauth2Client = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
        this.uploadDir = path.join(process.cwd(), 'uploads', 'cvs');
        this.ensureUploadDir();
    }
    async ensureUploadDir() {
        try {
            await fs.mkdir(this.uploadDir, { recursive: true });
        }
        catch (error) {
            this.logger.error('Failed to create upload directory:', error);
        }
    }
    async pollEmailsForConnection(connectionId, companyId) {
        const connection = await this.prisma.emailConnection.findUnique({
            where: { id: connectionId },
            include: { company: true },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Email connection not found');
        }
        if (companyId && connection.companyId !== companyId) {
            throw new common_1.BadRequestException('Connection does not belong to this company');
        }
        const result = {
            connectionId,
            email: connection.email,
            emailsProcessed: 0,
            emailsImported: 0,
            emailsSkipped: 0,
            errors: [],
        };
        try {
            const accessToken = await this.integrationsService.getValidAccessToken(connectionId);
            this.oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = googleapis_1.google.gmail({ version: 'v1', auth: this.oauth2Client });
            const messages = await this.fetchNewEmails(gmail, connection.lastHistoryId);
            this.logger.log(`Found ${messages.length} new emails for connection ${connectionId}`);
            for (const message of messages) {
                try {
                    const processed = await this.processEmail(gmail, connection, message);
                    result.emailsProcessed++;
                    if (processed.imported) {
                        result.emailsImported++;
                    }
                    else {
                        result.emailsSkipped++;
                    }
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push(`Message ${message.id}: ${errorMsg}`);
                    this.logger.error(`Error processing email ${message.id}:`, error);
                }
            }
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                await this.prisma.emailConnection.update({
                    where: { id: connectionId },
                    data: {
                        lastSyncAt: new Date(),
                        lastHistoryId: lastMessage.historyId,
                    },
                });
            }
            else {
                await this.prisma.emailConnection.update({
                    where: { id: connectionId },
                    data: { lastSyncAt: new Date() },
                });
            }
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to poll emails for connection ${connectionId}:`, error);
            result.errors.push(error instanceof Error ? error.message : 'Unknown error');
            return result;
        }
    }
    async fetchNewEmails(gmail, lastHistoryId) {
        const messages = [];
        try {
            if (lastHistoryId) {
                const historyResponse = await gmail.users.history.list({
                    userId: 'me',
                    startHistoryId: lastHistoryId,
                    historyTypes: ['messageAdded'],
                });
                const messageIds = new Set();
                historyResponse.data.history?.forEach((h) => {
                    h.messagesAdded?.forEach((m) => {
                        if (m.message?.id) {
                            messageIds.add(m.message.id);
                        }
                    });
                });
                for (const messageId of messageIds) {
                    const message = await this.getMessageDetails(gmail, messageId);
                    if (message) {
                        messages.push(message);
                    }
                }
            }
            else {
                const listResponse = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'is:unread',
                    maxResults: 50,
                });
                for (const msg of listResponse.data.messages || []) {
                    if (msg.id) {
                        const message = await this.getMessageDetails(gmail, msg.id);
                        if (message) {
                            messages.push(message);
                        }
                    }
                }
            }
            return messages;
        }
        catch (error) {
            if (error.code === 404 || error.message?.includes('historyId')) {
                this.logger.warn('Invalid history ID, falling back to message list');
                const listResponse = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'is:unread',
                    maxResults: 20,
                });
                for (const msg of listResponse.data.messages || []) {
                    if (msg.id) {
                        const message = await this.getMessageDetails(gmail, msg.id);
                        if (message) {
                            messages.push(message);
                        }
                    }
                }
                return messages;
            }
            throw error;
        }
    }
    async getMessageDetails(gmail, messageId) {
        try {
            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to get message ${messageId}:`, error);
            return null;
        }
    }
    async processEmail(gmail, connection, message) {
        const existingImport = await this.prisma.emailImport.findUnique({
            where: { messageId: message.id },
        });
        if (existingImport) {
            this.logger.log(`Email ${message.id} already processed, skipping`);
            return { imported: false };
        }
        const { subject, from, bodyText, bodyHtml, headers } = this.extractEmailData(message);
        const senderEmail = this.extractEmail(from);
        const senderName = this.extractName(from);
        const attachments = await this.extractAttachments(gmail, message);
        const attachmentInfo = attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
        }));
        const emailData = {
            subject,
            senderEmail,
            senderName,
            bodyText,
            bodyHtml,
            attachments: attachmentInfo,
            headers,
            companyDomain: connection.company?.domain || undefined,
        };
        const prefilterResult = this.emailPrefilterService.prefilterEmail(emailData);
        this.logger.log(`Prefilter result for email ${message.id}: ${prefilterResult.action} - ${prefilterResult.reason}`);
        if (prefilterResult.action === 'skip') {
            await this.prisma.emailImport.create({
                data: {
                    messageId: message.id,
                    subject,
                    senderEmail,
                    senderName,
                    receivedAt: new Date(parseInt(message.internalDate)),
                    isJobApplication: false,
                    confidence: 0,
                    bodyText,
                    bodyHtml,
                    status: 'SKIPPED',
                    skipReason: prefilterResult.reason,
                    processedAt: new Date(),
                    emailConnectionId: connection.id,
                },
            });
            return { imported: false };
        }
        let classification;
        if (prefilterResult.action === 'auto_classify') {
            classification = {
                isJobApplication: true,
                confidence: prefilterResult.confidence || 85,
                detectedPosition: prefilterResult.detectedPosition || null,
            };
            this.logger.log(`Email ${message.id} auto-classified by prefilter (${classification.confidence}% confidence)`);
        }
        else {
            const aiClassification = await this.aiService.classifyEmail(subject, bodyText, senderEmail, senderName);
            classification = {
                isJobApplication: aiClassification.isJobApplication,
                confidence: aiClassification.confidence,
                detectedPosition: aiClassification.detectedPosition,
            };
        }
        const emailImport = await this.prisma.emailImport.create({
            data: {
                messageId: message.id,
                subject,
                senderEmail,
                senderName,
                receivedAt: new Date(parseInt(message.internalDate)),
                isJobApplication: classification.isJobApplication,
                confidence: classification.confidence,
                detectedPosition: classification.detectedPosition,
                bodyText,
                bodyHtml,
                status: 'PENDING',
                skipReason: prefilterResult.action === 'auto_classify'
                    ? `Auto-classified: ${prefilterResult.reason}`
                    : null,
                emailConnectionId: connection.id,
            },
        });
        if (connection.autoImport &&
            classification.isJobApplication &&
            classification.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD) {
            this.logger.log(`Email ${message.id} classified as job application (${classification.confidence}% confidence)`);
            await this.prisma.emailImport.update({
                where: { id: emailImport.id },
                data: { status: 'PROCESSING' },
            });
            try {
                const cvAttachments = attachments.filter((a) => CV_MIME_TYPES.includes(a.mimeType));
                if (cvAttachments.length > 0) {
                    await this.processAttachment(gmail, cvAttachments[0], message.id, emailImport, connection.companyId, classification.detectedPosition);
                }
                else {
                    await this.createCandidateFromEmail(emailImport, connection.companyId, senderEmail, senderName, { detectedPosition: classification.detectedPosition });
                }
                await this.prisma.emailImport.update({
                    where: { id: emailImport.id },
                    data: {
                        status: 'IMPORTED',
                        processedAt: new Date(),
                    },
                });
                return { imported: true };
            }
            catch (error) {
                this.logger.error(`Failed to import email ${message.id}:`, error);
                await this.prisma.emailImport.update({
                    where: { id: emailImport.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: error instanceof Error ? error.message : 'Unknown error',
                        processedAt: new Date(),
                    },
                });
                throw error;
            }
        }
        else {
            await this.prisma.emailImport.update({
                where: { id: emailImport.id },
                data: {
                    status: 'SKIPPED',
                    processedAt: new Date(),
                },
            });
            return { imported: false };
        }
    }
    extractEmailData(message) {
        const messageHeaders = message.payload?.headers || [];
        const getHeader = (name) => messageHeaders.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
        const subject = getHeader('subject');
        const from = getHeader('from');
        const headers = {};
        const relevantHeaders = ['list-unsubscribe', 'x-mailer', 'x-auto-response-suppress', 'auto-submitted'];
        for (const header of messageHeaders) {
            if (header.name && relevantHeaders.includes(header.name.toLowerCase())) {
                headers[header.name.toLowerCase()] = header.value || '';
            }
        }
        let bodyText = '';
        let bodyHtml = '';
        const extractBody = (part) => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
            else if (part.mimeType === 'text/html' && part.body?.data) {
                bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
            if (part.parts) {
                part.parts.forEach(extractBody);
            }
        };
        if (message.payload) {
            extractBody(message.payload);
        }
        return { subject, from, bodyText, bodyHtml, headers };
    }
    extractEmail(from) {
        const match = from.match(/<([^>]+)>/);
        return match ? match[1] : from;
    }
    extractName(from) {
        const match = from.match(/^([^<]+)</);
        return match ? match[1].trim().replace(/"/g, '') : '';
    }
    async extractAttachments(gmail, message) {
        const attachments = [];
        const findAttachments = (part) => {
            if (part.filename && part.body?.attachmentId) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType || 'application/octet-stream',
                    size: part.body.size || 0,
                    attachmentId: part.body.attachmentId,
                });
            }
            if (part.parts) {
                part.parts.forEach(findAttachments);
            }
        };
        if (message.payload) {
            findAttachments(message.payload);
        }
        return attachments;
    }
    async processAttachment(gmail, attachment, messageId, emailImport, companyId, detectedPosition) {
        const response = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: attachment.attachmentId,
        });
        if (!response.data.data) {
            throw new Error('Failed to download attachment');
        }
        const fileBuffer = Buffer.from(response.data.data, 'base64');
        const fileId = (0, uuid_1.v4)();
        const ext = path.extname(attachment.filename);
        const savedFileName = `${fileId}${ext}`;
        const filePath = path.join(this.uploadDir, savedFileName);
        await fs.writeFile(filePath, fileBuffer);
        const extraction = await this.fileProcessingService.extractText(fileBuffer, attachment.filename);
        if (!extraction.text || extraction.confidence < 30) {
            throw new Error('Could not extract text from CV attachment');
        }
        let parsedData;
        let aiSummary = null;
        try {
            parsedData = await this.aiService.parseCV(extraction.text, attachment.filename);
            aiSummary = parsedData.summary || null;
        }
        catch (error) {
            this.logger.error('AI parsing error:', error);
            parsedData = this.extractBasicDataFromFilename(attachment.filename);
        }
        const fullName = parsedData.personalInfo?.fullName ||
            emailImport.senderName ||
            this.extractNameFromFilename(attachment.filename);
        const email = parsedData.personalInfo?.email?.toLowerCase() ||
            emailImport.senderEmail.toLowerCase();
        const existing = await this.prisma.candidate.findFirst({
            where: {
                companyId,
                email,
            },
        });
        if (existing) {
            this.logger.warn(`Duplicate candidate with email ${email}, skipping`);
            return;
        }
        let jobId = null;
        if (detectedPosition) {
            const job = await this.prisma.job.findFirst({
                where: {
                    companyId,
                    title: {
                        contains: detectedPosition,
                        mode: 'insensitive',
                    },
                    status: 'ACTIVE',
                },
            });
            if (job) {
                jobId = job.id;
            }
        }
        const candidate = await this.prisma.candidate.create({
            data: {
                fullName,
                email,
                phone: parsedData.personalInfo?.phone,
                location: parsedData.personalInfo?.location,
                linkedinUrl: parsedData.personalInfo?.linkedinUrl,
                githubUrl: parsedData.personalInfo?.githubUrl,
                portfolioUrl: parsedData.personalInfo?.portfolioUrl,
                source: 'EMAIL',
                status: 'NEW',
                cvFileUrl: `/uploads/cvs/${savedFileName}`,
                cvFileName: attachment.filename,
                cvText: extraction.text,
                extractionConfidence: extraction.confidence,
                education: parsedData.education || [],
                experience: parsedData.experience || [],
                skills: parsedData.skills || [],
                projects: parsedData.projects || [],
                certifications: parsedData.certifications || [],
                languages: parsedData.languages || [],
                aiSummary,
                companyId,
                jobId,
                emailImportId: emailImport.id,
            },
        });
        this.logger.log(`Created candidate ${candidate.id} from email attachment`);
        if (jobId) {
            await this.scoreCandidate(candidate.id, jobId);
        }
    }
    async createCandidateFromEmail(emailImport, companyId, senderEmail, senderName, classification) {
        const existing = await this.prisma.candidate.findFirst({
            where: {
                companyId,
                email: senderEmail.toLowerCase(),
            },
        });
        if (existing) {
            this.logger.warn(`Duplicate candidate with email ${senderEmail}, skipping`);
            return;
        }
        let jobId = null;
        if (classification.detectedPosition) {
            const job = await this.prisma.job.findFirst({
                where: {
                    companyId,
                    title: {
                        contains: classification.detectedPosition,
                        mode: 'insensitive',
                    },
                    status: 'ACTIVE',
                },
            });
            if (job) {
                jobId = job.id;
            }
        }
        await this.prisma.candidate.create({
            data: {
                fullName: senderName || senderEmail.split('@')[0],
                email: senderEmail.toLowerCase(),
                source: 'EMAIL',
                status: 'NEW',
                cvFileUrl: '',
                aiSummary: `Candidate applied via email. Subject: ${emailImport.subject}`,
                companyId,
                jobId,
                emailImportId: emailImport.id,
            },
        });
        this.logger.log(`Created candidate from email body (no CV attachment)`);
    }
    async scoreCandidate(candidateId, jobId) {
        try {
            const candidate = await this.prisma.candidate.findUnique({
                where: { id: candidateId },
            });
            const job = await this.prisma.job.findUnique({
                where: { id: jobId },
            });
            if (!candidate || !job)
                return;
            const parsedCV = {
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
                summary: candidate.aiSummary,
            };
            const scoreResult = await this.aiService.scoreCandidate(parsedCV, {
                title: job.title,
                requiredSkills: job.requiredSkills,
                preferredSkills: job.preferredSkills,
                experienceLevel: job.experienceLevel,
                requirements: job.requirements || {},
            });
            await this.prisma.candidateScore.create({
                data: {
                    candidateId,
                    jobId,
                    overallScore: scoreResult.overallScore,
                    skillsMatchScore: scoreResult.skillsMatchScore,
                    experienceScore: scoreResult.experienceScore,
                    educationScore: scoreResult.educationScore,
                    growthScore: scoreResult.growthScore,
                    bonusScore: scoreResult.bonusScore,
                    recommendation: scoreResult.recommendation,
                    scoreExplanation: scoreResult.scoreExplanation,
                },
            });
            await this.prisma.candidate.update({
                where: { id: candidateId },
                data: {
                    overallScore: scoreResult.overallScore,
                    scoreBreakdown: scoreResult.scoreExplanation,
                },
            });
        }
        catch (error) {
            this.logger.error('Scoring error:', error);
        }
    }
    extractNameFromFilename(fileName) {
        let name = path.basename(fileName, path.extname(fileName));
        name = name
            .replace(/[-_]/g, ' ')
            .replace(/cv|resume|curriculum|vitae/gi, '')
            .replace(/\d+/g, '')
            .trim();
        return (name
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ') || 'Unknown Candidate');
    }
    extractBasicDataFromFilename(fileName) {
        return {
            personalInfo: {
                fullName: this.extractNameFromFilename(fileName),
                email: null,
                phone: null,
                location: null,
                linkedinUrl: null,
                githubUrl: null,
                portfolioUrl: null,
            },
            education: [],
            experience: [],
            skills: [],
            projects: [],
            certifications: [],
            languages: [],
            summary: null,
        };
    }
    async syncAllConnectionsForCompany(companyId) {
        const connections = await this.prisma.emailConnection.findMany({
            where: {
                companyId,
                isActive: true,
            },
        });
        const results = [];
        let totalImported = 0;
        for (const connection of connections) {
            const result = await this.pollEmailsForConnection(connection.id);
            results.push(result);
            totalImported += result.emailsImported;
        }
        return { results, totalImported };
    }
    async getSyncStatus(companyId) {
        const connections = await this.prisma.emailConnection.findMany({
            where: { companyId },
            select: {
                id: true,
                email: true,
                isActive: true,
                autoImport: true,
                lastSyncAt: true,
                lastHistoryId: true,
                _count: {
                    select: {
                        emailImports: true,
                    },
                },
            },
        });
        return connections.map((c) => ({
            id: c.id,
            email: c.email,
            isActive: c.isActive,
            autoImport: c.autoImport,
            lastSyncAt: c.lastSyncAt,
            totalEmailsProcessed: c._count.emailImports,
        }));
    }
    async getConnectionSyncStatus(connectionId, companyId) {
        const connection = await this.prisma.emailConnection.findFirst({
            where: { id: connectionId, companyId },
            include: {
                _count: {
                    select: {
                        emailImports: true,
                    },
                },
                emailImports: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        subject: true,
                        senderEmail: true,
                        isJobApplication: true,
                        confidence: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Email connection not found');
        }
        return {
            id: connection.id,
            email: connection.email,
            isActive: connection.isActive,
            autoImport: connection.autoImport,
            lastSyncAt: connection.lastSyncAt,
            totalEmailsProcessed: connection._count.emailImports,
            recentEmails: connection.emailImports,
        };
    }
    async refreshConnectionToken(connectionId) {
        await this.integrationsService.refreshAccessToken(connectionId);
    }
};
exports.EmailMonitorService = EmailMonitorService;
exports.EmailMonitorService = EmailMonitorService = EmailMonitorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        integrations_service_1.IntegrationsService,
        ai_service_1.AiService,
        file_processing_service_1.FileProcessingService,
        email_prefilter_service_1.EmailPrefilterService])
], EmailMonitorService);
//# sourceMappingURL=email-monitor.service.js.map