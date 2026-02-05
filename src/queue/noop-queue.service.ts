import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  CvProcessingJobData,
  EmailClassificationJobData,
  ScoringJobData,
} from './queue.service';

/**
 * No-operation QueueService implementation for when Redis is not available.
 * Logs warnings and returns stub values instead of actually queuing jobs.
 */
@Injectable()
export class NoOpQueueService {
  private readonly logger = new Logger('NoOpQueueService');

  constructor() {
    this.logger.warn(
      'QueueService initialized in no-op mode - Redis not configured. ' +
      'Background jobs will be skipped. Configure REDIS_URL for full functionality.',
    );
  }

  /**
   * Stub: Log warning and return null instead of adding job
   */
  async addCvProcessingJob(
    data: CvProcessingJobData,
  ): Promise<Job<CvProcessingJobData> | null> {
    this.logger.warn(
      `CV processing job skipped (no Redis) for candidate ${data.candidateId}`,
    );
    return null;
  }

  /**
   * Stub: Log warning and return empty array
   */
  async addBulkCvProcessingJobs(
    jobs: CvProcessingJobData[],
  ): Promise<Job<CvProcessingJobData>[]> {
    this.logger.warn(
      `${jobs.length} CV processing jobs skipped (no Redis)`,
    );
    return [];
  }

  /**
   * Stub: Log warning and return null
   */
  async addEmailClassificationJob(
    data: EmailClassificationJobData,
  ): Promise<Job<EmailClassificationJobData> | null> {
    this.logger.warn(
      `Email classification job skipped (no Redis) for message ${data.messageId}`,
    );
    return null;
  }

  /**
   * Stub: Log warning and return null
   */
  async addScoringJob(data: ScoringJobData): Promise<Job<ScoringJobData> | null> {
    this.logger.warn(
      `Scoring job skipped (no Redis) for candidate ${data.candidateId}`,
    );
    return null;
  }

  /**
   * Stub: Log warning and return empty array
   */
  async addBulkScoringJobs(
    jobs: ScoringJobData[],
  ): Promise<Job<ScoringJobData>[]> {
    this.logger.warn(
      `${jobs.length} scoring jobs skipped (no Redis)`,
    );
    return [];
  }

  /**
   * Stub: Return empty stats
   */
  async getQueueStats() {
    return {
      cvProcessing: { name: 'cv-processing', waiting: 0, active: 0, completed: 0, failed: 0 },
      emailClassification: { name: 'email-classification', waiting: 0, active: 0, completed: 0, failed: 0 },
      scoring: { name: 'scoring', waiting: 0, active: 0, completed: 0, failed: 0 },
      status: 'disabled',
      message: 'Redis not configured - queues unavailable',
    };
  }
}
