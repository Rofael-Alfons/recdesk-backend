import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InterviewLocationType,
  InterviewStatus,
  NotificationType,
  OfferMode,
  SlotSource,
} from '@prisma/client';
import { InterviewsService } from './interviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { InterviewEmailService } from './interview-email.service';
import { AvailabilityService } from '../availability/availability.service';

const USER = {
  id: 'user-1',
  companyId: 'comp-1',
  firstName: 'Sam',
  lastName: 'Recruiter',
} as any;

function makeInterview(overrides: Partial<any> = {}) {
  return {
    id: 'int-1',
    status: InterviewStatus.AWAITING_CANDIDATE,
    slotSource: SlotSource.MANAGER,
    offerMode: OfferMode.FIXED,
    durationMinutes: 45,
    timezone: 'Africa/Cairo',
    locationType: InterviewLocationType.ONLINE,
    locationDetails: null,
    message: null,
    additionalAttendees: [],
    scheduledAt: null,
    managerRespondedAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    bookingToken: 'tok-123',
    candidateId: 'cand-1',
    companyId: 'comp-1',
    createdById: 'user-1',
    interviewerUserId: 'mgr-1',
    candidate: { id: 'cand-1', fullName: 'Jane Doe', email: 'jane@example.com' },
    job: { id: 'job-1', title: 'Backend Engineer' },
    interviewer: {
      id: 'mgr-1',
      firstName: 'Mel',
      lastName: 'Manager',
      email: 'mel@acme.com',
    },
    createdBy: {
      id: 'user-1',
      firstName: 'Sam',
      lastName: 'Recruiter',
      email: 'sam@acme.com',
    },
    company: { name: 'Acme' },
    slots: [],
    ...overrides,
  };
}

