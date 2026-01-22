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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const file_processing_service_1 = require("../file-processing/file-processing.service");
const ai_service_1 = require("../ai/ai.service");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
let UploadService = class UploadService {
    prisma;
    fileProcessingService;
    aiService;
    configService;
    uploadDir;
    constructor(prisma, fileProcessingService, aiService, configService) {
        this.prisma = prisma;
        this.fileProcessingService = fileProcessingService;
        this.aiService = aiService;
        this.configService = configService;
        this.uploadDir = path.join(process.cwd(), 'uploads', 'cvs');
        this.ensureUploadDir();
    }
    async ensureUploadDir() {
        try {
            await fs.mkdir(this.uploadDir, { recursive: true });
        }
        catch (error) {
            console.error('Failed to create upload directory:', error);
        }
    }
    async uploadBulkCVs(files, companyId, jobId) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files provided');
        }
        if (files.length > 200) {
            throw new common_1.BadRequestException('Maximum 200 files per upload');
        }
        if (jobId) {
            const job = await this.prisma.job.findFirst({
                where: { id: jobId, companyId },
            });
            if (!job) {
                throw new common_1.BadRequestException('Job not found');
            }
        }
        const results = [];
        let successful = 0;
        let failed = 0;
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map((file) => this.processFile(file, companyId, jobId)));
            for (const result of batchResults) {
                results.push(result);
                if (result.status === 'success') {
                    successful++;
                }
                else {
                    failed++;
                }
            }
        }
        return {
            totalFiles: files.length,
            successful,
            failed,
            results,
        };
    }
    async processFile(file, companyId, jobId) {
        const fileName = file.originalname;
        try {
            const validation = this.fileProcessingService.validateFile(file);
            if (!validation.valid) {
                return { fileName, status: 'failed', error: validation.error };
            }
            const fileId = (0, uuid_1.v4)();
            const ext = path.extname(fileName);
            const savedFileName = `${fileId}${ext}`;
            const filePath = path.join(this.uploadDir, savedFileName);
            await fs.writeFile(filePath, file.buffer);
            const extraction = await this.fileProcessingService.extractText(file.buffer, fileName);
            if (!extraction.text || extraction.confidence < 30) {
                return {
                    fileName,
                    status: 'failed',
                    error: 'Could not extract text from file',
                };
            }
            let parsedData;
            let aiSummary = null;
            try {
                parsedData = await this.aiService.parseCV(extraction.text, fileName);
                aiSummary = parsedData.summary || null;
            }
            catch (error) {
                console.error('AI parsing error:', error);
                parsedData = this.extractBasicDataFromFilename(fileName);
            }
            if (parsedData.personalInfo?.email) {
                const existing = await this.prisma.candidate.findFirst({
                    where: {
                        companyId,
                        email: parsedData.personalInfo.email.toLowerCase(),
                    },
                });
                if (existing) {
                    return {
                        fileName,
                        status: 'failed',
                        error: `Duplicate: candidate with email ${parsedData.personalInfo.email} already exists`,
                    };
                }
            }
            const candidate = await this.prisma.candidate.create({
                data: {
                    fullName: parsedData.personalInfo?.fullName || this.extractNameFromFilename(fileName),
                    email: parsedData.personalInfo?.email?.toLowerCase(),
                    phone: parsedData.personalInfo?.phone,
                    location: parsedData.personalInfo?.location,
                    linkedinUrl: parsedData.personalInfo?.linkedinUrl,
                    githubUrl: parsedData.personalInfo?.githubUrl,
                    portfolioUrl: parsedData.personalInfo?.portfolioUrl,
                    source: 'UPLOAD',
                    status: 'NEW',
                    cvFileUrl: `/uploads/cvs/${savedFileName}`,
                    cvFileName: fileName,
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
                },
            });
            if (jobId) {
                await this.scoreCandidate(candidate.id, jobId);
            }
            return {
                fileName,
                status: 'success',
                candidateId: candidate.id,
            };
        }
        catch (error) {
            console.error(`Error processing file ${fileName}:`, error);
            return {
                fileName,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
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
            console.error('Scoring error:', error);
        }
    }
    extractNameFromFilename(fileName) {
        let name = path.basename(fileName, path.extname(fileName));
        name = name
            .replace(/[-_]/g, ' ')
            .replace(/cv|resume|curriculum|vitae/gi, '')
            .replace(/\d+/g, '')
            .trim();
        return name
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ') || 'Unknown Candidate';
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
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        file_processing_service_1.FileProcessingService,
        ai_service_1.AiService,
        config_1.ConfigService])
], UploadService);
//# sourceMappingURL=upload.service.js.map