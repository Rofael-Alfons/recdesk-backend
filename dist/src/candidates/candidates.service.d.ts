import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto, UpdateCandidateDto, QueryCandidatesDto, BulkUpdateStatusDto, BulkAddTagsDto, BulkAssignJobDto, RescoreCandidateDto } from './dto';
import { Prisma } from '@prisma/client';
import { QueueService } from '../queue/queue.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
export declare class CandidatesService {
    private prisma;
    private aiService;
    private storageService;
    private queueService?;
    private readonly logger;
    constructor(prisma: PrismaService, aiService: AiService, storageService: StorageService, queueService?: QueueService | undefined);
    create(dto: CreateCandidateDto, companyId: string): Promise<{
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
        cvFileSignedUrl: string | null;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
        education: any;
        experience: any;
        skills: any;
        projects: any;
        certifications: any;
        languages: any;
    }>;
    findAll(companyId: string, query: QueryCandidatesDto): Promise<{
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
            cvFileSignedUrl: string | null;
            cvFileName: any;
            overallScore: any;
            aiSummary: any;
            tags: any;
            job: any;
            createdAt: any;
            updatedAt: any;
            education: any;
            experience: any;
            skills: any;
            projects: any;
            certifications: any;
            languages: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(candidateId: string, companyId: string): Promise<{
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
            scoreExplanation: Prisma.JsonValue | null;
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
        cvFileSignedUrl: string | null;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
        education: any;
        experience: any;
        skills: any;
        projects: any;
        certifications: any;
        languages: any;
    }>;
    update(candidateId: string, dto: UpdateCandidateDto, companyId: string): Promise<{
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
        cvFileSignedUrl: string | null;
        cvFileName: any;
        overallScore: any;
        aiSummary: any;
        tags: any;
        job: any;
        createdAt: any;
        updatedAt: any;
        education: any;
        experience: any;
        skills: any;
        projects: any;
        certifications: any;
        languages: any;
    }>;
    remove(candidateId: string, companyId: string): Promise<{
        message: string;
    }>;
    bulkUpdateStatus(dto: BulkUpdateStatusDto, companyId: string, userId: string): Promise<{
        message: string;
        updatedCount: number;
    }>;
    bulkAddTags(dto: BulkAddTagsDto, companyId: string): Promise<{
        message: string;
        updatedCount: number;
    }>;
    bulkAssignJob(dto: BulkAssignJobDto, companyId: string, userId: string): Promise<{
        message: string;
        updatedCount: number;
    }>;
    getStats(companyId: string): Promise<{
        total: number;
        recentWeek: number;
        averageScore: number | null;
        byStatus: Record<string, number>;
        bySource: Record<string, number>;
    }>;
    addNote(candidateId: string, content: string, companyId: string, userId: string): Promise<{
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
    rescoreForJob(candidateId: string, dto: RescoreCandidateDto, companyId: string): Promise<{
        message: string;
        candidateId: string;
        jobId: string;
        jobTitle: string;
        score?: undefined;
    } | {
        message: string;
        candidateId: string;
        jobId: string;
        jobTitle: string;
        score: number;
    }>;
    private formatCandidateResponse;
    getCvSignedUrl(candidateId: string, companyId: string): Promise<string>;
}
