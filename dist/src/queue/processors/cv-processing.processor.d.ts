import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { FileProcessingService } from '../../file-processing/file-processing.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BillingService } from '../../billing/billing.service';
import type { CvProcessingJobData } from '../queue.service';
export declare class CvProcessingProcessor {
    private prisma;
    private aiService;
    private fileProcessingService;
    private notificationsService;
    private billingService;
    private readonly logger;
    constructor(prisma: PrismaService, aiService: AiService, fileProcessingService: FileProcessingService, notificationsService: NotificationsService, billingService: BillingService);
    processCv(job: Job<CvProcessingJobData>): Promise<{
        success: boolean;
        candidateId: string;
    }>;
    private scoreCandidate;
    onActive(job: Job<CvProcessingJobData>): void;
    onCompleted(job: Job<CvProcessingJobData>): Promise<void>;
    onFailed(job: Job<CvProcessingJobData>, error: Error): void;
}
