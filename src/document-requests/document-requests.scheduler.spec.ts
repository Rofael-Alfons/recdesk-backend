import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRequestStatus } from '@prisma/client';
import { DocumentRequestsScheduler } from './document-requests.scheduler';
import { PrismaService } from '../prisma/prisma.service';

describe('DocumentRequestsScheduler', () => {
  let scheduler: DocumentRequestsScheduler;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      documentRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRequestsScheduler,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    scheduler = module.get(DocumentRequestsScheduler);
  });

  it('only expires PENDING/PARTIAL requests past their expiresAt', async () => {
    await scheduler.handleExpiry();

    expect(prisma.documentRequest.updateMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [DocumentRequestStatus.PENDING, DocumentRequestStatus.PARTIAL],
        },
        expiresAt: { lt: expect.any(Date) },
      },
      data: { status: DocumentRequestStatus.EXPIRED },
    });
  });

  it('does not run overlapping executions concurrently', async () => {
    let resolveFirst: () => void;
    prisma.documentRequest.updateMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ count: 0 });
        }),
    );

    const first = scheduler.handleExpiry();
    const second = scheduler.handleExpiry();

    resolveFirst!();
    await Promise.all([first, second]);

    expect(prisma.documentRequest.updateMany).toHaveBeenCalledTimes(1);
  });
});
