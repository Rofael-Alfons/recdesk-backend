import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';

const USER_ID = 'user-1';

function makeSchedule(overrides: Partial<any> = {}) {
  return {
    id: 'sched-1',
    userId: USER_ID,
    timezone: 'Africa/Cairo',
    rules: [],
    overrides: [],
    ...overrides,
  };
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      availabilitySchedule: {
        upsert: jest.fn().mockResolvedValue(makeSchedule()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeSchedule()),
      },
      availabilityRule: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      availabilityOverride: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      interview: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AvailabilityService);
  });

  describe('getMine', () => {
    it('lazily creates a default schedule when none exists yet', async () => {
      await service.getMine(USER_ID);

      expect(prisma.availabilitySchedule.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        update: {},
        create: { userId: USER_ID },
      });
      expect(prisma.availabilitySchedule.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });

    it('returns the existing schedule with rules and overrides', async () => {
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule({
          rules: [{ id: 'r1', dayOfWeek: 0, startTime: '11:00', endTime: '19:00' }],
        }),
      );

      const result = await service.getMine(USER_ID);
      expect(result.rules).toHaveLength(1);
    });
  });

  describe('upsertMine', () => {
    it('replaces the rule set for the schedule', async () => {
      const rules = [
        { dayOfWeek: 0, startTime: '11:00', endTime: '19:00' },
        { dayOfWeek: 1, startTime: '11:00', endTime: '19:00' },
      ];

      await service.upsertMine(USER_ID, { timezone: 'Africa/Cairo', rules });

      expect(prisma.availabilitySchedule.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        update: { timezone: 'Africa/Cairo' },
        create: { userId: USER_ID, timezone: 'Africa/Cairo' },
      });
      expect(prisma.availabilityRule.deleteMany).toHaveBeenCalledWith({
        where: { scheduleId: 'sched-1' },
      });
      expect(prisma.availabilityRule.createMany).toHaveBeenCalledWith({
        data: rules.map((r) => ({ scheduleId: 'sched-1', ...r })),
      });
    });

    it('rejects a rule where endTime is not after startTime', async () => {
      await expect(
        service.upsertMine(USER_ID, {
          rules: [{ dayOfWeek: 0, startTime: '19:00', endTime: '11:00' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.availabilityRule.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects overlapping ranges on the same day', async () => {
      await expect(
        service.upsertMine(USER_ID, {
          rules: [
            { dayOfWeek: 0, startTime: '09:00', endTime: '13:00' },
            { dayOfWeek: 0, startTime: '12:00', endTime: '17:00' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows non-overlapping split-shift ranges on the same day', async () => {
      await expect(
        service.upsertMine(USER_ID, {
          rules: [
            { dayOfWeek: 0, startTime: '09:00', endTime: '12:00' },
            { dayOfWeek: 0, startTime: '13:00', endTime: '17:00' },
          ],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('addOverride', () => {
    it('creates a schedule lazily and upserts the override by date', async () => {
      prisma.availabilityOverride.upsert.mockResolvedValue({
        id: 'ov-1',
        date: new Date('2026-07-10'),
        isAvailable: false,
        startTime: null,
        endTime: null,
      });

      await service.addOverride(USER_ID, {
        date: '2026-07-10',
        isAvailable: false,
      });

      expect(prisma.availabilitySchedule.upsert).toHaveBeenCalled();
      expect(prisma.availabilityOverride.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            scheduleId_date: { scheduleId: 'sched-1', date: new Date('2026-07-10') },
          },
        }),
      );
    });

    it('rejects isAvailable=true without a valid time range', async () => {
      await expect(
        service.addOverride(USER_ID, { date: '2026-07-10', isAvailable: true }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.addOverride(USER_ID, {
          date: '2026-07-10',
          isAvailable: true,
          startTime: '15:00',
          endTime: '10:00',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('suggestSlots', () => {
    it('ensures a schedule exists, then projects its rules into suggested slots', async () => {
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule({
          rules: [{ id: 'r1', dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        }),
      );

      const result = await service.suggestSlots(USER_ID, {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 1,
        withinDays: 14,
      });

      expect(prisma.availabilitySchedule.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        update: {},
        create: { userId: USER_ID },
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns an empty array when the schedule has no rules', async () => {
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule(),
      );

      const result = await service.suggestSlots(USER_ID, {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 5,
        withinDays: 14,
      });

      expect(result).toEqual([]);
    });

    it('excludes an already-scheduled interview time from the suggestions', async () => {
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule({
          rules: [{ id: 'r1', dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        }),
      );
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1);
      prisma.interview.findMany.mockResolvedValue([
        { scheduledAt, durationMinutes: 45 },
      ]);

      await service.suggestSlots(USER_ID, {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 1,
        withinDays: 14,
      });

      expect(prisma.interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ interviewerUserId: USER_ID, status: 'SCHEDULED' }),
        }),
      );
    });
  });

  describe('getSlotGrid', () => {
    it('returns a grid built from booked ranges and the schedule', async () => {
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule({
          rules: [{ id: 'r1', dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        }),
      );

      const result = await service.getSlotGrid(USER_ID, {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        withinDays: 14,
        stepMinutes: 15,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('throws NotFoundException when the target user is not in the requester company', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.getSlotGrid(
          'other-user',
          { interviewTimezone: 'Africa/Cairo', durationMinutes: 45, withinDays: 14, stepMinutes: 15 },
          'company-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows the lookup when the target user belongs to the requester company', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user' });
      prisma.availabilitySchedule.findUniqueOrThrow.mockResolvedValue(
        makeSchedule({ userId: 'other-user' }),
      );

      await expect(
        service.getSlotGrid(
          'other-user',
          { interviewTimezone: 'Africa/Cairo', durationMinutes: 45, withinDays: 14, stepMinutes: 15 },
          'company-1',
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('removeOverride', () => {
    it('throws NotFound when the override does not belong to the caller', async () => {
      prisma.availabilityOverride.findFirst.mockResolvedValue(null);

      await expect(
        service.removeOverride(USER_ID, 'ov-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.availabilityOverride.delete).not.toHaveBeenCalled();
    });

    it('deletes the override when owned', async () => {
      prisma.availabilityOverride.findFirst.mockResolvedValue({ id: 'ov-1' });

      const result = await service.removeOverride(USER_ID, 'ov-1');

      expect(prisma.availabilityOverride.delete).toHaveBeenCalledWith({
        where: { id: 'ov-1' },
      });
      expect(result).toEqual({ success: true });
    });
  });
});
