// Weekly report email — kept short per spec: top insight, most important
// complaint, most important positive trend, and a CTA to the full dashboard.
// Plain HTML table layout (not a heavy framework) for maximum email-client
// compatibility. Used by lib/email/send.ts (Phase 2 automation) and by the
// /api/email/preview route for reviewing the template without sending.

export type WeeklyReportEmailInput = {
  businessName: string;
  dashboardUrl: string;
  periodLabel: string;
  topPositiveThemeLabel: string | null;
  topPositiveThemeSummary: string | null;
  topComplaintLabel: string | null;
  topComplaintSummary: string | null;
  issuesNeedingAttentionCount: number;
};

export function buildWeeklyReportEmailSubject(input: WeeklyReportEmailInput): string {
  if (input.issuesNeedingAttentionCount > 0) {
    return `Your Notabl Report — ${input.issuesNeedingAttentionCount} issue${
      input.issuesNeedingAttentionCount === 1 ? "" : "s"
    } deserve${input.issuesNeedingAttentionCount === 1 ? "s" : ""} attention this week`;
  }
  return `Your Notabl Report — ${input.businessName}`;
}

export function buildWeeklyReportEmailHtml(input: WeeklyReportEmailInput): string {
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
                <p style="font-size:13px;color:#64748b;margin:0 0 20px 0;">${escapeHtml(input.periodLabel)}</p>

                ${
                  input.topComplaintLabel
                    ? `<div style="margin-bottom:16px;padding:14px;background-color:#fef2f2;border-left:3px solid #b91c1c;border-radius:4px;">
                        <p style="margin:0;font-size:12px;font-weight:bold;color:#991b1b;text-transform:uppercase;letter-spacing:0.03em;">Most important complaint</p>
                        <p style="margin:4px 0 0 0;font-size:14px;color:#334155;">${escapeHtml(input.topComplaintLabel)} — ${escapeHtml(input.topComplaintSummary || "")}</p>
                      </div>`
                    : ""
                }

                ${
                  input.topPositiveThemeLabel
                    ? `<div style="margin-bottom:20px;padding:14px;background-color:#f0fdfa;border-left:3px solid #0f766e;border-radius:4px;">
                        <p style="margin:0;font-size:12px;font-weight:bold;color:#115e59;text-transform:uppercase;letter-spacing:0.03em;">Most important positive trend</p>
                        <p style="margin:4px 0 0 0;font-size:14px;color:#334155;">${escapeHtml(input.topPositiveThemeLabel)} — ${escapeHtml(input.topPositiveThemeSummary || "")}</p>
                      </div>`
                    : ""
                }

                <a href="${input.dashboardUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:6px;">Open Full Dashboard</a>

                <p style="margin-top:28px;font-size:11px;color:#94a3b8;">
                  You're receiving this because you have an active Notabl account. Notabl analyzes
                  publicly available customer reviews only and is not affiliated with Google, Yelp, or any
                  review platform.
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

export function buildWeeklyReportEmailText(input: WeeklyReportEmailInput): string {
  const lines = [
    `${input.businessName} — ${input.periodLabel}`,
    "",
  ];
  if (input.topComplaintLabel) {
    lines.push(`Most important complaint: ${input.topComplaintLabel} — ${input.topComplaintSummary || ""}`);
  }
  if (input.topPositiveThemeLabel) {
    lines.push(`Most important positive trend: ${input.topPositiveThemeLabel} — ${input.topPositiveThemeSummary || ""}`);
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
