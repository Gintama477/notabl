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

// Deliberately kept low-key rather than rewritten toward "get more reviews
// for {practice}". This market is cold-pitched review-generation software
// constantly (Podium, Birdeye, NiceJob, Weave), so a subject line that leads
// with getting more reviews pattern-matches to vendor spam and gets deleted
// before the body — which is the part doing the actual differentiating —
// ever gets read. Underselling slightly in the subject is the price of
// getting opened. Revisit if open rates say otherwise.
export function buildOutreachEmailSubject(practiceName: string): string {
  return `quick question about ${practiceName}'s reviews`;
}

// Leads with the PAIRING, never with either half alone. "Get more reviews"
// on its own makes this the fifth such pitch of the month and earns "we
// already use Weave"; "we read your reviews" on its own is the analysis-only
// positioning this replaced. What's differentiated is doing both at $49/mo
// with no contract and no sales call — see marketing/core-sales-message.md.
//
// Constraints this copy has to keep holding:
//   - No claim about THIS practice's actual reviews. The first paragraph
//     talks about the general situation, never a specific finding — no
//     analysis has run for a cold prospect. See
//     marketing/personalized-outreach-system.md (Tier 1).
//   - No numeric review lift ("double your reviews", "4x more"). A QR code
//     makes leaving a review easy; it doesn't guarantee more of them, and
//     there's no customer data to cite. Competitors print multipliers; we
//     don't have the evidence, so we don't.
//   - Nothing implying Notabl messages patients. It's a QR code and a link
//     the practice shares themselves — patient contact data is the one
//     thing this product deliberately never touches (see the patient_feedback
//     comment in lib/db/schema.pg.ts).
//   - The private-feedback path is never framed as heading off bad reviews.
//     That framing is review gating, which Google prohibits; it's simply
//     left out here to keep the email short.
export function buildOutreachDraftBody(opts: {
  practiceName: string;
  sampleReportUrl: string;
  senderName: string;
}): string {
  return [
    "Hi,",
    "",
    "Most dental practices I talk to are in one of two spots with reviews: either they're not really asking for them, or they're coming in steadily and nobody has time to read through what they actually say.",
    "",
    "I built a small tool called Notabl that covers both. You get a QR code for the front desk that lets a patient leave a Google review in a couple of taps, and every review that comes in gets turned into a plain-language weekly summary — what's going well, what's coming up more often, and what's new.",
    "",
    "It's $49/month, no contract and no sales call — less than most tools in this space charge for just one of those two things.",
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
