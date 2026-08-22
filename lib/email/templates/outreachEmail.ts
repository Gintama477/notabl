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
//
// This goes one step further than that and drops the practice name
// entirely. "quick question about {practice}'s reviews" is itself a
// recognizable mail-merge shape — the name in the subject is the tell, not
// the hook. "the review you haven't seen yet" reads like a person wrote it
// and leaves a small open loop the body then pays off. Note it claims
// nothing about their actual reviews: it's a hook, not a finding (Tier 1,
// see the constraint list on buildOutreachDraftBody below).
export function buildOutreachEmailSubject(
  // Intentionally unused, and intentionally KEPT. Callers
  // (findAndDraftProspects in lib/db/queries.ts, the re-draft action) pass
  // the practice name, and preserving the parameter means putting it back
  // in the subject is a one-line change if open rates ever argue for it.
  // Do not "fix" this by interpolating it back in without re-reading the
  // reasoning above — its absence is the point.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  practiceName: string
): string {
  return "the review you haven't seen yet";
}

// PROBLEM-FIRST. The opening line names a situation the reader recognizes
// — finding out about a bad review days late — before Notabl is mentioned
// at all. The previous version opened by describing the product's two
// halves, which is a fine explanation but a weak hook: it asks a stranger
// to care about a tool's architecture before they've agreed there's a
// problem. Lead with the problem, and the pairing (watch + collect) lands
// in the next paragraph as the answer to it rather than as a feature list.
// The differentiation is still doing both at $49/mo with no contract and
// no sales call — see marketing/core-sales-message.md.
//
// Chosen over three alternatives as the first thing to actually test: a
// short founder note, a tightened version of the old two-halves copy, and
// a free-audit offer. The free-audit version is held in reserve — it's the
// strongest hook of the four but the most expensive to honor, so it's what
// to try next if reply rates on this are poor. Recorded so the next person
// here knows this was a decision, not a default.
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
//   - Describes reports + alerts accurately: reviews become a report the
//     owner can check anytime, and an email arrives only when something
//     actually needs a look (lib/alerts/reviewAlerts.ts) — never a
//     scheduled weekly email, which the product stopped sending.
//   - Rating and review-count targeting stays in WHO gets emailed, never
//     in what the email says. A practice's star rating is public, so
//     citing it wouldn't breach Tier 1 — but opening by pointing at
//     someone's weakest number is a bad first impression and invites "how
//     would you know what my reviews say?", which this copy avoids by
//     talking about the general situation instead.
export function buildOutreachDraftBody(opts: {
  practiceName: string;
  sampleReportUrl: string;
  senderName: string;
}): string {
  return [
    "Hi,",
    "",
    "Most practices find out about a bad review days later — usually because a patient mentions it, or someone happens to check.",
    "",
    "I built a small tool called Notabl that watches for you. It emails you the same day a review needs attention, turns the rest into a plain-language summary of what patients keep bringing up, and gives you a front-desk QR code so the happy ones actually leave a review.",
    "",
    "It's $49/month, no contract and no sales call.",
    "",
    `Here's a sample report so you can see the format: ${opts.sampleReportUrl}`,
    "",
    "Worth 10 minutes?",
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
