import { zonedWallTimeToUtc, utcToZonedWallTime } from './timezone.util';

describe('zonedWallTimeToUtc', () => {
  it('converts a Cairo summer wall time to the correct UTC instant', () => {
    // Egypt observes DST in summer (UTC+3 as of 2023+). 11:00 Cairo -> 08:00 UTC.
    const utc = zonedWallTimeToUtc('2026-07-10T11:00', 'Africa/Cairo');
    expect(utc.toISOString()).toBe('2026-07-10T08:00:00.000Z');
  });

  it('converts a Cairo winter wall time (UTC+2) to UTC', () => {
    // In winter Cairo is UTC+2. 11:00 -> 09:00 UTC.
    const utc = zonedWallTimeToUtc('2026-01-10T11:00', 'Africa/Cairo');
    expect(utc.toISOString()).toBe('2026-01-10T09:00:00.000Z');
  });

  it('treats a UTC wall time as-is', () => {
    const utc = zonedWallTimeToUtc('2026-07-10T09:00', 'UTC');
    expect(utc.toISOString()).toBe('2026-07-10T09:00:00.000Z');
  });

  it('handles a timezone behind UTC (America/New_York, EDT)', () => {
    // Summer EDT is UTC-4. 09:00 New York -> 13:00 UTC.
    const utc = zonedWallTimeToUtc('2026-07-10T09:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-07-10T13:00:00.000Z');
  });

  it('accepts seconds in the wall time', () => {
    const utc = zonedWallTimeToUtc('2026-07-10T11:00:30', 'Africa/Cairo');
    expect(utc.toISOString()).toBe('2026-07-10T08:00:30.000Z');
  });
});

describe('utcToZonedWallTime', () => {
  it('converts a UTC instant to Cairo summer wall time', () => {
    const wall = utcToZonedWallTime(
      new Date('2026-07-10T08:00:00.000Z'),
      'Africa/Cairo',
    );
    expect(wall).toBe('2026-07-10T11:00');
  });

  it('converts a UTC instant to Cairo winter wall time', () => {
    const wall = utcToZonedWallTime(
      new Date('2026-01-10T09:00:00.000Z'),
      'Africa/Cairo',
    );
    expect(wall).toBe('2026-01-10T11:00');
  });

  it('converts a UTC instant to America/New_York (EDT)', () => {
    const wall = utcToZonedWallTime(
      new Date('2026-07-10T13:00:00.000Z'),
      'America/New_York',
    );
    expect(wall).toBe('2026-07-10T09:00');
  });

  it('round-trips with zonedWallTimeToUtc', () => {
    const original = '2026-07-10T11:00';
    const utc = zonedWallTimeToUtc(original, 'Africa/Cairo');
    expect(utcToZonedWallTime(utc, 'Africa/Cairo')).toBe(original);
  });
});
