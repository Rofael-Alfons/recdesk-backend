import { Test, TestingModule } from '@nestjs/testing';
import { CandidateStatus } from '@prisma/client';
import { WelcomeEmailScheduler } from './welcome-email.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSendingService } from '../email-sending/email-sending.service';

describe('WelcomeEmailScheduler', () => {
  let scheduler: WelcomeEmailScheduler;
  let prisma: any;
  let emailSending: { sendWelcomeEmail: jest.Mock };

  beforeEach(async () => {
    prisma = {
      candidate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    emailSending = {
      sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WelcomeEmailScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailSendingService, useValue: emailSending },
      ],
    }).compile();

    scheduler = module.get(WelcomeEmailScheduler);
  });

  it('queries HIRED candidates whose start date has arrived and have not been sent a welcome email', async () => {
    await scheduler.handleWelcomeEmails();

    expect(prisma.candidate.findMany).toHaveBeenCalledWith({
      where: {
        status: CandidateStatus.HIRED,
        startDate: { lte: expect.any(Date) },
        welcomeEmailSentAt: null,
      },
      select: { id: true, companyId: true },
    });
  });

  it('sends a welcome email for each eligible candidate', async () => {
    prisma.candidate.findMany.mockResolvedValue([
      { id: 'c1', companyId: 'comp-1' },
      { id: 'c2', companyId: 'comp-2' },
    ]);

    await scheduler.handleWelcomeEmails();

    expect(emailSending.sendWelcomeEmail).toHaveBeenCalledWith('c1', 'comp-1');
    expect(emailSending.sendWelcomeEmail).toHaveBeenCalledWith('c2', 'comp-2');
    expect(emailSending.sendWelcomeEmail).toHaveBeenCalledTimes(2);
  });

  it('continues sending to remaining candidates when one send fails', async () => {
    prisma.candidate.findMany.mockResolvedValue([
      { id: 'c1', companyId: 'comp-1' },
      { id: 'c2', companyId: 'comp-2' },
    ]);
    emailSending.sendWelcomeEmail
      .mockRejectedValueOnce(new Error('SES down'))
      .mockResolvedValueOnce({ success: true });

    await expect(scheduler.handleWelcomeEmails()).resolves.not.toThrow();

    expect(emailSending.sendWelcomeEmail).toHaveBeenCalledTimes(2);
  });

  it('does not run overlapping executions concurrently', async () => {
    let resolveFirst: () => void;
    prisma.candidate.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve([]);
        }),
    );

    const first = scheduler.handleWelcomeEmails();
    const second = scheduler.handleWelcomeEmails();

    resolveFirst!();
    await Promise.all([first, second]);

    expect(prisma.candidate.findMany).toHaveBeenCalledTimes(1);
  });
});
