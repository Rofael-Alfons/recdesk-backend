import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityRuleDto,
  SlotGridQueryDto,
  SuggestSlotsQueryDto,
  UpsertOverrideDto,
  UpsertScheduleDto,
} from './dto';
import { computeSlotGrid, suggestSlots } from './utils/slot-engine.util';
import { TimeRange } from '../interviews/utils/slot-conflicts.util';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    await this.ensureSchedule(userId);
    return this.findWithIncludes(userId);
  }

  async upsertMine(userId: string, dto: UpsertScheduleDto) {
    this.validateRules(dto.rules);

    const schedule = await this.prisma.availabilitySchedule.upsert({
      where: { userId },
      update: { timezone: dto.timezone ?? undefined },
      create: { userId, timezone: dto.timezone },
    });

    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({
        where: { scheduleId: schedule.id },
      }),
      this.prisma.availabilityRule.createMany({
        data: dto.rules.map((rule) => ({
          scheduleId: schedule.id,
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      }),
    ]);

    return this.findWithIncludes(userId);
  }

  async addOverride(userId: string, dto: UpsertOverrideDto) {
    if (dto.isAvailable && !(dto.startTime && dto.endTime && dto.startTime < dto.endTime)) {
      throw new BadRequestException(
        'startTime and endTime are required, and startTime must be before endTime, when isAvailable is true',
      );
    }

    const schedule = await this.ensureSchedule(userId);

    return this.prisma.availabilityOverride.upsert({
      where: {
        scheduleId_date: { scheduleId: schedule.id, date: new Date(dto.date) },
      },
      create: {
        scheduleId: schedule.id,
        date: new Date(dto.date),
        isAvailable: dto.isAvailable,
        startTime: dto.isAvailable ? dto.startTime : null,
        endTime: dto.isAvailable ? dto.endTime : null,
      },
      update: {
        isAvailable: dto.isAvailable,
        startTime: dto.isAvailable ? dto.startTime : null,
        endTime: dto.isAvailable ? dto.endTime : null,
      },
    });
  }

  async suggestSlots(userId: string, query: SuggestSlotsQueryDto) {
    await this.ensureSchedule(userId);
    const [schedule, booked] = await Promise.all([
      this.findWithIncludes(userId),
      this.getBookedRanges(userId),
    ]);

    return suggestSlots(schedule, booked, {
      interviewTimezone: query.interviewTimezone,
      durationMinutes: query.durationMinutes,
      count: query.count,
      withinDays: query.withinDays,
    });
  }

  /**
   * Full conflict-aware slot grid for `userId`. When `requesterCompanyId` is
   * given (i.e. someone other than the schedule owner is asking, e.g. a
   * recruiter picking times for a teammate), verifies the target belongs to
   * the same company first so a cross-company id can't be probed.
   */
  async getSlotGrid(
    userId: string,
    query: SlotGridQueryDto,
    requesterCompanyId?: string,
  ) {
    if (requesterCompanyId) {
      const target = await this.prisma.user.findFirst({
        where: { id: userId, companyId: requesterCompanyId },
        select: { id: true },
      });
      if (!target) {
        throw new NotFoundException('Team member not found');
      }
    }

    await this.ensureSchedule(userId);
    const [schedule, booked] = await Promise.all([
      this.findWithIncludes(userId),
      this.getBookedRanges(userId),
    ]);

    return computeSlotGrid(schedule, booked, {
      interviewTimezone: query.interviewTimezone,
      durationMinutes: query.durationMinutes,
      withinDays: query.withinDays,
      stepMinutes: query.stepMinutes,
    });
  }

  async removeOverride(userId: string, overrideId: string) {
    const override = await this.prisma.availabilityOverride.findFirst({
      where: { id: overrideId, schedule: { userId } },
    });
    if (!override) {
      throw new NotFoundException('Date override not found');
    }

    await this.prisma.availabilityOverride.delete({ where: { id: overrideId } });
    return { success: true };
  }

  private async getBookedRanges(userId: string): Promise<TimeRange[]> {
    const scheduled = await this.prisma.interview.findMany({
      where: {
        interviewerUserId: userId,
        status: InterviewStatus.SCHEDULED,
        scheduledAt: { not: null },
      },
      select: { scheduledAt: true, durationMinutes: true },
    });
    return scheduled.map((interview) => ({
      startsAt: interview.scheduledAt!,
      endsAt: new Date(
        interview.scheduledAt!.getTime() + interview.durationMinutes * 60_000,
      ),
    }));
  }

  private async ensureSchedule(userId: string) {
    return this.prisma.availabilitySchedule.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private findWithIncludes(userId: string) {
    return this.prisma.availabilitySchedule.findUniqueOrThrow({
      where: { userId },
      include: {
        rules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        overrides: { orderBy: { date: 'asc' } },
      },
    });
  }

  private validateRules(rules: AvailabilityRuleDto[]) {
    const byDay = new Map<number, AvailabilityRuleDto[]>();

    for (const rule of rules) {
      if (rule.startTime >= rule.endTime) {
        throw new BadRequestException(
          `Invalid time range on day ${rule.dayOfWeek}: startTime must be before endTime`,
        );
      }
      const existing = byDay.get(rule.dayOfWeek) ?? [];
      existing.push(rule);
      byDay.set(rule.dayOfWeek, existing);
    }

    for (const [dayOfWeek, dayRules] of byDay) {
      const sorted = [...dayRules].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].endTime > sorted[i + 1].startTime) {
          throw new BadRequestException(`Overlapping time ranges on day ${dayOfWeek}`);
        }
      }
    }
  }
}
