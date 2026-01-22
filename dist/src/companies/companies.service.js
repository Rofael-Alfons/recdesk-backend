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
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let CompaniesService = class CompaniesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findOne(companyId, requestingUserId) {
        const user = await this.prisma.user.findUnique({
            where: { id: requestingUserId },
            select: { companyId: true },
        });
        if (!user || user.companyId !== companyId) {
            throw new common_1.ForbiddenException('You can only view your own company');
        }
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: {
                    select: {
                        users: true,
                        jobs: true,
                        candidates: true,
                    },
                },
            },
        });
        if (!company) {
            throw new common_1.NotFoundException('Company not found');
        }
        return {
            id: company.id,
            name: company.name,
            domain: company.domain,
            mode: company.mode,
            plan: company.plan,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            stats: {
                totalUsers: company._count.users,
                totalJobs: company._count.jobs,
                totalCandidates: company._count.candidates,
            },
        };
    }
    async update(companyId, dto, requestingUserId, requestingUserRole) {
        if (requestingUserRole !== client_1.UserRole.ADMIN) {
            throw new common_1.ForbiddenException('Only admins can update company settings');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: requestingUserId },
            select: { companyId: true },
        });
        if (!user || user.companyId !== companyId) {
            throw new common_1.ForbiddenException('You can only update your own company');
        }
        if (dto.domain) {
            const existingCompany = await this.prisma.company.findFirst({
                where: {
                    domain: dto.domain.toLowerCase(),
                    id: { not: companyId },
                },
            });
            if (existingCompany) {
                throw new common_1.ConflictException('Domain is already in use');
            }
        }
        const company = await this.prisma.company.update({
            where: { id: companyId },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.domain && { domain: dto.domain.toLowerCase() }),
                ...(dto.mode && { mode: dto.mode }),
                ...(dto.plan && { plan: dto.plan }),
            },
        });
        return {
            id: company.id,
            name: company.name,
            domain: company.domain,
            mode: company.mode,
            plan: company.plan,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
        };
    }
    async getStats(companyId, requestingUserId) {
        const user = await this.prisma.user.findUnique({
            where: { id: requestingUserId },
            select: { companyId: true },
        });
        if (!user || user.companyId !== companyId) {
            throw new common_1.ForbiddenException('You can only view your own company stats');
        }
        const [totalUsers, totalJobs, activeJobs, totalCandidates, newCandidatesToday, avgScore,] = await Promise.all([
            this.prisma.user.count({ where: { companyId } }),
            this.prisma.job.count({ where: { companyId } }),
            this.prisma.job.count({ where: { companyId, status: 'ACTIVE' } }),
            this.prisma.candidate.count({ where: { companyId } }),
            this.prisma.candidate.count({
                where: {
                    companyId,
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                },
            }),
            this.prisma.candidate.aggregate({
                where: { companyId, overallScore: { not: null } },
                _avg: { overallScore: true },
            }),
        ]);
        const candidatesByStatus = await this.prisma.candidate.groupBy({
            by: ['status'],
            where: { companyId },
            _count: true,
        });
        const statusMap = candidatesByStatus.reduce((acc, item) => {
            acc[item.status] = item._count;
            return acc;
        }, {});
        return {
            users: {
                total: totalUsers,
            },
            jobs: {
                total: totalJobs,
                active: activeJobs,
            },
            candidates: {
                total: totalCandidates,
                newToday: newCandidatesToday,
                averageScore: avgScore._avg.overallScore
                    ? Math.round(avgScore._avg.overallScore)
                    : null,
                byStatus: {
                    new: statusMap['NEW'] || 0,
                    screening: statusMap['SCREENING'] || 0,
                    shortlisted: statusMap['SHORTLISTED'] || 0,
                    interviewing: statusMap['INTERVIEWING'] || 0,
                    offered: statusMap['OFFERED'] || 0,
                    hired: statusMap['HIRED'] || 0,
                    rejected: statusMap['REJECTED'] || 0,
                    withdrawn: statusMap['WITHDRAWN'] || 0,
                },
            },
        };
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map