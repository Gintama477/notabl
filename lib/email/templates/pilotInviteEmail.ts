// Sent by an admin (from the admin panel, once the pilot flow exists — see
// docs/PILOT-ACCESS.md) to invite a specific real dental practice to a free
// pilot. Distinct from the automated system emails above: this one is
// triggered manually, one practice at a time, never in bulk (per the
// explicit "no automated mass outreach" constraint). Mirrors the same
// visual style as the other transactional emails for consistency.

export type PilotInviteEmailInput = {
  practiceName: string;
  recipientName: string | null;
  loginUrl: string;
  senderName: string;
};

export function buildPilotInviteEmailSubject(input: PilotInviteEmailInput): string {
  return `Free early access to Notabl for ${input.practiceName}`;
}

export function buildPilotInviteEmailHtml(input: PilotInviteEmailInput): string {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
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
                <p style="margin:0 0 16px;color:#0f172a;font-size:16px;line-height:1.5;">${greeting}</p>
                <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">
                  We're testing an early product that turns a practice's patient reviews into a plain-
                  language weekly summary — recurring praise, complaints, and what's changing — without
                  anyone having to read every review by hand.
                </p>
                <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">
                  We'd like to give <strong>${input.practiceName}</strong> free access to try it. No cost,
                  no obligation to continue — we're mainly looking for honest feedback on whether it's
                  actually useful.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#0f766e;border-radius:6px;">
                      <a href="${input.loginUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">
                        Get Started
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;color:#64748b;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">
                  — ${input.senderName}
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

export function buildPilotInviteEmailText(input: PilotInviteEmailInput): string {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
  return `${greeting}\n\nWe're testing an early product that turns a practice's patient reviews into a plain-language weekly summary — recurring praise, complaints, and what's changing — without anyone having to read every review by hand.\n\nWe'd like to give ${input.practiceName} free access to try it. No cost, no obligation to continue — we're mainly looking for honest feedback on whether it's actually useful.\n\nGet started: ${input.loginUrl}\n\n— ${input.senderName}`;
}
