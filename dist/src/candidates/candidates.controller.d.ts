import { CandidatesService } from './candidates.service';
import { CreateCandidateDto, UpdateCandidateDto, QueryCandidatesDto, BulkUpdateStatusDto, BulkAddTagsDto, BulkAssignJobDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class CandidatesController {
    private candidatesService;
    constructor(candidatesService: CandidatesService);
    create(dto: CreateCandidateDto, user: CurrentUserData): Promise<{
        id: any;
        fullName: any;
        email: any;
        phone: any;
        location: any;
        linkedinUrl: any;
        githubUrl: any;
        portfolioUrl: any;
        source: any;
        status: any;
        cvFileUrl: any;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
    }>;
    findAll(query: QueryCandidatesDto, user: CurrentUserData): Promise<{
        data: {
            id: any;
            fullName: any;
            email: any;
            phone: any;
            location: any;
            linkedinUrl: any;
            githubUrl: any;
            portfolioUrl: any;
            source: any;
            status: any;
            cvFileUrl: any;
            cvFileName: any;
            overallScore: any;
            aiSummary: any;
            tags: any;
            job: any;
            createdAt: any;
            updatedAt: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getStats(user: CurrentUserData): Promise<{
        total: number;
        recentWeek: number;
        averageScore: number | null;
        byStatus: Record<string, number>;
        bySource: Record<string, number>;
    }>;
    bulkUpdateStatus(dto: BulkUpdateStatusDto, user: CurrentUserData): Promise<{
        message: string;
        updatedCount: number;
    }>;
    bulkAddTags(dto: BulkAddTagsDto, user: CurrentUserData): Promise<{
        message: string;
        updatedCount: number;
    }>;
    bulkAssignJob(dto: BulkAssignJobDto, user: CurrentUserData): Promise<{
        message: string;
        updatedCount: number;
    }>;
    findOne(id: string, user: CurrentUserData): Promise<{
        scores: ({
            job: {
                id: string;
                title: string;
            };
        } & {
            id: string;
            jobId: string;
            overallScore: number;
            skillsMatchScore: number | null;
            experienceScore: number | null;
            educationScore: number | null;
            growthScore: number | null;
            bonusScore: number | null;
            scoreExplanation: import("@prisma/client/runtime/library").JsonValue | null;
            recommendation: string | null;
            algorithmVersion: string;
            scoredAt: Date;
            candidateId: string;
        })[];
        notes: ({
            user: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            candidateId: string;
            content: string;
            userId: string;
        })[];
        stageHistory: ({
            stage: {
                id: string;
                name: string;
                orderIndex: number;
                color: string;
                isDefault: boolean;
                jobId: string;
            };
        } & {
            id: string;
            candidateId: string;
            movedAt: Date;
            stageId: string;
        })[];
        id: any;
        fullName: any;
        email: any;
        phone: any;
        location: any;
        linkedinUrl: any;
        githubUrl: any;
        portfolioUrl: any;
        source: any;
        status: any;
        cvFileUrl: any;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
    }>;
    update(id: string, dto: UpdateCandidateDto, user: CurrentUserData): Promise<{
        id: any;
        fullName: any;
        email: any;
        phone: any;
        location: any;
        linkedinUrl: any;
        githubUrl: any;
        portfolioUrl: any;
        source: any;
        status: any;
        cvFileUrl: any;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
    }>;
    remove(id: string, user: CurrentUserData): Promise<{
        message: string;
    }>;
    addNote(id: string, content: string, user: CurrentUserData): Promise<{
        user: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        candidateId: string;
        content: string;
        userId: string;
    }>;
}
