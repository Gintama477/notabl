// Triggered alert email — replaces the old calendar-scheduled weekly report
// (see lib/alerts/reviewAlerts.ts for what decides whether to send this at
// all). One email per business per day, never one per review — every
// review/feedback item worth mentioning is bundled into a single send, led
// by the most urgent item (a low-rated review outranks everything else,
// per the alert rules).
//
// Plain HTML table layout (not a heavy framework), same visual style as
// weeklyReportEmail.ts, for maximum email-client compatibility.

export type AlertReviewItem = {
  authorName: string | null;
  rating: number;
  reviewText: string;
};

export type ReviewAlertEmailInput = {
  businessName: string;
  dashboardUrl: string;
  // Reviews rated 3 stars or below since the last alert, most urgent
  // (lowest rating, then newest) first — these get shown in full, since
  // that's what the owner actually needs to see.
  negativeReviews: AlertReviewItem[];
  // Total new reviews since the last alert, of any rating (includes the
  // negativeReviews above).
  newReviewCount: number;
  newFeedbackCount: number;
  ratingBefore: number | null;
  ratingNow: number | null;
};

function ratingMoved(input: ReviewAlertEmailInput): boolean {
  return input.ratingBefore !== null && input.ratingNow !== null && Math.abs(input.ratingNow - input.ratingBefore) >= 0.1;
}

export function buildReviewAlertEmailSubject(input: ReviewAlertEmailInput): string {
  if (input.negativeReviews.length > 0) {
    const worst = input.negativeReviews[0];
    return `A ${worst.rating}-star review needs your attention — ${input.businessName}`;
  }
  if (input.newReviewCount >= 2) {
    return `${input.newReviewCount} new reviews — ${input.businessName}`;
  }
  if (input.newFeedbackCount > 0) {
    return `New private feedback — ${input.businessName}`;
  }
  return `Your rating moved — ${input.businessName}`;
}

export function buildReviewAlertEmailHtml(input: ReviewAlertEmailInput): string {
  const reviewBlocks = input.negativeReviews
    .map(
      (r) => `<div style="margin-bottom:12px;padding:14px;background-color:#fef2f2;border-left:3px solid #b91c1c;border-radius:4px;">
        <p style="margin:0;font-size:12px;font-weight:bold;color:#991b1b;">
          ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} — ${escapeHtml(r.authorName?.trim() || "Anonymous")}
        </p>
        <p style="margin:6px 0 0 0;font-size:14px;color:#334155;white-space:pre-line;">${escapeHtml(r.reviewText)}</p>
      </div>`
    )
    .join("\n");

  const summaryItems: string[] = [];
  if (input.newReviewCount > 0) {
    summaryItems.push(`${input.newReviewCount} new review${input.newReviewCount === 1 ? "" : "s"} since your last alert.`);
  }
  if (input.newFeedbackCount > 0) {
    summaryItems.push(
      `${input.newFeedbackCount} new private feedback submission${input.newFeedbackCount === 1 ? "" : "s"} through your review-request page.`
    );
  }
  if (ratingMoved(input)) {
    summaryItems.push(`Your average rating moved from ${input.ratingBefore!.toFixed(1)} to ${input.ratingNow!.toFixed(1)}.`);
  }

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
                <p style="font-size:13px;color:#64748b;margin:0 0 20px 0;">Here&apos;s what happened with your reviews.</p>

                ${reviewBlocks}

                ${
                  summaryItems.length > 0
                    ? `<ul style="margin:16px 0;padding-left:18px;font-size:13px;color:#334155;">
                        ${summaryItems.map((s) => `<li style="margin-bottom:4px;">${escapeHtml(s)}</li>`).join("\n")}
                      </ul>`
                    : ""
                }

                <a href="${input.dashboardUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:6px;margin-top:8px;">Open Dashboard</a>

                <p style="margin-top:28px;font-size:11px;color:#94a3b8;">
                  You&apos;re receiving this because you have an active Notabl account and something new happened
                  with your reviews. Notabl analyzes publicly available customer reviews only and is not
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

export function buildReviewAlertEmailText(input: ReviewAlertEmailInput): string {
  const lines = [`${input.businessName} — new activity on your reviews`, ""];

  for (const r of input.negativeReviews) {
    lines.push(`${r.rating}/5 stars — ${r.authorName?.trim() || "Anonymous"}`);
    lines.push(r.reviewText);
    lines.push("");
  }

  if (input.newReviewCount > 0) {
    lines.push(`${input.newReviewCount} new review${input.newReviewCount === 1 ? "" : "s"} since your last alert.`);
  }
  if (input.newFeedbackCount > 0) {
    lines.push(
      `${input.newFeedbackCount} new private feedback submission${input.newFeedbackCount === 1 ? "" : "s"} through your review-request page.`
    );
  }
  if (ratingMoved(input)) {
    lines.push(`Your average rating moved from ${input.ratingBefore!.toFixed(1)} to ${input.ratingNow!.toFixed(1)}.`);
  }

  lines.push("", `Open your dashboard: ${input.dashboardUrl}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
