import { JobStatus, ExperienceLevel } from '@prisma/client';
export declare class QueryJobsDto {
    status?: JobStatus;
    experienceLevel?: ExperienceLevel;
    page?: number;
    limit?: number;
}
