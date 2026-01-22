import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import type { EmailClassificationJobData } from '../queue.service';
export declare class EmailClassificationProcessor {
    private prisma;
    private aiService;
    private readonly logger;
    constructor(prisma: PrismaService, aiService: AiService);
    classifyEmail(job: Job<EmailClassificationJobData>): Promise<{
        skipped: boolean;
        messageId: string;
        success?: undefined;
        isJobApplication?: undefined;
        confidence?: undefined;
    } | {
        success: boolean;
        messageId: string;
        isJobApplication: boolean;
        confidence: number;
        skipped?: undefined;
    }>;
    onFailed(job: Job<EmailClassificationJobData>, error: Error): void;
}
