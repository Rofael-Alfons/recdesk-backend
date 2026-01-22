import { CandidateSource, CandidateStatus } from '@prisma/client';
export declare class CreateCandidateDto {
    fullName: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    source?: CandidateSource;
    status?: CandidateStatus;
    jobId?: string;
    tags?: string[];
}
