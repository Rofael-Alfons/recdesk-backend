import { Injectable, Logger } from '@nestjs/common';
import { EmailSendingService } from '../email-sending/email-sending.service';

export interface DocumentsEmailContext {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  companyName: string;
  recruiterName?: string;
  recruiterEmail?: string;
  message?: string | null;
}

@Injectable()
export class DocumentsEmailService {
  private readonly logger = new Logger(DocumentsEmailService.name);

  constructor(private emailSending: EmailSendingService) {}

  /**
   * Email the candidate the link to upload requested documents. Sent on
   * create and on resend.
   */
  async sendUploadLink(
    ctx: DocumentsEmailContext,
    uploadLink: string,
  ): Promise<{ success: boolean; error?: string }> {
    const firstName = ctx.candidateName.trim().split(/\s+/)[0] || 'there';
    const subject = `Documents needed for your ${ctx.jobTitle} offer`;

    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">Congratulations on your offer for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role at ${escapeHtml(ctx.companyName)}! To finish onboarding, please upload a few documents.</p>
      ${ctx.message ? `<p style="margin:0 0 16px;">${escapeHtml(ctx.message)}</p>` : ''}
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background-color:#1E40AF;border-radius:6px;">
          <a href="${uploadLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Upload your documents</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;color:#64748B;font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;color:#3B82F6;font-size:13px;word-break:break-all;">${uploadLink}</p>
      <p style="margin:0;color:#64748B;font-size:13px;">This link is private to you — please don't share it.</p>`;

    const text = [
      `Hi ${firstName},`,
      '',
      `Congratulations on your offer for the ${ctx.jobTitle} role at ${ctx.companyName}! To finish onboarding, please upload a few documents.`,
      ...(ctx.message ? ['', ctx.message] : []),
      '',
      'Upload your documents here:',
      uploadLink,
      '',
      "This link is private to you — please don't share it.",
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
   * Email the recruiter when a candidate's document status transitions
   * (pending -> partial -> complete). Not sent per-file to avoid noise.
   */
  async sendRecruiterNotification(
    ctx: DocumentsEmailContext,
    statusLabel: string,
    actionLink: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!ctx.recruiterEmail) {
      return { success: false, error: 'No recruiter email on file' };
    }
    const firstName = ctx.recruiterName?.trim().split(/\s+/)[0] || 'there';
    const subject = `Documents ${statusLabel} for ${ctx.candidateName}`;

    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;"><strong>${escapeHtml(ctx.candidateName)}</strong>'s document submission for the <strong>${escapeHtml(ctx.jobTitle)}</strong> role is now <strong>${escapeHtml(statusLabel)}</strong>.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background-color:#1E40AF;border-radius:6px;">
          <a href="${actionLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Review documents</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;color:#64748B;font-size:13px;">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;color:#3B82F6;font-size:13px;word-break:break-all;">${actionLink}</p>`;

    const text = [
      `Hi ${firstName},`,
      '',
      `${ctx.candidateName}'s document submission for the ${ctx.jobTitle} role is now ${statusLabel}.`,
      '',
      'Review documents:',
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
        <tr><td style="padding:32px;color:#1E293B;font-size:15px;line-height:1.6;">${content}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
