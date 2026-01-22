import type { Queue, Job } from 'bull';
export interface CvProcessingJobData {
    candidateId: string;
    companyId: string;
    jobId?: string;
    cvFileUrl: string;
    cvFileName?: string;
}
export interface EmailClassificationJobData {
    emailConnectionId: string;
    messageId: string;
    subject: string;
    senderEmail: string;
    senderName?: string;
    bodyText: string;
    hasAttachments: boolean;
}
export interface ScoringJobData {
    candidateId: string;
    jobId: string;
}
export declare class QueueService {
    private cvProcessingQueue;
    private emailClassificationQueue;
    private scoringQueue;
    private readonly logger;
    constructor(cvProcessingQueue: Queue<CvProcessingJobData>, emailClassificationQueue: Queue<EmailClassificationJobData>, scoringQueue: Queue<ScoringJobData>);
    addCvProcessingJob(data: CvProcessingJobData): Promise<Job<CvProcessingJobData>>;
    addBulkCvProcessingJobs(jobs: CvProcessingJobData[]): Promise<Job<CvProcessingJobData>[]>;
    addEmailClassificationJob(data: EmailClassificationJobData): Promise<Job<EmailClassificationJobData>>;
    addScoringJob(data: ScoringJobData): Promise<Job<ScoringJobData>>;
    addBulkScoringJobs(jobs: ScoringJobData[]): Promise<Job<ScoringJobData>[]>;
    getQueueStats(): Promise<{
        cvProcessing: {
            name: string;
            waiting: number;
            active: number;
            completed: number;
            failed: number;
        };
        emailClassification: {
            name: string;
            waiting: number;
            active: number;
            completed: number;
            failed: number;
        };
        scoring: {
            name: string;
            waiting: number;
            active: number;
            completed: number;
            failed: number;
        };
    }>;
    private getQueueInfo;
}
