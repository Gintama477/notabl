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
  // A merge field in a subject line is the signature of bulk sales
  // tooling; its absence is the point. Do not "fix" this by interpolating
  // it back in without re-reading the reasoning above.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _practiceName: string
): string {
  return "a student project, and a free read on your reviews";
}

// STUDENT + FREE AUDIT. This copy doesn't sell. It offers to do something
// free and asks whether it was useful.
//
// Lineage, so the reasoning stays readable: v1 led with the PAIRING (get
// reviews in + understand them). v2 was PROBLEM-FIRST ("most practices
// find out about a bad review days later") — a better hook, and the
// free-audit option was explicitly held in reserve at that point as the
// strongest but most expensive to honor. v2 went to 36 practices and
// produced ZERO replies, so the reserve option is now in play.
//
// The diagnosis wasn't the hook, it was the ask. Every previous version
// asked a stranger to evaluate a purchase, which is the highest-friction
// thing you can request from someone who has never heard of you. This
// asks for permission to do them a favour instead.
//
// "Student" is doing real work here: people answer a student differently
// than they answer a vendor, and it happens to be true. Naming a
// CHECKABLE school and city is what separates it from a spammer's line —
// which is exactly why those are factual claims about the sender, not
// decorative copy.
//
// UPDATE THE SCHOOL AND CITY IF THE SENDER'S SITUATION CHANGES. Leaving
// "student at Stevens in Hoboken" in place once it stops being true turns
// the most credibility-carrying sentence in the email into a lie.
//
// Worth knowing what a reply now costs: it's a request to actually run
// the analysis — roughly ten minutes per practice through the admin
// panel plus a dollar or two of API spend. That's the intended trade,
// fewer and warmer replies that require real work, rather than many cold
// sends that require none and produced nothing.
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
    // "Happy to run it" is an OFFER. It must never become "I read your
    // reviews" or "I ran this on your practice" — no analysis has been run
    // for a cold prospect, so that would simply be false. This is the Tier
    // 1 line (marketing/personalized-outreach-system.md) and the single
    // easiest thing to break while "tightening" this copy.
    "I'm a business & technology student at Stevens in Hoboken, and I built a small tool called Notabl that reads through a dental practice's Google reviews and says in plain language what patients keep praising and what keeps coming up as a problem.",
    "",
    "I'm trying to find out whether it's actually useful to real practices. Happy to run it on yours for free and send you the result — no charge, no signup, and I won't chase you afterwards.",
    "",
    "There is a paid version if it turns out to be useful, but honestly I mostly want to know whether I built something worth using.",
    "",
    `Here's the format, on a sample practice: ${opts.sampleReportUrl}`,
    "",
    "Want me to run it on yours?",
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
