import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import type { ScoringJobData } from '../queue.service';
export declare class ScoringProcessor {
    private prisma;
    private aiService;
    private readonly logger;
    constructor(prisma: PrismaService, aiService: AiService);
    scoreCandidate(job: Job<ScoringJobData>): Promise<{
        success: boolean;
        candidateId: string;
        jobId: string;
        score: number;
    }>;
    onCompleted(job: Job<ScoringJobData>, result: any): void;
    onFailed(job: Job<ScoringJobData>, error: Error): void;
}
