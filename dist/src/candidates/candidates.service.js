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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CandidatesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_service_1 = require("../queue/queue.service");
const ai_service_1 = require("../ai/ai.service");
const storage_service_1 = require("../storage/storage.service");
let CandidatesService = CandidatesService_1 = class CandidatesService {
    prisma;
    aiService;
    storageService;
    queueService;
    logger = new common_1.Logger(CandidatesService_1.name);
    constructor(prisma, aiService, storageService, queueService) {
        this.prisma = prisma;
        this.aiService = aiService;
        this.storageService = storageService;
        this.queueService = queueService;
    }
    async create(dto, companyId) {
        if (dto.email) {
            const existing = await this.prisma.candidate.findFirst({
                where: {
                    companyId,
                    email: dto.email.toLowerCase(),
                },
            });
            if (existing) {
                throw new common_1.BadRequestException('A candidate with this email already exists');
            }
        }
        if (dto.jobId) {
            const job = await this.prisma.job.findFirst({
                where: { id: dto.jobId, companyId },
            });
            if (!job) {
                throw new common_1.BadRequestException('Job not found');
            }
        }
        const candidate = await this.prisma.candidate.create({
            data: {
                fullName: dto.fullName,
                email: dto.email?.toLowerCase(),
                phone: dto.phone,
                location: dto.location,
                linkedinUrl: dto.linkedinUrl,
                githubUrl: dto.githubUrl,
                portfolioUrl: dto.portfolioUrl,
                source: dto.source || 'MANUAL',
                status: dto.status || 'NEW',
                tags: dto.tags || [],
                cvFileUrl: '',
                companyId,
                jobId: dto.jobId,
            },
            include: {
                job: { select: { id: true, title: true } },
            },
        });
        return this.formatCandidateResponse(candidate, false);
    }
    async findAll(companyId, query) {
        const { status, source, jobId, minScore, maxScore, search, tag, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 50, } = query;
        const skip = (page - 1) * limit;
        const where = {
            companyId,
            ...(status && { status }),
            ...(source && { source }),
            ...(jobId && { jobId }),
            ...(minScore !== undefined && { overallScore: { gte: minScore } }),
            ...(maxScore !== undefined && { overallScore: { lte: maxScore } }),
            ...(tag && { tags: { has: tag } }),
            ...(search && {
                OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };
        const orderBy = {};
        if (sortBy === 'score') {
            orderBy.overallScore = sortOrder;
        }
        else if (sortBy === 'name') {
            orderBy.fullName = sortOrder;
        }
        else {
            orderBy.createdAt = sortOrder;
        }
        const [candidates, total] = await Promise.all([
            this.prisma.candidate.findMany({
                where,
                include: {
                    job: { select: { id: true, title: true } },
                },
                orderBy,
                skip,
                take: limit,
            }),
            this.prisma.candidate.count({ where }),
        ]);
        const formattedCandidates = await Promise.all(candidates.map((c) => this.formatCandidateResponse(c, false)));
        return {
            data: formattedCandidates,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOne(candidateId, companyId) {
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
            include: {
                job: { select: { id: true, title: true, status: true } },
                scores: {
                    include: { job: { select: { id: true, title: true } } },
                    orderBy: { scoredAt: 'desc' },
                },
                notes: {
                    include: { user: { select: { id: true, firstName: true, lastName: true } } },
                    orderBy: { createdAt: 'desc' },
                },
                stageHistory: {
                    include: { stage: true },
                    orderBy: { movedAt: 'desc' },
                },
            },
        });
        if (!candidate) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        const formatted = await this.formatCandidateResponse(candidate, true);
        return {
            ...formatted,
            scores: candidate.scores,
            notes: candidate.notes,
            stageHistory: candidate.stageHistory,
        };
    }
    async update(candidateId, dto, companyId) {
        const existing = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        if (dto.email && dto.email.toLowerCase() !== existing.email?.toLowerCase()) {
            const duplicate = await this.prisma.candidate.findFirst({
                where: {
                    companyId,
                    email: dto.email.toLowerCase(),
                    id: { not: candidateId },
                },
            });
            if (duplicate) {
                throw new common_1.BadRequestException('A candidate with this email already exists');
            }
        }
        if (dto.jobId && dto.jobId !== existing.jobId) {
            const job = await this.prisma.job.findFirst({
                where: { id: dto.jobId, companyId },
            });
            if (!job) {
                throw new common_1.BadRequestException('Job not found');
            }
        }
        const candidate = await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
                ...(dto.fullName && { fullName: dto.fullName }),
                ...(dto.email && { email: dto.email.toLowerCase() }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.location !== undefined && { location: dto.location }),
                ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
                ...(dto.githubUrl !== undefined && { githubUrl: dto.githubUrl }),
                ...(dto.portfolioUrl !== undefined && { portfolioUrl: dto.portfolioUrl }),
                ...(dto.source && { source: dto.source }),
                ...(dto.status && { status: dto.status }),
                ...(dto.jobId !== undefined && { jobId: dto.jobId }),
                ...(dto.tags && { tags: dto.tags }),
            },
            include: {
                job: { select: { id: true, title: true } },
            },
        });
        return this.formatCandidateResponse(candidate, false);
    }
    async remove(candidateId, companyId) {
        const existing = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        await this.prisma.candidate.delete({
            where: { id: candidateId },
        });
        return { message: 'Candidate deleted successfully' };
    }
    async bulkUpdateStatus(dto, companyId, userId) {
        const candidates = await this.prisma.candidate.findMany({
            where: {
                id: { in: dto.candidateIds },
                companyId,
            },
            select: { id: true },
        });
        if (candidates.length !== dto.candidateIds.length) {
            throw new common_1.BadRequestException('Some candidates were not found');
        }
        await this.prisma.$transaction([
            this.prisma.candidate.updateMany({
                where: { id: { in: dto.candidateIds } },
                data: { status: dto.status },
            }),
            this.prisma.candidateAction.createMany({
                data: dto.candidateIds.map((candidateId) => ({
                    candidateId,
                    userId,
                    action: 'status_changed',
                    details: { newStatus: dto.status },
                })),
            }),
        ]);
        return {
            message: `Updated ${candidates.length} candidates to status: ${dto.status}`,
            updatedCount: candidates.length,
        };
    }
    async bulkAddTags(dto, companyId) {
        const candidates = await this.prisma.candidate.findMany({
            where: {
                id: { in: dto.candidateIds },
                companyId,
            },
            select: { id: true, tags: true },
        });
        if (candidates.length !== dto.candidateIds.length) {
            throw new common_1.BadRequestException('Some candidates were not found');
        }
        await Promise.all(candidates.map((candidate) => {
            const mergedTags = [...new Set([...candidate.tags, ...dto.tags])];
            return this.prisma.candidate.update({
                where: { id: candidate.id },
                data: { tags: mergedTags },
            });
        }));
        return {
            message: `Added tags to ${candidates.length} candidates`,
            updatedCount: candidates.length,
        };
    }
    async bulkAssignJob(dto, companyId, userId) {
        const job = await this.prisma.job.findFirst({
            where: { id: dto.jobId, companyId },
        });
        if (!job) {
            throw new common_1.BadRequestException('Job not found');
        }
        const candidates = await this.prisma.candidate.findMany({
            where: {
                id: { in: dto.candidateIds },
                companyId,
            },
            select: { id: true },
        });
        if (candidates.length !== dto.candidateIds.length) {
            throw new common_1.BadRequestException('Some candidates were not found');
        }
        await this.prisma.$transaction([
            this.prisma.candidate.updateMany({
                where: { id: { in: dto.candidateIds } },
                data: { jobId: dto.jobId },
            }),
            this.prisma.candidateAction.createMany({
                data: dto.candidateIds.map((candidateId) => ({
                    candidateId,
                    userId,
                    action: 'assigned_to_job',
                    details: { jobId: dto.jobId, jobTitle: job.title },
                })),
            }),
        ]);
        return {
            message: `Assigned ${candidates.length} candidates to job: ${job.title}`,
            updatedCount: candidates.length,
        };
    }
    async getStats(companyId) {
        const [total, byStatus, bySource, avgScore, recentCount] = await Promise.all([
            this.prisma.candidate.count({ where: { companyId } }),
            this.prisma.candidate.groupBy({
                by: ['status'],
                where: { companyId },
                _count: true,
            }),
            this.prisma.candidate.groupBy({
                by: ['source'],
                where: { companyId },
                _count: true,
            }),
            this.prisma.candidate.aggregate({
                where: { companyId, overallScore: { not: null } },
                _avg: { overallScore: true },
            }),
            this.prisma.candidate.count({
                where: {
                    companyId,
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            }),
        ]);
        return {
            total,
            recentWeek: recentCount,
            averageScore: avgScore._avg.overallScore
                ? Math.round(avgScore._avg.overallScore)
                : null,
            byStatus: byStatus.reduce((acc, item) => {
                acc[item.status.toLowerCase()] = item._count;
                return acc;
            }, {}),
            bySource: bySource.reduce((acc, item) => {
                acc[item.source.toLowerCase()] = item._count;
                return acc;
            }, {}),
        };
    }
    async addNote(candidateId, content, companyId, userId) {
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
        });
        if (!candidate) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        const note = await this.prisma.candidateNote.create({
            data: {
                content,
                candidateId,
                userId,
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        return note;
    }
    async rescoreForJob(candidateId, dto, companyId) {
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
        });
        if (!candidate) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        const job = await this.prisma.job.findFirst({
            where: { id: dto.jobId, companyId },
        });
        if (!job) {
            throw new common_1.BadRequestException('Job not found');
        }
        if (job.status === 'CLOSED' || job.status === 'DRAFT') {
            throw new common_1.BadRequestException(`Cannot score against a ${job.status.toLowerCase()} job`);
        }
        if (this.queueService) {
            await this.queueService.addScoringJob({
                candidateId,
                jobId: dto.jobId,
            });
            return {
                message: 'Scoring job queued successfully',
                candidateId,
                jobId: dto.jobId,
                jobTitle: job.title,
            };
        }
        this.logger.log(`Scoring candidate ${candidateId} for job ${dto.jobId} synchronously`);
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
            title: job.title,
            requiredSkills: job.requiredSkills,
            preferredSkills: job.preferredSkills,
            experienceLevel: job.experienceLevel,
            requirements: job.requirements || {},
        };
        const scoreResult = await this.aiService.scoreCandidate(parsedData, requirements);
        await this.prisma.candidateScore.upsert({
            where: {
                candidateId_jobId: {
                    candidateId,
                    jobId: dto.jobId,
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
                jobId: dto.jobId,
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
        if (candidate.jobId === dto.jobId) {
            await this.prisma.candidate.update({
                where: { id: candidateId },
                data: {
                    overallScore: scoreResult.overallScore,
                    scoreBreakdown: scoreResult.scoreExplanation || undefined,
                },
            });
        }
        return {
            message: 'Candidate scored successfully',
            candidateId,
            jobId: dto.jobId,
            jobTitle: job.title,
            score: scoreResult.overallScore,
        };
    }
    async formatCandidateResponse(candidate, includeSignedUrl = false) {
        let cvFileSignedUrl = null;
        if (includeSignedUrl && candidate.cvFileUrl) {
            try {
                cvFileSignedUrl = await this.storageService.getSignedUrl(candidate.cvFileUrl, 3600);
            }
            catch (error) {
                this.logger.warn(`Failed to generate signed URL for candidate ${candidate.id}: ${error}`);
                cvFileSignedUrl = candidate.cvFileUrl;
            }
        }
        return {
            id: candidate.id,
            fullName: candidate.fullName,
            email: candidate.email,
            phone: candidate.phone,
            location: candidate.location,
            linkedinUrl: candidate.linkedinUrl,
            githubUrl: candidate.githubUrl,
            portfolioUrl: candidate.portfolioUrl,
            source: candidate.source,
            status: candidate.status,
            cvFileUrl: candidate.cvFileUrl,
            cvFileSignedUrl,
            cvFileName: candidate.cvFileName,
            overallScore: candidate.overallScore,
            aiSummary: candidate.aiSummary,
            tags: candidate.tags,
            job: candidate.job,
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt,
            education: candidate.education,
            experience: candidate.experience,
            skills: candidate.skills,
            projects: candidate.projects,
            certifications: candidate.certifications,
            languages: candidate.languages,
        };
    }
    async getCvSignedUrl(candidateId, companyId) {
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: candidateId, companyId },
            select: { cvFileUrl: true },
        });
        if (!candidate) {
            throw new common_1.NotFoundException('Candidate not found');
        }
        if (!candidate.cvFileUrl) {
            throw new common_1.BadRequestException('Candidate does not have a CV file');
        }
        return this.storageService.getSignedUrl(candidate.cvFileUrl, 3600);
    }
};
exports.CandidatesService = CandidatesService;
exports.CandidatesService = CandidatesService = CandidatesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_service_1.AiService,
        storage_service_1.StorageService,
        queue_service_1.QueueService])
], CandidatesService);
//# sourceMappingURL=candidates.service.js.map