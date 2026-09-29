import { ScheduledEmailScheduler } from './scheduled-email.scheduler';
import { ScheduledEmailsService } from './scheduled-emails.service';

describe('ScheduledEmailScheduler', () => {
  let prisma: any;
  let emailSending: { sendTemplateToCandidate: jest.Mock };
  let scheduler: ScheduledEmailScheduler;

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'se-1',
    purpose: 'rejection',
    companyId: 'comp-1',
    candidateId: 'c1',
    templateId: 'tpl-1',
    subjectOverride: null,
    createdById: 'user-1',
    candidate: { status: 'REJECTED', email: 'jane@example.com' },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      scheduledEmail: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    emailSending = {
      sendTemplateToCandidate: jest.fn().mockResolvedValue({ success: true }),
    };
    scheduler = new ScheduledEmailScheduler(prisma, emailSending as any);
  });

  const finalUpdate = () => prisma.scheduledEmail.update.mock.calls[0][0];

  it('claims PENDING -> SENDING before sending and marks it SENT', async () => {
    const outcome = await scheduler.processOne('se-1');

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: { id: 'se-1', status: 'PENDING' },
      data: { status: 'SENDING' },
    });
    expect(emailSending.sendTemplateToCandidate).toHaveBeenCalledWith({
      candidateId: 'c1',
      companyId: 'comp-1',
      templateId: 'tpl-1',
      subjectOverride: null,
      senderUserId: 'user-1',
      actionDetails: { scheduledEmailId: 'se-1', purpose: 'rejection' },
    });
    expect(outcome).toBe('SENT');
    expect(finalUpdate()).toEqual({
      where: { id: 'se-1' },
      data: { status: 'SENT', sentAt: expect.any(Date) },
    });
  });

  it('does nothing when another instance already claimed the row', async () => {
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });

    expect(await scheduler.processOne('se-1')).toBeNull();
    expect(emailSending.sendTemplateToCandidate).not.toHaveBeenCalled();
    expect(prisma.scheduledEmail.update).not.toHaveBeenCalled();
  });

  it('cancels a rejection email when the candidate is no longer rejected', async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(
      row({ candidate: { status: 'SHORTLISTED', email: 'jane@example.com' } }),
    );

    expect(await scheduler.processOne('se-1')).toBe('CANCELLED');
    expect(emailSending.sendTemplateToCandidate).not.toHaveBeenCalled();
    expect(finalUpdate().data).toMatchObject({
      status: 'CANCELLED',
      error: 'Candidate is no longer rejected',
    });
  });

  it('sends bulk emails regardless of candidate status', async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(
      row({ purpose: 'bulk', candidate: { status: 'NEW', email: 'a@b.co' } }),
    );
    expect(await scheduler.processOne('se-1')).toBe('SENT');
  });

  it('fails when the template was deleted or the address is gone', async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValueOnce(row({ templateId: null }));
    expect(await scheduler.processOne('se-1')).toBe('FAILED');
    expect(finalUpdate().data.error).toBe('Email template was deleted');

    prisma.scheduledEmail.findUnique.mockResolvedValueOnce(
      row({ candidate: { status: 'REJECTED', email: null } }),
    );
    expect(await scheduler.processOne('se-1')).toBe('FAILED');
    expect(emailSending.sendTemplateToCandidate).not.toHaveBeenCalled();
  });

  it('records provider failures and thrown errors as FAILED', async () => {
    emailSending.sendTemplateToCandidate.mockResolvedValueOnce({
      success: false,
      error: 'SES throttled',
    });
    expect(await scheduler.processOne('se-1')).toBe('FAILED');
    expect(finalUpdate().data).toEqual({ status: 'FAILED', error: 'SES throttled' });

    emailSending.sendTemplateToCandidate.mockRejectedValueOnce(new Error('boom'));
    expect(await scheduler.processOne('se-1')).toBe('FAILED');
    expect(prisma.scheduledEmail.update.mock.calls[1][0].data.error).toBe('boom');
  });

  it('sweeps due rows in batches and fails stale SENDING rows without retrying them', async () => {
    prisma.scheduledEmail.findMany
      .mockResolvedValueOnce([{ id: 'se-1' }, { id: 'se-2' }])
      .mockResolvedValueOnce([]);
    const processOne = jest.spyOn(scheduler, 'processOne').mockResolvedValue('SENT' as any);

    await scheduler.handleDueEmails();

    const staleCall = prisma.scheduledEmail.updateMany.mock.calls[0][0];
    expect(staleCall.where.status).toBe('SENDING');
    expect(staleCall.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(staleCall.data).toEqual({ status: 'FAILED', error: 'Interrupted while sending' });

    const dueQuery = prisma.scheduledEmail.findMany.mock.calls[0][0];
    expect(dueQuery.where.status).toBe('PENDING');
    expect(dueQuery.where.sendAt.lte).toBeInstanceOf(Date);
    expect(processOne).toHaveBeenCalledTimes(2);
  });

  it('skips a run while one is in progress or during shutdown', async () => {
    scheduler.onModuleDestroy();
    await scheduler.handleDueEmails();
    expect(prisma.scheduledEmail.findMany).not.toHaveBeenCalled();
  });
});

describe('ScheduledEmailsService', () => {
  let prisma: any;
  let service: ScheduledEmailsService;

  beforeEach(() => {
    prisma = {
      scheduledEmail: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ScheduledEmailsService(prisma);
  });

  it('skips the insert for an empty batch', async () => {
    expect(await service.schedule([])).toBe(0);
    expect(prisma.scheduledEmail.createMany).not.toHaveBeenCalled();
  });

  it('only cancels still-pending emails of the caller company', async () => {
    const count = await service.cancel('comp-1', ['se-1', 'se-2'], 'user-1');

    expect(count).toBe(1);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['se-1', 'se-2'] }, companyId: 'comp-1', status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
        cancelledById: 'user-1',
      },
    });
  });

  it('cancels by candidate and purpose, and is a no-op for no candidates', async () => {
    expect(
      await service.cancelPendingForCandidates('comp-1', [], 'rejection', null),
    ).toBe(0);
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();

    await service.cancelPendingForCandidates('comp-1', ['c1'], 'rejection', null);
    expect(prisma.scheduledEmail.updateMany.mock.calls[0][0].where).toEqual({
      companyId: 'comp-1',
      candidateId: { in: ['c1'] },
      purpose: 'rejection',
      status: 'PENDING',
    });
  });

  it('lists company-scoped emails, optionally for one candidate', async () => {
    await service.list('comp-1', 'c1');
    expect(prisma.scheduledEmail.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'comp-1',
      candidateId: 'c1',
    });
  });
});
