import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { NoOpQueueService } from './noop-queue.service';
import { QUEUE_NAMES } from './queue.constants';

describe('QueueService', () => {
  let service: QueueService;
  let cvQueue: { add: jest.Mock; addBulk: jest.Mock; getWaitingCount: jest.Mock; getActiveCount: jest.Mock; getCompletedCount: jest.Mock; getFailedCount: jest.Mock; name: string };
  let emailQueue: typeof cvQueue;
  let scoringQueue: typeof cvQueue;

  beforeEach(async () => {
    const makeQueue = (name: string) => ({
      name,
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      addBulk: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(5),
      getFailedCount: jest.fn().mockResolvedValue(0),
    });

    cvQueue = makeQueue(QUEUE_NAMES.CV_PROCESSING);
    emailQueue = makeQueue(QUEUE_NAMES.EMAIL_CLASSIFICATION);
    scoringQueue = makeQueue(QUEUE_NAMES.SCORING);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getQueueToken(QUEUE_NAMES.CV_PROCESSING), useValue: cvQueue },
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL_CLASSIFICATION),
          useValue: emailQueue,
        },
        { provide: getQueueToken(QUEUE_NAMES.SCORING), useValue: scoringQueue },
      ],
    }).compile();

    service = module.get(QueueService);
  });

  it('enqueues CV processing jobs', async () => {
    await service.addCvProcessingJob({
      candidateId: 'c1',
      companyId: 'comp-1',
      cvFileUrl: 's3://bucket/cv.pdf',
    });

    expect(cvQueue.add).toHaveBeenCalledWith(
      'process-cv',
      expect.objectContaining({ candidateId: 'c1' }),
      expect.objectContaining({ priority: 2 }),
    );
  });

  it('enqueues bulk scoring jobs with lower priority', async () => {
    await service.addBulkScoringJobs([
      { candidateId: 'c1', jobId: 'job-1' },
      { candidateId: 'c2', jobId: 'job-1' },
    ]);

    expect(scoringQueue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'score-candidate', opts: { priority: 3 } }),
      expect.objectContaining({ name: 'score-candidate', opts: { priority: 3 } }),
    ]);
  });

  it('returns queue stats', async () => {
    const stats = await service.getQueueStats();

    expect(stats.cvProcessing.waiting).toBe(1);
    expect(stats.emailClassification.completed).toBe(5);
    expect(stats.scoring.name).toBe(QUEUE_NAMES.SCORING);
  });
});

describe('NoOpQueueService', () => {
  let service: NoOpQueueService;

  beforeEach(() => {
    service = new NoOpQueueService();
  });

  it('returns null for single CV job', async () => {
    const result = await service.addCvProcessingJob({
      candidateId: 'c1',
      companyId: 'comp-1',
      cvFileUrl: 'cv.pdf',
    });

    expect(result).toBeNull();
  });

  it('returns empty array for bulk scoring jobs', async () => {
    const result = await service.addBulkScoringJobs([
      { candidateId: 'c1', jobId: 'job-1' },
    ]);

    expect(result).toEqual([]);
  });

  it('returns disabled queue stats', async () => {
    const stats = await service.getQueueStats();

    expect(stats.status).toBe('disabled');
    expect(stats.cvProcessing.waiting).toBe(0);
  });
});
