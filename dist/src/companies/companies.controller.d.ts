import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class CompaniesController {
    private companiesService;
    constructor(companiesService: CompaniesService);
    getCurrentCompany(user: CurrentUserData): Promise<{
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
    getCurrentCompanyStats(user: CurrentUserData): Promise<{
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
    updateCurrentCompany(dto: UpdateCompanyDto, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        domain: string | null;
        mode: import("@prisma/client").$Enums.CompanyMode;
        plan: import("@prisma/client").$Enums.PlanType;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findOne(id: string, user: CurrentUserData): Promise<{
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
    getStats(id: string, user: CurrentUserData): Promise<{
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
    update(id: string, dto: UpdateCompanyDto, user: CurrentUserData): Promise<{
        id: string;
        name: string;
        domain: string | null;
        mode: import("@prisma/client").$Enums.CompanyMode;
        plan: import("@prisma/client").$Enums.PlanType;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
