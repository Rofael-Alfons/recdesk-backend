import { CandidateSource, CandidateStatus } from '@prisma/client';
export declare class QueryCandidatesDto {
    status?: CandidateStatus;
    source?: CandidateSource;
    jobId?: string;
    minScore?: number;
    maxScore?: number;
    search?: string;
    tag?: string;
    sortBy?: 'score' | 'createdAt' | 'name';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
}
