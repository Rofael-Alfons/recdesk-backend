import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterviewLocationType } from '@prisma/client';
import { EmailSendingService } from '../email-sending/email-sending.service';
import { buildIcs, IcsAttendee } from './utils/ics.util';
import { formatInTimeZone } from './utils/timezone.util';

export interface InterviewEmailContext {
  interviewId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  companyName: string;
  interviewerName?: string;
  interviewerEmail?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  additionalAttendees: string[];
  timezone: string;
  durationMinutes: number;
  locationType: InterviewLocationType;
  locationDetails?: string | null;
  message?: string | null;
}

const LOCATION_LABEL: Record<InterviewLocationType, string> = {
  ONLINE: 'Online meeting',
  PHONE: 'Phone call',
  ONSITE: 'On-site',
};

@Injectable()
export class InterviewEmailService {
  private readonly logger = new Logger(InterviewEmailService.name);
  private readonly fromEmail: string;

  constructor(
    private configService: ConfigService,
    private emailSending: EmailSendingService,
  ) {
    this.fromEmail =
      this.configService.get<string>('ses.fromEmail') || 'noreply@recdesk.io';
  }

  /**
   * Email the candidate a link to pick one of the proposed slots.
   */
  async sendBookingInvite(
    ctx: InterviewEmailContext,
    bookingLink: string,
  ): Promise<{ success: boolean; error?: string }> {
    const firstName = ctx.candidateName.trim().split(/\s+/)[0] || 'there';
    const subject = `Pick a time for your ${ctx.jobTitle} interview`;

    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">${escapeHtml(ctx.companyName)} would like to interview you for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role.</p>
      ${ctx.message ? `<p style="margin:0 0 16px;">${escapeHtml(ctx.message)}</p>` : ''}
      <p style="margin:0 0 24px;">Choose whichever time works best for you &mdash; it only takes a few seconds:</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background-color:#1E40AF;border-radius:6px;">
          <a href="${bookingLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Choose your interview time</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;color:#64748B;font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;color:#3B82F6;font-size:13px;word-break:break-all;">${bookingLink}</p>`;

    const text = [
      `Hi ${firstName},`,
      '',
      `${ctx.companyName} would like to interview you for the ${ctx.jobTitle} role.`,
      ...(ctx.message ? ['', ctx.message] : []),
      '',
      'Choose whichever time works best for you:',
      bookingLink,
      '',
      '-- RecDesk AI',
    ].join('\n');

    return this.emailSending.sendCustom(
      ctx.candidateEmail,
      subject,
      baseWrapper(content),
      text,
    );
  }

  /**
   * Email the hiring manager asking them to share their availability so they
   * can act even when they aren't logged into RecDesk.
   */
  async sendAvailabilityRequest(
    ctx: InterviewEmailContext,
    availabilityLink: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!ctx.interviewerEmail) {
      return { success: false, error: 'No interviewer email on file' };
    }
    const firstName =
      ctx.interviewerName?.trim().split(/\s+/)[0] || 'there';
    const subject = `Share your availability to interview ${ctx.candidateName}`;

    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">A candidate is ready to be interviewed for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role at ${escapeHtml(ctx.companyName)}.</p>
      <p style="margin:0 0 24px;">Please share the times that work for you to meet <strong>${escapeHtml(ctx.candidateName)}</strong>. Once you respond, we'll send the booking link to the candidate.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background-color:#1E40AF;border-radius:6px;">
          <a href="${availabilityLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Share your availability</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;color:#64748B;font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;color:#3B82F6;font-size:13px;word-break:break-all;">${availabilityLink}</p>`;

    const text = [
      `Hi ${firstName},`,
      '',
      `A candidate is ready to be interviewed for the ${ctx.jobTitle} role at ${ctx.companyName}.`,
      '',
      `Please share the times that work for you to meet ${ctx.candidateName}:`,
      availabilityLink,
      '',
      '-- RecDesk AI',
    ].join('\n');

    return this.emailSending.sendCustom(
      ctx.interviewerEmail,
      subject,
      baseWrapper(content),
      text,
    );
  }

