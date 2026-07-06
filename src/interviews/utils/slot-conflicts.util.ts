export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

export function findConflicts<T extends TimeRange>(
  candidates: T[],
  booked: TimeRange[],
): T[] {
  return candidates.filter((c) => booked.some((b) => rangesOverlap(c, b)));
}
