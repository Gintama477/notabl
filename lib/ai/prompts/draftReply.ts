// Prompt for drafting a PUBLIC reply to a patient review — the highest-
// stakes prompt in this codebase from a CUSTOMER LIABILITY standpoint, not
// just an accuracy one.
//
// Dental practices are routinely fined by HHS OCR for how they reply to
// online reviews — there are published enforcement actions at $10,000 and
// $50,000 against dentists for exactly this. The ADA's own guidance is
// explicit on two counterintuitive points, both encoded below:
//   1. Confirming the person was a patient is ITSELF a violation — even
//      "Thanks for coming in" acknowledges a treatment relationship.
//   2. A reviewer disclosing their OWN information does NOT waive their
//      privacy rights. Even if the review names the reviewer and describes
//      their exact procedure in detail, the practice still may not confirm
//      or reference any of it.
// A draft that reads naturally — "So glad your root canal went well,
// Sarah!" — is precisely the output that gets our customer fined. We are
// not exposed to HIPAA ourselves here; the practice is. Generating the
// text that causes their violation is not something this product does.
//
// DO NOT "IMPROVE" THESE DRAFTS BY MAKING THEM MORE PERSONAL. More
// personal is the failure mode here, not the goal. A prompt instruction
// alone is not a guarantee either — see lib/ai/validate.ts's
// replyContainsReviewerName and lib/ai/draftReply.ts, which reject a draft
// that slips through with the reviewer's name in it and regenerate once
// before giving up.

export const DRAFT_REPLY_PROMPT_VERSION = "draft-reply-v1";

export function buildDraftReplyPrompt(reviewText: string, rating: number, businessName: string): string {
  return `You are drafting a PUBLIC reply, on behalf of "${businessName}", to a patient
review posted online. This reply will be visible to everyone who looks up
the practice, not just the reviewer.

Review (rating given by the reviewer: ${rating}/5 stars):
"""
${reviewText}
"""

CRITICAL RULES. Dental practices have been fined $10,000-$50,000 by HHS OCR
for violating rules exactly like these in review replies. Follow every rule
below even though the review itself may state personal or treatment
details — the reviewer disclosing their own information does NOT give the
practice permission to confirm or reference it:

1. NEVER confirm, imply, or thank the reviewer for being a patient or for
   visiting the practice. Do not write "thanks for coming in," "glad we
   could help with your visit/procedure," or anything else that
   acknowledges a treatment relationship existed — even if the review
   plainly states they were a patient.
2. NEVER reference any treatment, procedure, condition, appointment, cost,
   or insurance detail mentioned in the review, even by implication (e.g.
   do not say "glad it went smoothly," which implicitly confirms a
   procedure happened).
3. NEVER use the reviewer's name, whether it appears in the review text or
   as the review's author name.
4. NEVER dispute, correct, or characterize the reviewer's account of
   events.

Instead, the reply should:
- Thank the reviewer for their feedback in general terms only.
- Speak to the practice's standards generally (e.g. "our team is committed
  to providing a welcoming experience for everyone").
- If the rating is 3 stars or below, invite them to contact the office
  directly to discuss further — without referencing what they're unhappy
  about. This is the ADA's recommended pattern; it moves the conversation
  off the public page instead of litigating specifics there.
- Stay brief — 2 to 3 sentences.

Respond with ONLY valid JSON, no other text:
{ "reply": "..." }`;
}
