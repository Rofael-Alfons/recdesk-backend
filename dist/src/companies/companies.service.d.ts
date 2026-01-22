import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto';
import { UserRole } from '@prisma/client';
export declare class CompaniesService {
    private prisma;
    constructor(prisma: PrismaService);
    findOne(companyId: string, requestingUserId: string): Promise<{
        id: string;
        name: string;
        domain: string | null;
        mode: import("@prisma/client").$Enums.CompanyMode;
        plan: import("@prisma/client").$Enums.PlanType;
        createdAt: Date;
        updatedAt: Date;
        stats: {
            totalUsers: number;
            totalJobs: number;
            totalCandidates: number;
        };
    }>;
    update(companyId: string, dto: UpdateCompanyDto, requestingUserId: string, requestingUserRole: UserRole): Promise<{
        id: string;
        name: string;
        domain: string | null;
        mode: import("@prisma/client").$Enums.CompanyMode;
        plan: import("@prisma/client").$Enums.PlanType;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getStats(companyId: string, requestingUserId: string): Promise<{
        users: {
            total: number;
        };
        jobs: {
            total: number;
            active: number;
        };
        candidates: {
            total: number;
            newToday: number;
            averageScore: number | null;
            byStatus: {
                new: number;
                screening: number;
                shortlisted: number;
                interviewing: number;
                offered: number;
                hired: number;
                rejected: number;
                withdrawn: number;
            };
        };
    }>;
}
