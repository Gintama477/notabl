# Notabl — Landing Page Hero Copy Variants

Five different hero-message concepts to test. Variant A is the one
currently live on the site (`components/marketing/Hero.tsx`). Swapping in
another variant is a copy change only — no layout/design change needed.

## The constraint every variant has to satisfy

**Both halves, or it's not a candidate.** Notabl gets reviews in *and*
explains them. A hero that carries only the analysis half is the old
positioning (it asked the owner to supply the outcome themselves); a hero
that carries only "get more reviews" makes Notabl indistinguishable from the
review-generation software this market is cold-pitched constantly (Podium,
Birdeye, NiceJob, Weave, $75–$500/month). Every variant below leads with the
pairing or gets there inside the subhead. See
`marketing/core-sales-message.md`.

Also non-negotiable in any variant (see the honesty limits in
`core-sales-message.md`): no numeric review lift, nothing implying Notabl
messages patients, and no framing of private feedback as a way to head off
bad reviews.

---

## Variant A — "Both halves" (current default)

**Headline:** Get more patient reviews — and know what they're actually
telling you.

**Subheadline:** Share a QR code at the front desk, and patients can leave a
Google review in a couple of taps. Notabl reads every review that comes in
and sends you a plain-language weekly report on what they add up to.

**Angle:** The pairing, stated plainly, with the loop named in the subhead.
The safest default: it answers "what is this" completely in two lines and
differentiates from single-purpose competitors immediately.

---

## Variant B — "Collecting isn't reading"

**Headline:** Collecting reviews isn't the same as reading them.

**Subheadline:** Notabl does both — a QR code that makes leaving a review
easy for your patients, and a weekly summary of what all of them actually
say, so they're not just piling up unread.

**Angle:** Aimed squarely at practices who already use a review-generation
tool. Best for outbound channels where you know the prospect has one, since
it reframes an existing purchase as half-finished rather than competing with
it head-on.

---

## Variant C — "Two tools, one bill"

**Headline:** Two tools most practices buy separately. One that does both.

**Subheadline:** Review requests and review analysis, together, for
$49/month — no contract, no sales call. Patients leave reviews from a QR
code at your front desk; you get a plain-language weekly read on what they
said.

**Angle:** Price and consolidation. Best where the prospect is
budget-conscious or already paying enterprise pricing for one half.
Strongest response to "we already use Podium."

---

## Variant D — "Built for practices, not marketers"

**Headline:** Review requests and review reports, built for dentists, not
marketing teams.

**Subheadline:** No dashboards to learn, no jargon, no onboarding project.
A QR code for the front desk, and a clear weekly summary of what your
patients said.

**Angle:** Simplicity / anti-complexity. Best for owners skeptical of
"software" generally, who want reassurance this isn't going to be a time
sink to learn or a contract to escape.

---

## Variant E — "Ask, then listen"

**Headline:** Ask every patient for a review. Then actually find out what
they said.

**Subheadline:** Notabl gives your practice a QR code patients can scan at
checkout, and turns every review that comes in into a weekly read on what's
going well, what's coming up more often, and what's new.

**Angle:** Sequential and concrete — describes the loop as two actions the
owner recognizes. Slightly sharper hook than A; good for paid channels where
the click has to be earned in one line.

---

## Retired variants (do not reuse as-is)

These were the pre-Review-Requests heroes. They're recorded here because the
*angles* are still useful, but every one of them scopes Notabl to the
analysis half only and would now under-sell the product:

- "Know what your patients are saying before small problems become big
  ones." (prevention / early warning — the previous default)
- "Stop reading patient reviews one at a time." (time savings)
- "What are your patients really saying about your practice?" (curiosity)
- "The next bad review is preventable. Here's how to see it coming."
  (urgency — also leans further into fear-based framing than
  `core-sales-message.md` wants)

If you want one of these angles, fold it into a variant that still carries
both halves, the way Variant B borrows the time-savings angle.

---

## Testing notes

- Run one variant at a time for at least 2 weeks or 100 visitors, whichever
  is longer, before switching (see marketing/weekly-marketing-report-design.md
  for how to track this).
- Keep the secondary CTA ("See Sample Report") identical across all
  variants — it's the highest-intent, lowest-friction next step and
  shouldn't be a variable in the test.
- Do not test more than one variant live at the same time without an actual
  A/B testing setup (out of scope for MVP) — swap sequentially and compare
  period over period instead.
- Note the sections below the hero (`FeatureGrid`, `ReviewRequestsSection`)
  already carry both halves in detail. A hero variant that drops one half
  doesn't just under-sell on its own — it contradicts the page under it.