describe('InterviewsService', () => {
  let service: InterviewsService;
  let prisma: any;
  let notifications: { createNotification: jest.Mock };
  let billing: { trackUsage: jest.Mock };
  let email: {
    sendBookingInvite: jest.Mock;
    sendConfirmations: jest.Mock;
    sendAvailabilityRequest: jest.Mock;
    sendAvailabilitySubmitted: jest.Mock;
  };
  let availability: { getMine: jest.Mock; getSlotGrid: jest.Mock };

  beforeEach(async () => {
    prisma = {
      candidate: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findFirst: jest.fn() },
      interview: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      interviewSlot: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'live-slot-1' }),
      },
      candidateAction: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    billing = { trackUsage: jest.fn().mockResolvedValue({}) };
    email = {
      sendBookingInvite: jest.fn().mockResolvedValue({ success: true }),
      sendConfirmations: jest.fn().mockResolvedValue(undefined),
      sendAvailabilityRequest: jest.fn().mockResolvedValue({ success: true }),
      sendAvailabilitySubmitted: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    availability = {
      getMine: jest.fn().mockResolvedValue({ rules: [{ dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }] }),
      getSlotGrid: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 'http://localhost:3001' },
        },
        { provide: NotificationsService, useValue: notifications },
        { provide: BillingService, useValue: billing },
        { provide: InterviewEmailService, useValue: email },
        { provide: AvailabilityService, useValue: availability },
      ],
    }).compile();

    service = module.get(InterviewsService);
  });

  describe('create', () => {
    it('request_manager path -> AWAITING_MANAGER and notifies the manager', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        fullName: 'Jane Doe',
        job: { id: 'job-1', title: 'Backend Engineer' },
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'mgr-1',
        firstName: 'Mel',
        lastName: 'Manager',
      });
      prisma.interview.create.mockResolvedValue(
        makeInterview({ status: InterviewStatus.AWAITING_MANAGER }),
      );

      await service.create(
        { candidateId: 'cand-1', interviewerUserId: 'mgr-1' },
        USER,
      );

      const createArg = prisma.interview.create.mock.calls[0][0];
      expect(createArg.data.status).toBe(InterviewStatus.AWAITING_MANAGER);
      expect(createArg.data.interviewerUserId).toBe('mgr-1');
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
          userId: 'mgr-1',
        }),
      );
      expect(email.sendAvailabilityRequest).toHaveBeenCalledWith(
        expect.objectContaining({ interviewerEmail: 'mel@acme.com' }),
        expect.stringContaining('/interviews/availability/int-1'),
      );
    });

    it('rejects a candidate that is not assigned to a job', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        fullName: 'Jane Doe',
        job: null,
      });
      await expect(
        service.create(
          { candidateId: 'cand-1', interviewerUserId: 'mgr-1' },
          USER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('manual_slots path -> slotSource RECRUITER, AWAITING_CANDIDATE, converts tz to UTC', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        fullName: 'Jane Doe',
        job: { id: 'job-1', title: 'Backend Engineer' },
      });
      prisma.interview.create.mockResolvedValue(makeInterview());

      await service.create(
        {
          candidateId: 'cand-1',
          mode: 'manual_slots' as any,
          slots: ['2026-07-10T11:00'],
        },
        USER,
      );

      const createArg = prisma.interview.create.mock.calls[0][0];
      expect(createArg.data.slotSource).toBe(SlotSource.RECRUITER);
      expect(createArg.data.status).toBe(InterviewStatus.AWAITING_CANDIDATE);
      // 11:00 Africa/Cairo (summer, UTC+3) -> 08:00 UTC
      const slot = createArg.data.slots.createMany.data[0];
      expect(slot.startsAt.toISOString()).toBe('2026-07-10T08:00:00.000Z');
      expect(slot.endsAt.toISOString()).toBe('2026-07-10T08:45:00.000Z');
    });

    it('throws NotFound when the candidate is not in the caller company', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ candidateId: 'nope', interviewerUserId: 'mgr-1' }, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects request_manager without an interviewer', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        fullName: 'Jane Doe',
        job: { id: 'job-1', title: 'Backend Engineer' },
      });
      await expect(
        service.create({ candidateId: 'cand-1' }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a manual slot that overlaps an existing confirmed booking for the chosen interviewer', async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        fullName: 'Jane Doe',
        job: { id: 'job-1', title: 'Backend Engineer' },
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'mgr-1',
        firstName: 'Mel',
        lastName: 'Manager',
      });
      // 2026-07-10T11:00 Africa/Cairo -> 08:00-08:45 UTC; an existing booking
      // for the same interviewer overlaps it.
      prisma.interview.findMany.mockResolvedValue([
        {
          scheduledAt: new Date('2026-07-10T08:15:00.000Z'),
          durationMinutes: 30,
        },
      ]);

      await expect(
        service.create(
          {
            candidateId: 'cand-1',
            interviewerUserId: 'mgr-1',
            mode: 'manual_slots' as any,
            slots: ['2026-07-10T11:00'],
          },
          USER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.interview.create).not.toHaveBeenCalled();
    });
  });

  describe('submitAvailability', () => {
    it('rejects when the caller is not the assigned interviewer', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_MANAGER,
          interviewerUserId: 'someone-else',
        }),
      );
      await expect(
        service.submitAvailability('int-1', ['2026-07-10T11:00'], USER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists slots, flips to AWAITING_CANDIDATE and notifies the recruiter', async () => {
      prisma.interview.findFirst
        .mockResolvedValueOnce(
          makeInterview({
            status: InterviewStatus.AWAITING_MANAGER,
            interviewerUserId: 'user-1',
            createdById: 'recruiter-9',
          }),
        )
        .mockResolvedValueOnce(makeInterview());

      await service.submitAvailability('int-1', ['2026-07-10T11:00'], USER);

      expect(prisma.interviewSlot.deleteMany).toHaveBeenCalledWith({
        where: { interviewId: 'int-1' },
      });
      const updateCall = prisma.interview.update.mock.calls.find(
        (c: any[]) => c[0].data.status === InterviewStatus.AWAITING_CANDIDATE,
      );
      expect(updateCall).toBeTruthy();
      expect(updateCall[0].data.managerRespondedAt).toBeInstanceOf(Date);
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
          userId: 'recruiter-9',
        }),
      );
      expect(email.sendAvailabilitySubmitted).toHaveBeenCalledWith(
        expect.objectContaining({ recruiterEmail: 'sam@acme.com' }),
        expect.stringContaining('/candidates/cand-1'),
      );
    });

    it('rejects a submitted slot that overlaps an existing confirmed booking for this interviewer', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_MANAGER,
          interviewerUserId: 'user-1',
          createdById: 'recruiter-9',
        }),
      );
      // 2026-07-10T11:00 Africa/Cairo -> 08:00-08:45 UTC.
      prisma.interview.findMany.mockResolvedValue([
        {
          scheduledAt: new Date('2026-07-10T08:15:00.000Z'),
          durationMinutes: 30,
        },
      ]);

      await expect(
        service.submitAvailability('int-1', ['2026-07-10T11:00'], USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.interviewSlot.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('shareLiveAvailability', () => {
    it('rejects when the caller is not the assigned interviewer', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_MANAGER,
          interviewerUserId: 'someone-else',
        }),
      );
      await expect(
        service.shareLiveAvailability('int-1', USER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the interview is not AWAITING_MANAGER', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          interviewerUserId: 'user-1',
        }),
      );
      await expect(
        service.shareLiveAvailability('int-1', USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects with a clear message when the interviewer has no weekly hours set', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_MANAGER,
          interviewerUserId: 'user-1',
        }),
      );
      availability.getMine.mockResolvedValue({ rules: [] });

      await expect(
        service.shareLiveAvailability('int-1', USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.interview.update).not.toHaveBeenCalled();
    });

    it('flips to AWAITING_CANDIDATE/LIVE without writing any slots, and notifies the recruiter', async () => {
      prisma.interview.findFirst.mockResolvedValueOnce(
        makeInterview({
          status: InterviewStatus.AWAITING_MANAGER,
          interviewerUserId: 'user-1',
          createdById: 'recruiter-9',
        }),
      ).mockResolvedValueOnce(makeInterview());

      await service.shareLiveAvailability('int-1', USER);

      expect(prisma.interview.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: expect.objectContaining({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.LIVE,
        }),
      });
      expect(prisma.interviewSlot.createMany).not.toHaveBeenCalled();
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
          userId: 'recruiter-9',
        }),
      );
    });
  });

  describe('getPublicSlotGrid', () => {
    it('returns NotFound for an unknown token', async () => {
      prisma.interview.findUnique.mockResolvedValue(null);
      await expect(
        service.getPublicSlotGrid('bad', { withinDays: 14, stepMinutes: 15 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the interview is FIXED offer mode', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        status: InterviewStatus.AWAITING_CANDIDATE,
        offerMode: OfferMode.FIXED,
        interviewerUserId: 'mgr-1',
        durationMinutes: 45,
        timezone: 'Africa/Cairo',
      });
      await expect(
        service.getPublicSlotGrid('tok-123', { withinDays: 14, stepMinutes: 15 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the interview is no longer AWAITING_CANDIDATE', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        status: InterviewStatus.SCHEDULED,
        offerMode: OfferMode.LIVE,
        interviewerUserId: 'mgr-1',
        durationMinutes: 45,
        timezone: 'Africa/Cairo',
      });
      await expect(
        service.getPublicSlotGrid('tok-123', { withinDays: 14, stepMinutes: 15 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates to availability.getSlotGrid with the interview’s own duration/timezone', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        status: InterviewStatus.AWAITING_CANDIDATE,
        offerMode: OfferMode.LIVE,
        interviewerUserId: 'mgr-1',
        durationMinutes: 60,
        timezone: 'Africa/Cairo',
      });
      const grid = [{ date: '2026-07-12', slots: [{ start: '2026-07-12T09:00', startUtc: 'x', endUtc: 'y' }] }];
      availability.getSlotGrid.mockResolvedValue(grid);

      const result = await service.getPublicSlotGrid('tok-123', {
        withinDays: 21,
        stepMinutes: 10,
      });

      expect(availability.getSlotGrid).toHaveBeenCalledWith('mgr-1', {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 60,
        withinDays: 21,
        stepMinutes: 10,
      });
      expect(result).toBe(grid);
    });
  });

  describe('book', () => {
    it('rejects when the interview is not AWAITING_CANDIDATE (idempotency)', async () => {
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({ status: InterviewStatus.SCHEDULED }),
      );
      await expect(service.book('tok-123', { slotId: 'slot-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('books a valid slot -> SCHEDULED, candidate INTERVIEWING, logs action, sends invites', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          slots: [
            {
              id: 'slot-1',
              startsAt: future,
              endsAt: new Date(future.getTime() + 45 * 60000),
            },
          ],
        }),
      );

      const result = await service.book('tok-123', { slotId: 'slot-1' });

      expect(result.success).toBe(true);
      const interviewUpdate = prisma.interview.updateMany.mock.calls[0][0];
      expect(interviewUpdate.where).toEqual({
        id: 'int-1',
        status: InterviewStatus.AWAITING_CANDIDATE,
      });
      expect(interviewUpdate.data.status).toBe(InterviewStatus.SCHEDULED);
      expect(interviewUpdate.data.scheduledSlotId).toBe('slot-1');
      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        data: { status: 'INTERVIEWING' },
      });
      const actionCall = prisma.candidateAction.create.mock.calls[0][0];
      expect(actionCall.data.action).toBe('interview_scheduled');
      expect(email.sendConfirmations).toHaveBeenCalledWith(
        expect.objectContaining({ recruiterEmail: 'sam@acme.com' }),
        expect.any(Date),
        expect.any(Date),
      );
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.INTERVIEW_SCHEDULED }),
      );
    });

    it('rejects booking a slot that does not belong to the interview', async () => {
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          slots: [],
        }),
      );
      await expect(service.book('tok-123', { slotId: 'ghost' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns NotFound for an unknown booking token', async () => {
      prisma.interview.findUnique.mockResolvedValue(null);
      await expect(service.book('bad', { slotId: 'slot-1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects with a Conflict when a concurrent request already booked this interview (race)', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          slots: [
            { id: 'slot-1', startsAt: future, endsAt: new Date(future.getTime() + 45 * 60000) },
          ],
        }),
      );
      // Simulates a second concurrent request winning the race first.
      prisma.interview.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.book('tok-123', { slotId: 'slot-1' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.candidate.update).not.toHaveBeenCalled();
      expect(prisma.candidateAction.create).not.toHaveBeenCalled();
    });

    it('rejects with a Conflict when another interview for the same interviewer overlaps the slot being booked', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          interviewerUserId: 'mgr-1',
          slots: [
            { id: 'slot-1', startsAt: future, endsAt: new Date(future.getTime() + 45 * 60000) },
          ],
        }),
      );
      // Another interview for the same interviewer was just confirmed, overlapping this slot.
      prisma.interview.findMany.mockResolvedValue([
        { scheduledAt: future, durationMinutes: 30 },
      ]);

      await expect(service.book('tok-123', { slotId: 'slot-1' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });

    it('prunes overlapping open slots on sibling interviews for the same interviewer, but leaves one with a remaining slot alone', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const slotEnd = new Date(future.getTime() + 45 * 60000);
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          interviewerUserId: 'mgr-1',
          slots: [{ id: 'slot-1', startsAt: future, endsAt: slotEnd }],
        }),
      );
      prisma.interview.findMany.mockResolvedValue([]); // no other confirmed conflicts
      prisma.interviewSlot.findMany
        .mockResolvedValueOnce([{ id: 'sibling-slot-1', interviewId: 'int-B' }]) // overlapping siblings
        .mockResolvedValueOnce([{ interviewId: 'int-B' }]); // int-B still has a future slot left

      await service.book('tok-123', { slotId: 'slot-1' });

      expect(prisma.interviewSlot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['sibling-slot-1'] } },
      });
      const expireCall = prisma.interview.updateMany.mock.calls.find(
        (c: any[]) => c[0].data?.status === InterviewStatus.EXPIRED,
      );
      expect(expireCall).toBeUndefined();
    });

    it('auto-expires a sibling interview left with zero future slots after pruning', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const slotEnd = new Date(future.getTime() + 45 * 60000);
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          interviewerUserId: 'mgr-1',
          slots: [{ id: 'slot-1', startsAt: future, endsAt: slotEnd }],
        }),
      );
      prisma.interview.findMany.mockResolvedValue([]);
      prisma.interviewSlot.findMany
        .mockResolvedValueOnce([{ id: 'sibling-slot-1', interviewId: 'int-B' }])
        .mockResolvedValueOnce([]); // int-B has nothing left

      await service.book('tok-123', { slotId: 'slot-1' });

      const expireCall = prisma.interview.updateMany.mock.calls.find(
        (c: any[]) => c[0].data?.status === InterviewStatus.EXPIRED,
      );
      expect(expireCall).toBeTruthy();
      expect(expireCall[0].where).toEqual({ id: { in: ['int-B'] } });
    });

    it('LIVE mode: resolves the requested time against a fresh grid and creates exactly one slot', async () => {
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.LIVE,
          interviewerUserId: 'mgr-1',
          slots: [],
        }),
      );
      const startUtc = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const endUtc = new Date(new Date(startUtc).getTime() + 45 * 60000).toISOString();
      availability.getSlotGrid.mockResolvedValue([
        { date: '2026-07-12', slots: [{ start: '2026-07-12T09:00', startUtc, endUtc }] },
      ]);

      const result = await service.book('tok-123', { start: '2026-07-12T09:00' });

      expect(availability.getSlotGrid).toHaveBeenCalledWith('mgr-1', expect.objectContaining({
        withinDays: 60,
        stepMinutes: 5,
      }));
      expect(prisma.interviewSlot.create).toHaveBeenCalledWith({
        data: { interviewId: 'int-1', startsAt: new Date(startUtc), endsAt: new Date(endUtc) },
      });
      const scheduleUpdate = prisma.interview.update.mock.calls.find(
        (c: any[]) => c[0].data?.scheduledSlotId,
      );
      expect(scheduleUpdate[0].data.scheduledSlotId).toBe('live-slot-1');
      expect(result.success).toBe(true);
    });

    it('LIVE mode: rejects with Conflict when the requested time is no longer in a freshly computed grid', async () => {
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.LIVE,
          interviewerUserId: 'mgr-1',
          slots: [],
        }),
      );
      availability.getSlotGrid.mockResolvedValue([]); // the time is no longer available

      await expect(
        service.book('tok-123', { start: '2026-07-12T09:00' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.interviewSlot.create).not.toHaveBeenCalled();
    });

    it('LIVE mode: rejects when no start time is provided', async () => {
      prisma.interview.findUnique.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.LIVE,
          interviewerUserId: 'mgr-1',
          slots: [],
        }),
      );
      await expect(service.book('tok-123', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('sendToCandidate', () => {
    it('rejects a FIXED-offer interview with no slots to offer', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.FIXED,
          slots: [],
        }),
      );
      await expect(service.sendToCandidate('int-1', USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows a LIVE-offer interview with no pre-materialized slots', async () => {
      prisma.interview.findFirst.mockResolvedValue(
        makeInterview({
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.LIVE,
          slots: [],
        }),
      );
      const result = await service.sendToCandidate('int-1', USER);
      expect(result.success).toBe(true);
    });
  });

  describe('getUpcoming', () => {
    it('filters by company, SCHEDULED status, future slots and the current user', async () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      prisma.interview.findMany.mockResolvedValue([
        makeInterview({
          status: InterviewStatus.SCHEDULED,
          scheduledAt: future,
        }),
      ]);

      const result = await service.getUpcoming(USER);

      const where = prisma.interview.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe('comp-1');
      expect(where.status).toBe(InterviewStatus.SCHEDULED);
      expect(where.scheduledAt.gte).toBeInstanceOf(Date);
      expect(where.OR).toEqual([
        { createdById: 'user-1' },
        { interviewerUserId: 'user-1' },
      ]);
      expect(prisma.interview.findMany.mock.calls[0][0].orderBy).toEqual({
        scheduledAt: 'asc',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('int-1');
    });
  });
});
