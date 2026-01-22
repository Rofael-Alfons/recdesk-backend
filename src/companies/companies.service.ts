import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findOne(companyId: string, requestingUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { companyId: true },
    });

    if (!user || user.companyId !== companyId) {
      throw new ForbiddenException('You can only view your own company');
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
      throw new NotFoundException('Company not found');
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

  async update(
    companyId: string,
    dto: UpdateCompanyDto,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ) {
    // Only admins can update company
    if (requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update company settings');
    }

    // Check user belongs to this company
    const user = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { companyId: true },
    });

    if (!user || user.companyId !== companyId) {
      throw new ForbiddenException('You can only update your own company');
    }

    // Check if domain is being changed and if it's already taken
    if (dto.domain) {
      const existingCompany = await this.prisma.company.findFirst({
        where: {
          domain: dto.domain.toLowerCase(),
          id: { not: companyId },
        },
      });

      if (existingCompany) {
        throw new ConflictException('Domain is already in use');
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

  async getStats(companyId: string, requestingUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { companyId: true },
    });

    if (!user || user.companyId !== companyId) {
      throw new ForbiddenException('You can only view your own company stats');
    }

    const [
      totalUsers,
      totalJobs,
      activeJobs,
      totalCandidates,
      newCandidatesToday,
      avgScore,
    ] = await Promise.all([
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

    // Get candidates by status
    const candidatesByStatus = await this.prisma.candidate.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    });

    const statusMap = candidatesByStatus.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

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
}
