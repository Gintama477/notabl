// Magic-link login email — mirrors weeklyReportEmail.ts's visual style
// (plain HTML table, no external assets, works in any email client).

export type LoginEmailInput = {
  loginUrl: string;
  expiresInMinutes: number;
};

export function buildLoginEmailSubject(): string {
  return "Your Notabl login link";
}

export function buildLoginEmailHtml(input: LoginEmailInput): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f766e;padding:20px 28px;">
                <span style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.02em;">Notabl</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;color:#0f172a;font-size:16px;line-height:1.5;">
                  Click the button below to log in to your Notabl dashboard.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#0f766e;border-radius:6px;">
                      <a href="${input.loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">
                        Log In to Notabl
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;color:#64748b;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">
                  This link expires in ${input.expiresInMinutes} minutes and can only be used once. If you
                  didn't request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildLoginEmailText(input: LoginEmailInput): string {
  return `Log in to Notabl: ${input.loginUrl}\n\nThis link expires in ${input.expiresInMinutes} minutes and can only be used once. If you didn't request this, you can safely ignore this email.`;
}
