/**
 * Timezone helpers for interview scheduling.
 *
 * Slots are entered as wall-clock local times in a given IANA timezone
 * (e.g. a recruiter/manager in Cairo picks "2026-07-10 11:00"). We store the
 * corresponding UTC instant. Uses the built-in Intl API so no external tz
 * dependency is required, and DST (incl. Africa/Cairo) is handled correctly.
 */

interface NaiveDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseNaive(wallTime: string): NaiveDateTime {
  const match = wallTime
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    throw new Error(`Invalid wall-clock datetime: "${wallTime}"`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };
}

/**
 * Offset in ms between the given timezone's local time and UTC at `date`.
 * Positive for timezones ahead of UTC (e.g. Africa/Cairo -> +2h or +3h in DST).
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - date.getTime();
}

/**
 * Convert a wall-clock local time in `timeZone` into the matching UTC Date.
 * Two-pass to resolve DST boundaries correctly.
 */
export function zonedWallTimeToUtc(wallTime: string, timeZone: string): Date {
  const naive = parseNaive(wallTime);
  const utcGuess = Date.UTC(
    naive.year,
    naive.month - 1,
    naive.day,
    naive.hour,
    naive.minute,
    naive.second,
  );

  let offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let result = utcGuess - offset;
  // Refine once in case the first guess landed on the wrong side of a DST shift.
  offset = timeZoneOffsetMs(new Date(result), timeZone);
  result = utcGuess - offset;

  return new Date(result);
}

/**
 * Convert a UTC instant into a wall-clock local string ("YYYY-MM-DDTHH:mm")
 * in the given timezone. Inverse of `zonedWallTimeToUtc`.
 */
export function utcToZonedWallTime(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

/**
 * Human-friendly formatting of a UTC instant in a target timezone, for emails.
 */
export function formatInTimeZone(
  date: Date,
  timeZone: string,
): { date: string; time: string; full: string } {
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);

  // Short timezone label (e.g. "GMT+3")
  const tzLabel =
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'short',
    })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value || timeZone;

  return {
    date: dateStr,
    time: timeStr,
    full: `${dateStr} at ${timeStr} (${tzLabel})`,
  };
}
