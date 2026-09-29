export interface DigestLine {
  viewName: string;
  count: number;
  href: string;
}

/** The daily "new candidates in your saved views" email. */
export function buildSavedViewDigestEmail(
  firstName: string,
  lines: DigestLine[],
): { subject: string; html: string; text: string } {
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  const subject = `${total} new ${plural(total)} in your saved views`;

  const rows = lines
    .map(
      (line) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;">
            <a href="${escapeHtml(line.href)}" style="color:#1E40AF;text-decoration:none;font-weight:600;">${escapeHtml(line.viewName)}</a>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #E2E8F0;color:#1E293B;font-weight:600;">${line.count} new</td>
        </tr>`,
    )
    .join('');

  const html = baseWrapper(`
    <p style="margin:0 0 16px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
    <p style="margin:0 0 16px;">New candidates were added in the last day that match views you follow:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${rows}
    </table>
    <p style="margin:0;color:#64748B;font-size:13px;">You can turn these alerts off from the Saved views menu on the candidates page.</p>`);

  const text = [
    `Hi ${firstName},`,
    '',
    'New candidates were added in the last day that match views you follow:',
    '',
    ...lines.map((line) => `- ${line.viewName}: ${line.count} new (${line.href})`),
    '',
    'You can turn these alerts off from the Saved views menu on the candidates page.',
  ].join('\n');

  return { subject, html, text };
}

function plural(count: number) {
  return count === 1 ? 'candidate' : 'candidates';
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
