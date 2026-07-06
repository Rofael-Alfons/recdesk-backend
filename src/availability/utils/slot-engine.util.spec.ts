import { computeSlotGrid, suggestSlots } from './slot-engine.util';
import { TimeRange } from '../../interviews/utils/slot-conflicts.util';

// Fixed "now": Monday 2026-07-06 (matches the app's reference date).
const NOW = new Date('2026-07-06T00:00:00.000Z');

describe('suggestSlots', () => {
  it('produces a slot on the next matching weekday, converted into the interview timezone', () => {
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }], // Tuesday
        overrides: [],
      },
      [],
      {
        interviewTimezone: 'America/New_York',
        durationMinutes: 45,
        count: 1,
        now: NOW,
      },
    );

    // 11:00 Cairo (summer, +3) -> 08:00 UTC -> 04:00 America/New_York (EDT, -4)
    expect(result).toEqual(['2026-07-07T04:00']);
  });

  it('skips a date blacked out by an isAvailable:false override, even if the weekly rule allows it', () => {
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        overrides: [
          {
            date: new Date(Date.UTC(2026, 6, 7)),
            isAvailable: false,
            startTime: null,
            endTime: null,
          },
        ],
      },
      [],
      {
        interviewTimezone: 'America/New_York',
        durationMinutes: 45,
        count: 1,
        now: NOW,
      },
    );

    // July 7 is blacked out -> next Tuesday is July 14.
    expect(result).toEqual(['2026-07-14T04:00']);
  });

  it('uses an isAvailable:true override to replace the weekly hours for that date', () => {
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        overrides: [
          {
            date: new Date(Date.UTC(2026, 6, 7)),
            isAvailable: true,
            startTime: '09:00',
            endTime: '10:00',
          },
        ],
      },
      [],
      {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 1,
        now: NOW,
      },
    );

    expect(result).toEqual(['2026-07-07T09:00']);
  });

  it('skips a window too short for the requested duration and falls through to a later window the same day', () => {
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [
          { dayOfWeek: 2, startTime: '11:00', endTime: '11:30' }, // only 30 min
          { dayOfWeek: 2, startTime: '14:00', endTime: '16:00' },
        ],
        overrides: [],
      },
      [],
      {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 1,
        now: NOW,
      },
    );

    expect(result).toEqual(['2026-07-07T14:00']);
  });

  it('stops once count is reached, now packing multiple slots per day instead of one-per-day', () => {
    // Unlike the old first-fit-per-day behavior, the grid engine slides across
    // each window (default 30-min step for suggestSlots), so count:2 is
    // satisfied within the very first matching day.
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        overrides: [],
      },
      [],
      {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 2,
        withinDays: 30,
        now: NOW,
      },
    );

    expect(result).toEqual(['2026-07-07T11:00', '2026-07-07T11:30']);
  });

  it('returns an empty array for a schedule with no rules or overrides at all', () => {
    const result = suggestSlots(
      { timezone: 'Africa/Cairo', rules: [], overrides: [] },
      [],
      { interviewTimezone: 'Africa/Cairo', durationMinutes: 45, now: NOW },
    );

    expect(result).toEqual([]);
  });

  it('skips a slot that overlaps an already-booked range', () => {
    // Booked 11:00-11:45 Cairo on 2026-07-07 (Tuesday).
    const booked: TimeRange[] = [
      {
        startsAt: new Date('2026-07-07T08:00:00.000Z'), // 11:00 Cairo (+3)
        endsAt: new Date('2026-07-07T08:45:00.000Z'), // 11:45 Cairo
      },
    ];
    const result = suggestSlots(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 2, startTime: '11:00', endTime: '19:00' }],
        overrides: [],
      },
      booked,
      {
        interviewTimezone: 'Africa/Cairo',
        durationMinutes: 45,
        count: 1,
        now: NOW,
      },
    );

    // suggestSlots uses a 30-min step, so 11:00 and 11:30 both overlap the
    // 11:00-11:45 booking; the next 30-min-aligned start is 12:00.
    expect(result).toEqual(['2026-07-07T12:00']);
  });
});

