import {
  utcToZonedWallTime,
  zonedWallTimeToUtc,
} from '../../interviews/utils/timezone.util';
import { TimeRange, rangesOverlap } from '../../interviews/utils/slot-conflicts.util';

export interface ScheduleRuleInput {
  dayOfWeek: number; // 0=Sunday .. 6=Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface ScheduleOverrideInput {
  date: Date; // calendar date (as returned by Prisma's @db.Date, UTC midnight)
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface ScheduleInput {
  timezone: string;
  rules: ScheduleRuleInput[];
  overrides: ScheduleOverrideInput[];
}

export interface SuggestSlotsOptions {
  interviewTimezone: string;
  durationMinutes: number;
  count?: number;
  withinDays?: number;
  now?: Date;
}

export interface SlotGridOptions {
  interviewTimezone: string;
  durationMinutes: number;
  withinDays?: number; // default 14
  stepMinutes?: number; // default 15
  now?: Date;
}

export interface SlotCandidate {
  start: string; // wall-clock "YYYY-MM-DDTHH:mm" in interviewTimezone
  startUtc: string;
  endUtc: string;
}

export interface SlotGridDay {
  date: string; // "YYYY-MM-DD" civil date in interviewTimezone
  slots: SlotCandidate[];
}

interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey({ year, month, day }: CivilDate): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function civilDateInZone(date: Date, timeZone: string): CivilDate {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return { year: map.year, month: map.month, day: map.day };
}

function civilDateFromDbDate(date: Date): CivilDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addCivilDays(base: CivilDate, deltaDays: number): CivilDate {
  const d = new Date(
    Date.UTC(base.year, base.month - 1, base.day) + deltaDays * 86_400_000,
  );
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeekOf({ year, month, day }: CivilDate): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

function resolveWindows(
  key: string,
  civilDate: CivilDate,
  rulesByDay: Map<number, ScheduleRuleInput[]>,
  overridesByDate: Map<string, ScheduleOverrideInput>,
): { startTime: string; endTime: string }[] {
  const override = overridesByDate.get(key);
  if (override) {
    if (!override.isAvailable || !override.startTime || !override.endTime) {
      return [];
    }
    return [{ startTime: override.startTime, endTime: override.endTime }];
  }
  return rulesByDay.get(dayOfWeekOf(civilDate)) ?? [];
}

/**
 * Project a recurring weekly AvailabilitySchedule forward onto real calendar
 * dates and produce the FULL grid of bookable start times for the given
 * duration, sliding across each window at `stepMinutes` increments and
 * excluding anything that overlaps an already-confirmed booking (`booked`)
 * for that interviewer — regardless of the requested duration. Results are
 * converted into `opts.interviewTimezone`, which may differ from the
 * schedule's own timezone, and bucketed by the civil date they land on in
 * that timezone (a late-evening slot in one zone can be the next calendar
 * day in another).
 */
export function computeSlotGrid(
  schedule: ScheduleInput,
  booked: TimeRange[],
  opts: SlotGridOptions,
): SlotGridDay[] {
  const withinDays = opts.withinDays ?? 14;
  const stepMinutes = opts.stepMinutes ?? 15;
  const now = opts.now ?? new Date();
  const duration = opts.durationMinutes;

  const rulesByDay = new Map<number, ScheduleRuleInput[]>();
  for (const rule of schedule.rules) {
    const list = rulesByDay.get(rule.dayOfWeek) ?? [];
    list.push(rule);
    rulesByDay.set(rule.dayOfWeek, list);
  }
  for (const list of rulesByDay.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const overridesByDate = new Map<string, ScheduleOverrideInput>();
  for (const override of schedule.overrides) {
    overridesByDate.set(dateKey(civilDateFromDbDate(override.date)), override);
  }

  const today = civilDateInZone(now, schedule.timezone);
  const byDate = new Map<string, SlotCandidate[]>();

  for (let offset = 0; offset <= withinDays; offset++) {
    const civilDate = addCivilDays(today, offset);
    const key = dateKey(civilDate);
    const windows = resolveWindows(key, civilDate, rulesByDay, overridesByDate);

    for (const window of windows) {
      const windowStart = minutesOf(window.startTime);
      const windowEnd = minutesOf(window.endTime);

      for (
        let t = windowStart;
        t + duration <= windowEnd;
        t += stepMinutes
      ) {
        const wallInSchedule = `${key}T${minutesToHHMM(t)}`;
        const startUtc = zonedWallTimeToUtc(wallInSchedule, schedule.timezone);
        const endUtc = new Date(startUtc.getTime() + duration * 60_000);

        if (startUtc <= now) continue;
        if (booked.some((b) => rangesOverlap({ startsAt: startUtc, endsAt: endUtc }, b))) {
          continue;
        }

        const bucketKey = dateKey(civilDateInZone(startUtc, opts.interviewTimezone));
        const list = byDate.get(bucketKey) ?? [];
        list.push({
          start: utcToZonedWallTime(startUtc, opts.interviewTimezone),
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
        });
        byDate.set(bucketKey, list);
      }
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    }));
}

/**
 * Thin wrapper preserving the flat, count-limited contract used by
 * GET /availability/me/suggested-slots (the manager-page prefill button).
 * Now conflict-aware and no longer limited to a single slot per day.
 */
export function suggestSlots(
  schedule: ScheduleInput,
  booked: TimeRange[],
  opts: SuggestSlotsOptions,
): string[] {
  const count = opts.count ?? 5;
  const grid = computeSlotGrid(schedule, booked, {
    interviewTimezone: opts.interviewTimezone,
    durationMinutes: opts.durationMinutes,
    withinDays: opts.withinDays,
    stepMinutes: 30,
    now: opts.now,
  });
  return grid.flatMap((day) => day.slots.map((s) => s.start)).slice(0, count);
}
