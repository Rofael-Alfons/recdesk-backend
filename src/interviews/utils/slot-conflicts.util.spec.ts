import { findConflicts, rangesOverlap } from './slot-conflicts.util';

function range(startIso: string, endIso: string) {
  return { startsAt: new Date(startIso), endsAt: new Date(endIso) };
}

describe('rangesOverlap', () => {
  it('detects a partial overlap on the right side', () => {
    const a = range('2026-07-07T09:00:00.000Z', '2026-07-07T10:00:00.000Z');
    const b = range('2026-07-07T09:30:00.000Z', '2026-07-07T10:30:00.000Z');
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it('detects a partial overlap on the left side', () => {
    const a = range('2026-07-07T09:30:00.000Z', '2026-07-07T10:30:00.000Z');
    const b = range('2026-07-07T09:00:00.000Z', '2026-07-07T10:00:00.000Z');
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it('detects full containment', () => {
    const a = range('2026-07-07T09:00:00.000Z', '2026-07-07T12:00:00.000Z');
    const b = range('2026-07-07T10:00:00.000Z', '2026-07-07T10:30:00.000Z');
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it('does not consider touching boundaries (end === start) a conflict', () => {
    const a = range('2026-07-07T09:00:00.000Z', '2026-07-07T09:45:00.000Z');
    const b = range('2026-07-07T09:45:00.000Z', '2026-07-07T10:45:00.000Z');
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it('does not consider fully separate ranges a conflict', () => {
    const a = range('2026-07-07T09:00:00.000Z', '2026-07-07T09:45:00.000Z');
    const b = range('2026-07-07T11:00:00.000Z', '2026-07-07T12:00:00.000Z');
    expect(rangesOverlap(a, b)).toBe(false);
  });
});

describe('findConflicts', () => {
  it('returns only the candidates that overlap a booked range', () => {
    const booked = [range('2026-07-07T09:00:00.000Z', '2026-07-07T09:45:00.000Z')];
    const candidates = [
      range('2026-07-07T08:15:00.000Z', '2026-07-07T09:15:00.000Z'), // overlaps
      range('2026-07-07T09:45:00.000Z', '2026-07-07T10:45:00.000Z'), // adjacent, ok
      range('2026-07-07T11:00:00.000Z', '2026-07-07T12:00:00.000Z'), // ok
    ];
    expect(findConflicts(candidates, booked)).toEqual([candidates[0]]);
  });

  it('returns an empty array when nothing is booked', () => {
    const candidates = [range('2026-07-07T09:00:00.000Z', '2026-07-07T09:45:00.000Z')];
    expect(findConflicts(candidates, [])).toEqual([]);
  });
});