describe('computeSlotGrid', () => {
  const sundayNineToTwo = {
    timezone: 'Africa/Cairo',
    rules: [{ dayOfWeek: 0, startTime: '09:00', endTime: '14:00' }], // Sunday
    overrides: [],
  };

  // Sunday 2026-07-12 is the next Sunday after NOW (Monday 2026-07-06).
  const SUNDAY = '2026-07-12';

  function findDay(grid: ReturnType<typeof computeSlotGrid>, date: string) {
    return grid.find((d) => d.date === date);
  }

  it('excludes any 60-minute window overlapping a confirmed 45-minute booking, regardless of the new duration', () => {
    // Booked Sunday 09:00-09:45 Cairo.
    const booked: TimeRange[] = [
      { startsAt: new Date('2026-07-12T06:00:00.000Z'), endsAt: new Date('2026-07-12T06:45:00.000Z') },
    ];

    const grid = computeSlotGrid(sundayNineToTwo, booked, {
      interviewTimezone: 'Africa/Cairo',
      durationMinutes: 60,
      stepMinutes: 15,
      withinDays: 10,
      now: NOW,
    });

    const sunday = findDay(grid, SUNDAY);
    const starts = sunday?.slots.map((s) => s.start.slice(11)) ?? [];

    // Every 60-min window starting at 08:15..09:30 overlaps 09:00-09:45.
    expect(starts).not.toEqual(expect.arrayContaining(['08:15', '08:30', '08:45', '09:00', '09:15', '09:30']));
    // 09:45 onward (60 min fits until 13:00, ending exactly at 14:00) is open.
    expect(starts).toEqual(expect.arrayContaining(['09:45', '10:00', '13:00']));
    expect(starts).not.toContain('13:15'); // 13:15+60=14:15 > 14:00 window end
  });

  it('excludes the exact overlapping window when the new request has the same duration as the booking', () => {
    const booked: TimeRange[] = [
      { startsAt: new Date('2026-07-12T06:00:00.000Z'), endsAt: new Date('2026-07-12T06:45:00.000Z') },
    ];

    const grid = computeSlotGrid(sundayNineToTwo, booked, {
      interviewTimezone: 'Africa/Cairo',
      durationMinutes: 45,
      stepMinutes: 15,
      withinDays: 10,
      now: NOW,
    });

    const starts = findDay(grid, SUNDAY)?.slots.map((s) => s.start.slice(11)) ?? [];
    expect(starts).not.toContain('09:00');
    expect(starts).toContain('09:45');
  });

  it('respects booked ranges alongside a date override that replaces the weekly hours', () => {
    const booked: TimeRange[] = [
      { startsAt: new Date('2026-07-12T06:00:00.000Z'), endsAt: new Date('2026-07-12T06:30:00.000Z') }, // 09:00-09:30 Cairo
    ];
    const grid = computeSlotGrid(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 0, startTime: '09:00', endTime: '14:00' }],
        overrides: [
          { date: new Date(Date.UTC(2026, 6, 12)), isAvailable: true, startTime: '09:00', endTime: '10:00' },
        ],
      },
      booked,
      { interviewTimezone: 'Africa/Cairo', durationMinutes: 30, stepMinutes: 15, withinDays: 10, now: NOW },
    );

    const starts = findDay(grid, SUNDAY)?.slots.map((s) => s.start.slice(11)) ?? [];
    expect(starts).not.toContain('09:00');
    expect(starts).not.toContain('09:15');
    expect(starts).toContain('09:30');
  });

  it('buckets a candidate under the correct civil date in the interview timezone, even when it differs from the schedule timezone', () => {
    // Cairo Sunday 23:00 is still Sunday in Cairo but already Monday-adjacent
    // once shifted far enough west; verify bucketing uses interviewTimezone.
    const grid = computeSlotGrid(
      {
        timezone: 'Africa/Cairo',
        rules: [{ dayOfWeek: 0, startTime: '22:00', endTime: '23:30' }],
        overrides: [],
      },
      [],
      { interviewTimezone: 'America/Los_Angeles', durationMinutes: 30, stepMinutes: 30, withinDays: 10, now: NOW },
    );

    // 22:00 Cairo (+3) = 19:00 UTC = 12:00 America/Los_Angeles (PDT, -7), same civil date.
    const laDate = findDay(grid, SUNDAY);
    expect(laDate?.slots.map((s) => s.start)).toContain(`${SUNDAY}T12:00`);
  });

  it('returns an empty grid for a schedule with no rules or overrides', () => {
    const grid = computeSlotGrid(
      { timezone: 'Africa/Cairo', rules: [], overrides: [] },
      [],
      { interviewTimezone: 'Africa/Cairo', durationMinutes: 45, now: NOW },
    );
    expect(grid).toEqual([]);
  });
});
