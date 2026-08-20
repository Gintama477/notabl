// Retention safety net — sent instead of a review alert when a business has
// had NO email (alert or summary) in 30 days, so a quiet practice never
// goes fully silent and forgets they're paying (see
// lib/alerts/reviewAlerts.ts). Short by design: current rating, total
// reviews, top positive/negative theme, dashboard link. Same visual style
// as reviewAlertEmail.ts/weeklyReportEmail.ts for consistency across the
// three transactional emails.

export type MonthlySummaryEmailInput = {
  businessName: string;
  dashboardUrl: string;
  avgRating: number;
  totalReviews: number;
  topPositiveThemeLabel: string | null;
  topPositiveThemeSummary: string | null;
  topNegativeThemeLabel: string | null;
  topNegativeThemeSummary: string | null;
};

export function buildMonthlySummaryEmailSubject(input: MonthlySummaryEmailInput): string {
  return `Your monthly Notabl summary — ${input.businessName}`;
}

export function buildMonthlySummaryEmailHtml(input: MonthlySummaryEmailInput): string {
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
              <td style="padding:28px;font-family:Arial,sans-serif;color:#1c2530;">
                <h1 style="font-size:20px;margin:0 0 4px 0;">${escapeHtml(input.businessName)}</h1>
                <p style="font-size:13px;color:#64748b;margin:0 0 20px 0;">
                  It&apos;s been a quiet month for new reviews — here&apos;s where things stand.
                </p>

                <div style="margin-bottom:20px;padding:14px;background-color:#f0fdfa;border-radius:4px;">
                  <p style="margin:0;font-size:24px;font-weight:bold;color:#115e59;">${input.avgRating.toFixed(1)} / 5</p>
                  <p style="margin:4px 0 0 0;font-size:13px;color:#334155;">
                    Average rating across ${input.totalReviews} review${input.totalReviews === 1 ? "" : "s"}.
                  </p>
                </div>

                ${
                  input.topPositiveThemeLabel
                    ? `<div style="margin-bottom:16px;padding:14px;background-color:#f0fdfa;border-left:3px solid #0f766e;border-radius:4px;">
                        <p style="margin:0;font-size:12px;font-weight:bold;color:#115e59;text-transform:uppercase;letter-spacing:0.03em;">Top positive theme</p>
                        <p style="margin:4px 0 0 0;font-size:14px;color:#334155;">${escapeHtml(input.topPositiveThemeLabel)} — ${escapeHtml(input.topPositiveThemeSummary || "")}</p>
                      </div>`
                    : ""
                }

                ${
                  input.topNegativeThemeLabel
                    ? `<div style="margin-bottom:20px;padding:14px;background-color:#fef2f2;border-left:3px solid #b91c1c;border-radius:4px;">
                        <p style="margin:0;font-size:12px;font-weight:bold;color:#991b1b;text-transform:uppercase;letter-spacing:0.03em;">Top negative theme</p>
                        <p style="margin:4px 0 0 0;font-size:14px;color:#334155;">${escapeHtml(input.topNegativeThemeLabel)} — ${escapeHtml(input.topNegativeThemeSummary || "")}</p>
                      </div>`
                    : ""
                }

                <a href="${input.dashboardUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:6px;">Open Full Dashboard</a>

                <p style="margin-top:28px;font-size:11px;color:#94a3b8;">
                  You&apos;re receiving this because you have an active Notabl account. We only email when there&apos;s
                  something new — this monthly note is the exception, sent because there hasn&apos;t been anything
                  to alert you about. Notabl analyzes publicly available customer reviews only and is not
                  affiliated with Google, Yelp, or any review platform.
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

export function buildMonthlySummaryEmailText(input: MonthlySummaryEmailInput): string {
  const lines = [
    `${input.businessName} — your monthly Notabl summary`,
    "",
    `Average rating: ${input.avgRating.toFixed(1)} / 5 across ${input.totalReviews} review${input.totalReviews === 1 ? "" : "s"}.`,
  ];
  if (input.topPositiveThemeLabel) {
    lines.push(`Top positive theme: ${input.topPositiveThemeLabel} — ${input.topPositiveThemeSummary || ""}`);
  }
  if (input.topNegativeThemeLabel) {
    lines.push(`Top negative theme: ${input.topNegativeThemeLabel} — ${input.topNegativeThemeSummary || ""}`);
  }
  lines.push("", `Open your full dashboard: ${input.dashboardUrl}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
