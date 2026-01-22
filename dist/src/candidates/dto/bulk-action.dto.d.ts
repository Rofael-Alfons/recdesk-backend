import { CandidateStatus } from '@prisma/client';
export declare class BulkUpdateStatusDto {
    candidateIds: string[];
    status: CandidateStatus;
}
export declare class BulkAddTagsDto {
    candidateIds: string[];
    tags: string[];
}
export declare class BulkAssignJobDto {
    candidateIds: string[];
    jobId: string;
}
