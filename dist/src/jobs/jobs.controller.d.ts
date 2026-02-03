import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
export declare class JobsController {
    private jobsService;
    constructor(jobsService: JobsService);
    create(dto: CreateJobDto, user: CurrentUserData): Promise<{
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
    findAll(query: QueryJobsDto, user: CurrentUserData): Promise<{
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
    getStats(user: CurrentUserData): Promise<{
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
    findOne(id: string, user: CurrentUserData): Promise<{
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
    update(id: string, dto: UpdateJobDto, user: CurrentUserData): Promise<{
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
    remove(id: string, user: CurrentUserData): Promise<{
        message: string;
    }>;
}
