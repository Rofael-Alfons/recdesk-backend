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
var JobsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_service_1 = require("../queue/queue.service");
let JobsService = JobsService_1 = class JobsService {
    prisma;
    queueService;
    logger = new common_1.Logger(JobsService_1.name);
    constructor(prisma, queueService) {
        this.prisma = prisma;
        this.queueService = queueService;
    }
    async create(dto, companyId) {
        const job = await this.prisma.job.create({
            data: {
                title: dto.title,
                description: dto.description,
                status: dto.status || 'DRAFT',
                experienceLevel: dto.experienceLevel || 'JUNIOR',
                requiredSkills: dto.requiredSkills || [],
                preferredSkills: dto.preferredSkills || [],
                requirements: dto.requirements || {},
                companyId,
            },
            include: {
                _count: {
                    select: { candidates: true },
                },
            },
        });
        await this.createDefaultPipelineStages(job.id);
        return this.formatJobResponse(job);
    }
    async findAll(companyId, query) {
        const { status, experienceLevel, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;
        const where = {
            companyId,
            ...(status && { status }),
            ...(experienceLevel && { experienceLevel }),
        };
        const [jobs, total] = await Promise.all([
            this.prisma.job.findMany({
                where,
                include: {
                    _count: {
                        select: { candidates: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.job.count({ where }),
        ]);
        return {
            data: jobs.map(this.formatJobResponse),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOne(jobId, companyId) {
        const job = await this.prisma.job.findFirst({
            where: {
                id: jobId,
                companyId,
            },
            include: {
                _count: {
                    select: { candidates: true },
                },
                pipelineStages: {
                    orderBy: { orderIndex: 'asc' },
                },
            },
        });
        if (!job) {
            throw new common_1.NotFoundException('Job not found');
        }
        return {
            ...this.formatJobResponse(job),
            pipelineStages: job.pipelineStages,
        };
    }
    async update(jobId, dto, companyId) {
        const existingJob = await this.prisma.job.findFirst({
            where: { id: jobId, companyId },
        });
        if (!existingJob) {
            throw new common_1.NotFoundException('Job not found');
        }
        const requirementsChanged = dto.requiredSkills !== undefined ||
            dto.preferredSkills !== undefined ||
            dto.experienceLevel !== undefined ||
            dto.requirements !== undefined;
        const job = await this.prisma.job.update({
            where: { id: jobId },
            data: {
                ...(dto.title && { title: dto.title }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.status && { status: dto.status }),
                ...(dto.experienceLevel && { experienceLevel: dto.experienceLevel }),
                ...(dto.requiredSkills && { requiredSkills: dto.requiredSkills }),
                ...(dto.preferredSkills && { preferredSkills: dto.preferredSkills }),
                ...(dto.requirements && { requirements: dto.requirements }),
            },
            include: {
                _count: {
                    select: { candidates: true },
                },
            },
        });
        if (requirementsChanged) {
            await this.triggerRescoring(jobId);
        }
        return this.formatJobResponse(job);
    }
    async triggerRescoring(jobId) {
        const candidates = await this.prisma.candidate.findMany({
            where: { jobId },
            select: { id: true },
        });
        if (candidates.length === 0) {
            return;
        }
        this.logger.log(`Triggering re-scoring for ${candidates.length} candidates on job ${jobId}`);
        if (this.queueService) {
            const scoringJobs = candidates.map((c) => ({
                candidateId: c.id,
                jobId,
            }));
            await this.queueService.addBulkScoringJobs(scoringJobs);
            this.logger.log(`Added ${candidates.length} re-scoring jobs to queue`);
        }
        else {
            this.logger.warn(`Queue service not available. ${candidates.length} candidates need re-scoring for job ${jobId}`);
        }
    }
    async remove(jobId, companyId) {
        const existingJob = await this.prisma.job.findFirst({
            where: { id: jobId, companyId },
        });
        if (!existingJob) {
            throw new common_1.NotFoundException('Job not found');
        }
        await this.prisma.job.update({
            where: { id: jobId },
            data: { status: 'CLOSED' },
        });
        return { message: 'Job closed successfully' };
    }
    async getJobStats(companyId) {
        const [total, byStatus, byLevel] = await Promise.all([
            this.prisma.job.count({ where: { companyId } }),
            this.prisma.job.groupBy({
                by: ['status'],
                where: { companyId },
                _count: true,
            }),
            this.prisma.job.groupBy({
                by: ['experienceLevel'],
                where: { companyId },
                _count: true,
            }),
        ]);
        const statusMap = byStatus.reduce((acc, item) => {
            acc[item.status.toLowerCase()] = item._count;
            return acc;
        }, {});
        const levelMap = byLevel.reduce((acc, item) => {
            acc[item.experienceLevel.toLowerCase()] = item._count;
            return acc;
        }, {});
        return {
            total,
            byStatus: {
                draft: statusMap['draft'] || 0,
                active: statusMap['active'] || 0,
                paused: statusMap['paused'] || 0,
                closed: statusMap['closed'] || 0,
            },
            byExperienceLevel: {
                junior: levelMap['junior'] || 0,
                mid: levelMap['mid'] || 0,
                senior: levelMap['senior'] || 0,
                lead: levelMap['lead'] || 0,
            },
        };
    }
    async createDefaultPipelineStages(jobId) {
        const defaultStages = [
            { name: 'New', orderIndex: 0, color: '#6B7280', isDefault: true },
            { name: 'Screening', orderIndex: 1, color: '#3B82F6', isDefault: false },
            { name: 'Interview', orderIndex: 2, color: '#8B5CF6', isDefault: false },
            { name: 'Offer', orderIndex: 3, color: '#10B981', isDefault: false },
            { name: 'Hired', orderIndex: 4, color: '#059669', isDefault: false },
        ];
        await this.prisma.pipelineStage.createMany({
            data: defaultStages.map((stage) => ({
                ...stage,
                jobId,
            })),
        });
    }
    formatJobResponse(job) {
        return {
            id: job.id,
            title: job.title,
            description: job.description,
            status: job.status,
            experienceLevel: job.experienceLevel,
            requiredSkills: job.requiredSkills,
            preferredSkills: job.preferredSkills,
            requirements: job.requirements,
            candidateCount: job._count?.candidates || 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        };
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = JobsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(queue_service_1.QueueService)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        queue_service_1.QueueService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map