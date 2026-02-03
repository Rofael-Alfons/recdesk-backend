import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto';
import { QueueService } from '../queue/queue.service';
export declare class JobsService {
    private prisma;
    private queueService?;
    private readonly logger;
    constructor(prisma: PrismaService, queueService?: QueueService | undefined);
    create(dto: CreateJobDto, companyId: string): Promise<{
        id: any;
        title: any;
        description: any;
        status: any;
        experienceLevel: any;
        requiredSkills: any;
        preferredSkills: any;
        requirements: any;
        candidateCount: any;
        createdAt: any;
        updatedAt: any;
    }>;
    findAll(companyId: string, query: QueryJobsDto): Promise<{
        data: {
            id: any;
            title: any;
            description: any;
            status: any;
            experienceLevel: any;
            requiredSkills: any;
            preferredSkills: any;
            requirements: any;
            candidateCount: any;
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
    findOne(jobId: string, companyId: string): Promise<{
        pipelineStages: {
            id: string;
            name: string;
            jobId: string;
            orderIndex: number;
            color: string;
            isDefault: boolean;
        }[];
        id: any;
        title: any;
        description: any;
        status: any;
        experienceLevel: any;
        requiredSkills: any;
        preferredSkills: any;
        requirements: any;
        candidateCount: any;
        createdAt: any;
        updatedAt: any;
    }>;
    update(jobId: string, dto: UpdateJobDto, companyId: string): Promise<{
        id: any;
        title: any;
        description: any;
        status: any;
        experienceLevel: any;
        requiredSkills: any;
        preferredSkills: any;
        requirements: any;
        candidateCount: any;
        createdAt: any;
        updatedAt: any;
    }>;
    private triggerRescoring;
    remove(jobId: string, companyId: string): Promise<{
        message: string;
    }>;
    getJobStats(companyId: string): Promise<{
        total: number;
        byStatus: {
            draft: number;
            active: number;
            paused: number;
            closed: number;
        };
        byExperienceLevel: {
            junior: number;
            mid: number;
            senior: number;
            lead: number;
        };
    }>;
    private createDefaultPipelineStages;
    private formatJobResponse;
}
