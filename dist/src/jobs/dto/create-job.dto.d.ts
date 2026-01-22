import { JobStatus, ExperienceLevel } from '@prisma/client';
export declare class CreateJobDto {
    title: string;
    description?: string;
    status?: JobStatus;
    experienceLevel?: ExperienceLevel;
    requiredSkills?: string[];
    preferredSkills?: string[];
    requirements?: Record<string, any>;
}