  /**
   * Email the recruiter once the hiring manager submits availability so they
   * can promptly send the booking link to the candidate.
   */
  async sendAvailabilitySubmitted(
    ctx: InterviewEmailContext,
    actionLink: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!ctx.recruiterEmail) {
      return { success: false, error: 'No recruiter email on file' };
    }
    const firstName = ctx.recruiterName?.trim().split(/\s+/)[0] || 'there';
    const managerName = ctx.interviewerName || 'The hiring manager';
    const subject = `Availability received for ${ctx.candidateName}`;

    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(managerName)}</strong> shared their availability to interview <strong>${escapeHtml(ctx.candidateName)}</strong> for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role.</p>
      <p style="margin:0 0 24px;">Open the candidate to review the proposed times and send the booking link.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background-color:#1E40AF;border-radius:6px;">
          <a href="${actionLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Send the booking link</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;color:#64748B;font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;color:#3B82F6;font-size:13px;word-break:break-all;">${actionLink}</p>`;

    const text = [
      `Hi ${firstName},`,
      '',
      `${managerName} shared their availability to interview ${ctx.candidateName} for the ${ctx.jobTitle} role.`,
      '',
      'Open the candidate to review the proposed times and send the booking link:',
      actionLink,
      '',
      '-- RecDesk AI',
    ].join('\n');

    return this.emailSending.sendCustom(
      ctx.recruiterEmail,
      subject,
      baseWrapper(content),
      text,
    );
  }

  /**
   * Send confirmation + .ics invite to everyone once a slot is booked.
   */
  async sendConfirmations(
    ctx: InterviewEmailContext,
    slotStart: Date,
    slotEnd: Date,
  ): Promise<void> {
    const when = formatInTimeZone(slotStart, ctx.timezone);
    const locationLine = this.locationLine(ctx);

    const ics = buildIcs({
      uid: `interview-${ctx.interviewId}@recdesk.io`,
      start: slotStart,
      end: slotEnd,
      summary: `Interview: ${ctx.candidateName} — ${ctx.jobTitle}`,
      description: this.icsDescription(ctx),
      location: ctx.locationDetails || LOCATION_LABEL[ctx.locationType],
      organizerName: ctx.companyName,
      organizerEmail: this.fromEmail,
      attendees: this.attendees(ctx),
      method: 'REQUEST',
    });

    // Candidate confirmation
    if (ctx.candidateEmail) {
      const firstName = ctx.candidateName.trim().split(/\s+/)[0] || 'there';
      const content = `
        <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
        <p style="margin:0 0 16px;">Your interview for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role at ${escapeHtml(ctx.companyName)} is confirmed.</p>
        ${confirmationDetails(when.full, locationLine, ctx.durationMinutes)}
        <p style="margin:0;color:#64748B;font-size:13px;">A calendar invite is attached. We look forward to speaking with you!</p>`;
      const text = [
        `Hi ${firstName},`,
        '',
        `Your interview for the ${ctx.jobTitle} role at ${ctx.companyName} is confirmed.`,
        '',
        `When: ${when.full}`,
        `Duration: ${ctx.durationMinutes} minutes`,
        `Where: ${locationLine}`,
        '',
        'A calendar invite is attached.',
        '',
        '-- RecDesk AI',
      ].join('\n');
      await this.emailSending.sendWithCalendar(
        ctx.candidateEmail,
        `Interview confirmed — ${ctx.jobTitle} at ${ctx.companyName}`,
        baseWrapper(content),
        text,
        { content: ics, method: 'REQUEST' },
      );
    }

    // Interviewer + recruiter + additional attendees
    const others = [
      ...(ctx.interviewerEmail ? [ctx.interviewerEmail] : []),
      ...(ctx.recruiterEmail ? [ctx.recruiterEmail] : []),
      ...ctx.additionalAttendees,
    ];
    for (const email of [...new Set(others)]) {
      const content = `
        <p style="margin:0 0 16px;">Hi,</p>
        <p style="margin:0 0 16px;"><strong>${escapeHtml(ctx.candidateName)}</strong> booked an interview for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role.</p>
        ${confirmationDetails(when.full, locationLine, ctx.durationMinutes)}
        <p style="margin:0;color:#64748B;font-size:13px;">A calendar invite is attached.</p>`;
      const text = [
        'Hi,',
        '',
        `${ctx.candidateName} booked an interview for the ${ctx.jobTitle} role.`,
        '',
        `When: ${when.full}`,
        `Duration: ${ctx.durationMinutes} minutes`,
        `Where: ${locationLine}`,
        '',
        'A calendar invite is attached.',
        '',
        '-- RecDesk AI',
      ].join('\n');
      await this.emailSending.sendWithCalendar(
        email,
        `Interview booked — ${ctx.candidateName} (${ctx.jobTitle})`,
        baseWrapper(content),
        text,
        { content: ics, method: 'REQUEST' },
      );
    }
  }

  private attendees(ctx: InterviewEmailContext): IcsAttendee[] {
    const list: IcsAttendee[] = [];
    if (ctx.candidateEmail) {
      list.push({ name: ctx.candidateName, email: ctx.candidateEmail });
    }
    if (ctx.interviewerEmail) {
      list.push({ name: ctx.interviewerName, email: ctx.interviewerEmail });
    }
    for (const email of ctx.additionalAttendees) list.push({ email });
    return list;
  }

  private locationLine(ctx: InterviewEmailContext): string {
    const label = LOCATION_LABEL[ctx.locationType];
    return ctx.locationDetails ? `${label} — ${ctx.locationDetails}` : label;
  }

  private icsDescription(ctx: InterviewEmailContext): string {
    const parts = [
      `Interview with ${ctx.candidateName} for the ${ctx.jobTitle} role at ${ctx.companyName}.`,
    ];
    if (ctx.locationDetails) parts.push(`Location: ${ctx.locationDetails}`);
    return parts.join('\n');
  }
}

function confirmationDetails(
  when: string,
  location: string,
  duration: number,
): string {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;border:1px solid #E2E8F0;border-radius:8px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 8px;"><span style="color:#64748B;font-size:13px;">WHEN</span><br><strong style="color:#1E293B;">${escapeHtml(when)}</strong></p>
        <p style="margin:0 0 8px;"><span style="color:#64748B;font-size:13px;">DURATION</span><br><strong style="color:#1E293B;">${duration} minutes</strong></p>
        <p style="margin:0;"><span style="color:#64748B;font-size:13px;">WHERE</span><br><strong style="color:#1E293B;">${escapeHtml(location)}</strong></p>
      </td></tr>
    </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#1E40AF;padding:24px 32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">RecDesk</span>
        </td></tr>
        <tr><td style="padding:32px;color:#1E293B;font-size:15px;line-height:1.6;">
          ${content}
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:12px;text-align:center;">
          &copy; ${new Date().getFullYear()} RecDesk AI &mdash; Hiring Intelligence Platform
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
