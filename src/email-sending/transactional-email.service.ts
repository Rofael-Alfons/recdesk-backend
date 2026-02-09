import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

/**
 * TransactionalEmailService handles system-level emails:
 * - Password reset
 * - User invitation
 *
 * Falls back to console logging when SendGrid is not configured (dev mode).
 */
@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);
  private readonly fromEmail: string;
  private readonly isConfigured: boolean;
  private readonly frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('sendgrid.apiKey');
    this.fromEmail =
      this.configService.get<string>('sendgrid.fromEmail') ||
      'noreply@recdesk.io';
    this.frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3001';

    if (apiKey && apiKey !== 'your-sendgrid-api-key') {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      this.logger.log('TransactionalEmailService: SendGrid configured');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'TransactionalEmailService: SendGrid not configured - emails will be logged only',
      );
    }
  }

  /**
   * Send a password reset email with a secure link.
   */
  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    userName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const subject = 'Reset your RecDesk password';
    const html = this.buildPasswordResetHtml(userName, resetLink);
    const text = this.buildPasswordResetText(userName, resetLink);

    return this.send(email, subject, html, text);
  }

  /**
   * Send a user invitation email with login credentials.
   */
  async sendUserInvitationEmail(
    email: string,
    tempPassword: string,
    inviterName: string,
    companyName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const subject = `You've been invited to join ${companyName} on RecDesk`;
    const loginUrl = `${this.frontendUrl}/auth/login`;
    const html = this.buildInvitationHtml(
      email,
      tempPassword,
      inviterName,
      companyName,
      loginUrl,
    );
    const text = this.buildInvitationText(
      email,
      tempPassword,
      inviterName,
      companyName,
      loginUrl,
    );

    return this.send(email, subject, html, text);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Transactional email would be sent to: ${to}`);
      this.logger.log(`[DEV MODE] Subject: ${subject}`);
      this.logger.debug(
        `[DEV MODE] Body preview: ${text.substring(0, 300)}...`,
      );
      return { success: true };
    }

    try {
      await sgMail.send({
        to,
        from: { email: this.fromEmail, name: 'RecDesk' },
        subject,
        text,
        html,
      });
      this.logger.log(`Transactional email sent to: ${to} (${subject})`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to send transactional email to ${to}: ${error.message}`,
      );
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // HTML email templates (branded with RecDesk design system)
  // ---------------------------------------------------------------------------

  private baseWrapper(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background-color:#1E40AF;padding:24px 32px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">RecDesk</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#1E293B;font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:12px;text-align:center;">
            &copy; ${new Date().getFullYear()} RecDesk AI &mdash; Hiring Intelligence Platform
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildPasswordResetHtml(userName: string, resetLink: string): string {
    const content = `
      <p style="margin:0 0 16px;">Hi <strong>${userName}</strong>,</p>
      <p style="margin:0 0 16px;">We received a request to reset your password. Click the button below to choose a new password:</p>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="background-color:#1E40AF;border-radius:6px;">
            <a href="${resetLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Reset Password</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;">This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
      <p style="margin:0 0 8px;color:#94A3B8;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 16px;word-break:break-all;color:#3B82F6;font-size:13px;">${resetLink}</p>`;

    return this.baseWrapper(content);
  }

  private buildPasswordResetText(userName: string, resetLink: string): string {
    return [
      `Hi ${userName},`,
      '',
      'We received a request to reset your RecDesk password.',
      '',
      'Click the link below to choose a new password:',
      resetLink,
      '',
      'This link will expire in 1 hour.',
      'If you didn\'t request a password reset, you can safely ignore this email.',
      '',
      '-- RecDesk AI',
    ].join('\n');
  }

  private buildInvitationHtml(
    email: string,
    tempPassword: string,
    inviterName: string,
    companyName: string,
    loginUrl: string,
  ): string {
    const content = `
      <p style="margin:0 0 16px;">Hi there,</p>
      <p style="margin:0 0 16px;"><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on RecDesk.</p>
      <p style="margin:0 0 8px;">Here are your temporary login credentials:</p>
      <table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;width:100%;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:13px;color:#64748B;">Email</p>
            <p style="margin:0 0 16px;font-weight:600;">${email}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#64748B;">Temporary Password</p>
            <p style="margin:0;font-weight:600;font-family:monospace;font-size:16px;letter-spacing:1px;">${tempPassword}</p>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background-color:#1E40AF;border-radius:6px;">
            <a href="${loginUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Log In to RecDesk</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;color:#64748B;font-size:13px;">We recommend changing your password after your first login.</p>`;

    return this.baseWrapper(content);
  }

  private buildInvitationText(
    email: string,
    tempPassword: string,
    inviterName: string,
    companyName: string,
    loginUrl: string,
  ): string {
    return [
      'Hi there,',
      '',
      `${inviterName} has invited you to join ${companyName} on RecDesk.`,
      '',
      'Your temporary login credentials:',
      `  Email: ${email}`,
      `  Password: ${tempPassword}`,
      '',
      `Log in here: ${loginUrl}`,
      '',
      'We recommend changing your password after your first login.',
      '',
      '-- RecDesk AI',
    ].join('\n');
  }
}
