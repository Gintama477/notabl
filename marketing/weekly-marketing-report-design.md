# Notabl — Weekly Marketing Report (Design)

A Phase 5 automation: a short weekly digest (email or dashboard page,
mirroring the product's own weekly-report pattern) summarizing marketing
performance and recommending what to test next. This document specifies
what it contains and where the numbers come from — implementation follows
the same "structured data first" principle as the product's own AI pipeline
(see docs/ARCHITECTURE.md §5): compute the numbers deterministically, then
(optionally) use AI only to turn verified numbers into a short narrative,
exactly like `lib/ai/generateReportNarrative.ts`.

## Sections

**Visitors**
Landing page visits this period vs. prior period (from the `events` table,
`landing_page_visit`), broken out by which hero copy variant was live (see
`marketing/landing-page-copy-variants.md`) if more than one ran this period.

**Conversions**
Funnel counts and rates, period over period:
`landing_page_visit` → `signup_started` → `signup_completed` →
`trial_started` → `subscription_started`. Report both raw counts and
conversion % at each step so a drop-off is visible at a glance.

**Outreach response**
If outreach emails are being sent (see `marketing/outreach-emails.md`),
report sends, opens (if trackable), replies, and how many replies converted
to `signup_started`. Broken out by sequence step (first touch vs. each
follow-up) to see which message is doing the work.

**Trial signups**
Count of `trial_started` events this period, and — for trials started in a
prior period — how many have since converted (`subscription_started`) or
lapsed (trial ended with no conversion).

**Paid conversions**
`subscription_started` count and trial-to-paid conversion rate. Also
`subscription_cancelled` count, so churn is visible in the same report
rather than needing a separate pull.

**Best-performing messaging**
Whichever landing page copy variant or outreach sequence step had the
highest conversion rate this period, with the underlying counts (never just
a percentage on its own — a 50% conversion rate on 2 visitors isn't a
signal). Flag if a period had too little volume to draw a conclusion.

## Recommendations block

The report ends with 2-4 short, concrete suggestions for what to test next,
generated the same way the product's own "Recommended Actions" are: derived
only from the numbers actually shown above, never a generic marketing tip
unconnected to this period's data. Examples of the kind of statement this
produces (illustrative — actual output depends on actual data):

- "Landing page visits are flat, but signup completion rate dropped from
  40% to 22% — worth reviewing the signup form for friction before running
  more traffic."
- "Follow-up #2 in the outreach sequence has a higher reply rate than
  Follow-up #1 this period — consider testing it as the first touch."

## Data sources (all already in the schema — no new tables needed)

- `events` table: all funnel and outreach-response events
- `subscriptions` table: trial/paid/cancelled status changes
- A `campaign`/`variant` property on relevant events (e.g.
  `{ variant: "B" }` on `landing_page_visit`) to slice by messaging variant —
  add this property when instrumenting, no schema change required since
  `events.propertiesJson` is already a flexible JSON field.

## Delivery

Same mechanism as the product's own weekly report (see
docs/ARCHITECTURE.md §4 automation architecture): a scheduled job that
computes the numbers, stores them, and emails a short summary — to you
(the operator), not to customers. Low priority relative to Phases 1-4;
build this once there's enough traffic/outreach volume for the report to
say something meaningful.
