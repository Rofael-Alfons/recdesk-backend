/**
 * Minimal RFC 5545 iCalendar (.ics) generator for interview invites.
 * Hand-built to avoid an extra dependency; produces a single VEVENT that
 * Google Calendar and Outlook both recognize as an invite (METHOD:REQUEST).
 */

export interface IcsAttendee {
  name?: string;
  email: string;
}

export interface IcsEventInput {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail: string;
  attendees: IcsAttendee[];
  method?: 'REQUEST' | 'CANCEL';
  sequence?: number;
  status?: 'CONFIRMED' | 'CANCELLED';
}

function toIcsDate(date: Date): string {
  // 2026-07-10T09:00:00.000Z -> 20260710T090000Z
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Strip CR/LF from a mailto: value — a stray line break is never legitimate here. */
function sanitizeMailto(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

/**
 * Fold lines longer than 75 octets per RFC 5545 (continuation lines start
 * with a single space).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 74) {
    chunks.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  if (remaining.length) chunks.push(' ' + remaining);
  return chunks.join('\r\n');
}

export function buildIcs(input: IcsEventInput): string {
  const method = input.method ?? 'REQUEST';
  const status = input.status ?? 'CONFIRMED';
  const sequence = input.sequence ?? 0;

  const organizerCn = input.organizerName
    ? `;CN=${escapeText(input.organizerName)}`
    : '';

  const attendeeLines = input.attendees.map((a) => {
    const cn = a.name ? `;CN=${escapeText(a.name)}` : '';
    return `ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${sanitizeMailto(a.email)}`;
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RecDesk//Interview Scheduling//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(input.start)}`,
    `DTEND:${toIcsDate(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.description
      ? [`DESCRIPTION:${escapeText(input.description)}`]
      : []),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    `ORGANIZER${organizerCn}:mailto:${sanitizeMailto(input.organizerEmail)}`,
    ...attendeeLines,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n');
}
