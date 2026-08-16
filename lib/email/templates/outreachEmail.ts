// Cold-outreach email to a prospective (not-yet-customer) dental practice —
// content adapted from marketing/outreach-materials.md's "Email 1 — Initial
// Outreach" template, matching the personalization limits documented in
// marketing/personalized-outreach-system.md (Tier 1: public info only,
// never a claimed review-content finding for a practice with no analysis
// run — see docs/OUTREACH-AUTOMATION.md for the fuller context).
//
// One deliberate deviation from outreach-materials.md: that doc's template
// greets by {{first_name}}, sourced from research a human does by hand.
// Outscraper's business-search results (lib/outreach/findProspects.ts)
// don't reliably include an owner's first name, so the auto-drafted
// greeting here is just "Hi,". Every draft is meant to be reviewed — and,
// where the admin happens to know a contact's name, hand-edited — in the
// outreach queue before it's ever sent, not sent as-is. This deviation was
// flagged explicitly when the feature shipped, not silently decided.

export function buildOutreachEmailSubject(practiceName: string): string {
  return `quick question about ${practiceName}'s reviews`;
}

export function buildOutreachDraftBody(opts: {
  practiceName: string;
  sampleReportUrl: string;
  senderName: string;
}): string {
  return [
    "Hi,",
    "",
    "I've been looking at how dental practices keep track of what patients say in reviews — most owners I've talked to only see them one at a time, which makes it hard to notice when the same complaint starts showing up repeatedly.",
    "",
    "I built a small tool called Notabl that reads through a practice's public reviews and sends a plain-language weekly summary — what's going well, what's coming up more often, and what's new.",
    "",
    `Worth a 10-minute look? Here's a sample report so you can see the format before we talk: ${opts.sampleReportUrl}`,
    "",
    opts.senderName,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wraps the admin-edited plain-text email body in the same visual chrome as
 * the other transactional emails (see templates/pilotInviteEmail.ts) — teal
 * header, serif body. The body itself is exactly whatever the admin
 * approved in the outreach queue (see components/admin/OutreachQueue.tsx);
 * this only escapes it and splits it into paragraphs on blank lines, never
 * adds or changes wording.
 */
export function buildOutreachEmailHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`
    )
    .join("\n");

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
                ${paragraphs}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildOutreachEmailText(bodyText: string): string {
  return bodyText;
}
