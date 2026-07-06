import { buildIcs } from './ics.util';

describe('buildIcs', () => {
  const base = {
    uid: 'interview-abc@recdesk.io',
    start: new Date('2026-07-10T09:00:00.000Z'),
    end: new Date('2026-07-10T09:45:00.000Z'),
    summary: 'Interview: Jane Doe — Backend Engineer',
    organizerEmail: 'noreply@recdesk.io',
    organizerName: 'Acme',
    attendees: [
      { name: 'Jane Doe', email: 'jane@example.com' },
      { name: 'Sam Manager', email: 'sam@acme.com' },
    ],
  };

  it('produces a valid VCALENDAR/VEVENT with METHOD:REQUEST', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:interview-abc@recdesk.io');
  });

  it('formats DTSTART/DTEND as UTC matching the duration', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART:20260710T090000Z');
    expect(ics).toContain('DTEND:20260710T094500Z');
  });

  it('includes both attendees and the organizer', () => {
    // Unfold per RFC 5545 (continuation lines start with a space) before matching.
    const ics = buildIcs(base).replace(/\r\n /g, '');
    expect(ics).toContain('ORGANIZER;CN=Acme:mailto:noreply@recdesk.io');
    expect(ics).toContain('mailto:jane@example.com');
    expect(ics).toContain('mailto:sam@acme.com');
    const attendeeCount = (ics.match(/ATTENDEE/g) || []).length;
    expect(attendeeCount).toBe(2);
  });

  it('escapes special characters in text fields', () => {
    const ics = buildIcs({
      ...base,
      summary: 'Chat; about, work\\stuff',
      description: 'Line one\nLine two',
    });
    expect(ics).toContain('SUMMARY:Chat\\; about\\, work\\\\stuff');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('uses CRLF line endings', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('\r\n');
  });

  it('strips CRLF from attendee and organizer mailto values', () => {
    const ics = buildIcs({
      ...base,
      organizerEmail: 'noreply@recdesk.io\r\nX-INJECTED:evil',
      attendees: [
        { name: 'Jane Doe', email: 'jane@example.com\r\nX-INJECTED:evil' },
      ],
    });
    const lines = ics.replace(/\r\n /g, '').split('\r\n');

    // The injected CRLF must not have produced a standalone injected property line.
    expect(lines.some((l) => l.startsWith('X-INJECTED'))).toBe(false);
    expect(lines).toContainEqual(
      expect.stringContaining('mailto:noreply@recdesk.ioX-INJECTED:evil'),
    );
    expect(lines).toContainEqual(
      expect.stringContaining('mailto:jane@example.comX-INJECTED:evil'),
    );
  });
});
