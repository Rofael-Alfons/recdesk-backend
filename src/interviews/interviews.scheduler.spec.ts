import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InterviewStatus, OfferMode } from '@prisma/client';
import { InterviewsScheduler } from './interviews.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InterviewEmailService } from './interview-email.service';

describe('InterviewsScheduler', () => {
  let scheduler: InterviewsScheduler;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      interview: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewsScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { createNotification: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3001' } },
        { provide: InterviewEmailService, useValue: { sendAvailabilityRequest: jest.fn() } },
      ],
    }).compile();

    scheduler = module.get(InterviewsScheduler);
  });

  it('scopes the AWAITING_CANDIDATE expiry query to FIXED-offer interviews only', async () => {
    await scheduler.handleInterviewMaintenance();

    // Distinct from nudgeRecruitersForCandidates' AWAITING_CANDIDATE query,
    // which has no offerMode filter — only expireStale's query does.
    const awaitingCandidateCall = prisma.interview.findMany.mock.calls.find(
      (c: any[]) => c[0].where?.offerMode !== undefined,
    );
    expect(awaitingCandidateCall).toBeTruthy();
    expect(awaitingCandidateCall[0].where.status).toBe(InterviewStatus.AWAITING_CANDIDATE);
    expect(awaitingCandidateCall[0].where.offerMode).toBe(OfferMode.FIXED);
  });

  it('expires a FIXED interview with no remaining future slot', async () => {
    prisma.interview.findMany.mockImplementation((args: any) => {
      if (args.where?.offerMode === OfferMode.FIXED) {
        return Promise.resolve([{ id: 'int-fixed', slots: [] }]);
      }
      return Promise.resolve([]);
    });

    await scheduler.handleInterviewMaintenance();

    expect(prisma.interview.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['int-fixed'] } },
      data: { status: InterviewStatus.EXPIRED },
    });
  });
});
