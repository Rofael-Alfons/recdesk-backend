import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { QUEUE_NAMES } from './queue.constants';

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

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CV_PROCESSING)
    private cvProcessingQueue: Queue<CvProcessingJobData>,
    @InjectQueue(QUEUE_NAMES.EMAIL_CLASSIFICATION)
    private emailClassificationQueue: Queue<EmailClassificationJobData>,
    @InjectQueue(QUEUE_NAMES.SCORING)
    private scoringQueue: Queue<ScoringJobData>,
  ) {}

  /**
   * Add a CV processing job to the queue
   */
  async addCvProcessingJob(data: CvProcessingJobData): Promise<Job<CvProcessingJobData>> {
    this.logger.log(`Adding CV processing job for candidate ${data.candidateId}`);
    return this.cvProcessingQueue.add('process-cv', data, {
      priority: 2, // Normal priority
    });
  }

  /**
   * Add multiple CV processing jobs in bulk
   */
  async addBulkCvProcessingJobs(
    jobs: CvProcessingJobData[],
  ): Promise<Job<CvProcessingJobData>[]> {
    this.logger.log(`Adding ${jobs.length} CV processing jobs`);
    const jobsToAdd = jobs.map((data) => ({
      name: 'process-cv',
      data,
      opts: { priority: 2 },
    }));
    return this.cvProcessingQueue.addBulk(jobsToAdd);
  }

  /**
   * Add an email classification job to the queue
   */
  async addEmailClassificationJob(
    data: EmailClassificationJobData,
  ): Promise<Job<EmailClassificationJobData>> {
    this.logger.log(`Adding email classification job for message ${data.messageId}`);
    return this.emailClassificationQueue.add('classify-email', data, {
      priority: 1, // High priority
    });
  }

  /**
   * Add a scoring job to the queue
   */
  async addScoringJob(data: ScoringJobData): Promise<Job<ScoringJobData>> {
    this.logger.log(`Adding scoring job for candidate ${data.candidateId}`);
    return this.scoringQueue.add('score-candidate', data, {
      priority: 2,
    });
  }

  /**
   * Add multiple scoring jobs (e.g., when job requirements change)
   */
  async addBulkScoringJobs(jobs: ScoringJobData[]): Promise<Job<ScoringJobData>[]> {
    this.logger.log(`Adding ${jobs.length} scoring jobs`);
    const jobsToAdd = jobs.map((data) => ({
      name: 'score-candidate',
      data,
      opts: { priority: 3 }, // Lower priority for bulk re-scoring
    }));
    return this.scoringQueue.addBulk(jobsToAdd);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [cvProcessing, emailClassification, scoring] = await Promise.all([
      this.getQueueInfo(this.cvProcessingQueue),
      this.getQueueInfo(this.emailClassificationQueue),
      this.getQueueInfo(this.scoringQueue),
    ]);

    return {
      cvProcessing,
      emailClassification,
      scoring,
    };
  }

  private async getQueueInfo(queue: Queue) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
    };
  }
}
