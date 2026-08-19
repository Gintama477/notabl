# Notabl — Ideal Customer Profile (MVP)

## Who we're selling to

An independent dental practice (1-3 locations, not a large DSO/corporate
chain) that either has enough online review volume that reading them has
become a chore, or isn't asking for reviews consistently and knows it — the
product covers both halves now (see `marketing/core-sales-message.md`), so
either pain qualifies. In practice this usually means:

- 50+ Google reviews, growing by a handful every week
- The practice owner or office manager currently checks reviews reactively
  — after a bad one shows up, or occasionally out of habit — not
  systematically
- Multiple team members touch patient experience (front desk, hygienists,
  billing) so a single "problem area" can be hard to pin down from
  scattered reviews alone
- The owner cares about patient experience and reputation, but doesn't have
  time (or a dedicated marketing/ops person) to build a review-monitoring
  habit

## Who we are explicitly NOT targeting yet

- Large DSO-owned practices with dedicated marketing/analytics teams
  (they likely already have enterprise reputation-management tools)
- ~~Brand-new practices with under ~20 reviews~~ — **no longer an
  exclusion.** This was here because there wasn't enough signal for
  meaningful trend detection, which is still true of the analysis half on day
  one. But the review-request half is arguably *more* valuable to a practice
  with few reviews than to one with hundreds, and the trend detection becomes
  useful as the count grows. Treat low review volume as "leads with the
  request side, analysis follows," not as disqualifying.
- Practices outside the dental niche (med spas, gyms, etc.) — explicitly
  out of scope for MVP per the development plan, revisit after dental
  validates the model

## What "day in the life" pain looks like

The owner gets a notification about a new 2-star review, reads it, feels a
pang of anxiety, maybe responds, then moves on. They don't have a systematic
way to know: is this a one-off, or the fourth complaint this month about
the same thing? Are there problems building that haven't yet produced a bad
review, but are showing up as recurring minor gripes in otherwise-positive
reviews?

Meanwhile the reviews themselves arrive more or less by luck. Nobody at the
front desk is reliably asking, because asking is awkward and there's nothing
to hand the patient — so the practice's public rating is shaped by whoever
felt strongly enough to go find the review form unprompted, which skews
toward the unhappy.

Both of those are the gap Notabl fills: make the ask easy, then make the
resulting pile of reviews legible.

## Why this ICP first

Independent practices make the buying decision fast (single decision-maker,
usually the owner or office manager), feel the pain personally (it's their
name on the practice), and are price-sensitive enough that $49/month reads
as an easy yes rather than a procurement process. This is the fastest path
to validating "will someone actually pay for this."
