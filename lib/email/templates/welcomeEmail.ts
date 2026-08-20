// Sent once, right after signup completes — orients a brand-new account to
// what just happened (their dashboard is populated with demo data) and what
// to expect next (a triggered alert only when something needs attention,
// not a scheduled email — see lib/alerts/reviewAlerts.ts). Mirrors
// reviewAlertEmail.ts's visual style.

export type WelcomeEmailInput = {
  businessName: string;
  dashboardUrl: string;
};

export function buildWelcomeEmailSubject(): string {
  return "Welcome to Notabl — your dashboard is ready";
}

export function buildWelcomeEmailHtml(input: WelcomeEmailInput): string {
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
                  Welcome — <strong>${input.businessName}</strong>&apos;s dashboard is ready.
                </p>
                <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">
                  We've populated it with demo review data so you can see exactly how Notabl works —
                  what patients praise, what they complain about, and what's changing over time —
                  before connecting your real reviews.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#0f766e;border-radius:6px;">
                      <a href="${input.dashboardUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">
                        View Your Dashboard
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;color:#64748b;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">
                  We'll email you when something actually needs your attention — a review that needs a look,
                  a few new reviews at once, or a shift in your rating. No news is good news; check your
                  dashboard anytime. Questions? Just reply to this email.
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

export function buildWelcomeEmailText(input: WelcomeEmailInput): string {
  return `Welcome — ${input.businessName}'s Notabl dashboard is ready.\n\nWe've populated it with demo review data so you can see exactly how Notabl works before connecting your real reviews.\n\nView your dashboard: ${input.dashboardUrl}\n\nWe'll email you when something actually needs your attention — a review that needs a look, a few new reviews at once, or a shift in your rating. No news is good news; check your dashboard anytime. Questions? Just reply to this email.`;
}
