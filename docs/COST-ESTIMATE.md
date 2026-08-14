# Cost Estimate (point 25)

Rough, assumption-based estimates for running Notabl at four points on the
growth curve: 0 paying customers (validation/testing), and 10, 100, and
1,000 paying customers on the $49/month plan. Every number below is either
sourced from a provider's current published pricing (with the caveat that
pricing pages change over time — verify before budgeting seriously) or
explicitly computed from a stated assumption, or labeled **UNKNOWN** rather
than invented. Sourcing note: direct fetches of vercel.com, supabase.com,
anthropic.com, and resend.com's own pricing pages were blocked in this
environment; the figures below come from third-party pricing-tracking sites
that quote those providers' current published numbers, current as of
August 2026 — worth a quick double-check against the providers' own pricing
pages before committing budget, since these change.

## Per-service breakdown

### Hosting — Vercel

- **Free (Hobby) tier:** $0/month, but restricted to non-commercial
  projects — not usable once actually charging customers.
- **Pro plan:** $20/month per seat, includes 1 TB bandwidth, 10M edge
  requests, and $20 of additional usage credit; overages billed
  pay-as-you-go beyond that.
- For a B2B dashboard checked periodically by a few hundred to low
  thousands of business accounts (not a high-traffic consumer app), traffic
  should stay close to Pro's included allowances even at 1,000 customers —
  estimating $20–40/month, not a hard number.

### Database — Supabase (Postgres)

- **Free tier:** $0/month — 500 MB storage, 5 GB bandwidth, projects pause
  after 7 days of inactivity (not viable for a live product people expect
  to load reliably).
- **Pro plan:** $25/month base (includes compute for one small instance),
  8 GB storage and 250 GB bandwidth included, then $0.125/GB storage and
  $0.09/GB bandwidth overages.
- Notabl's data per customer is modest (review text, extracted themes,
  weekly report JSON — no video/images) — 1,000 customers should stay
  within or close to the Pro plan's included allowances. Estimating
  $25–50/month, with the higher end if actual data volume runs heavier
  than assumed.

### AI analysis — Anthropic Claude API

Current published rate: **$3 per million input tokens, $15 per million
output tokens** for the Sonnet model this app uses (a promotional $2/$10
rate was reported as available through the end of August 2026 — using the
standard rate here to avoid understating the ongoing cost).

Assumption: each business generates roughly 10 new reviews analyzed per
week plus one weekly report narrative generation. Estimated tokens per
business per week: ~9,000 input + ~2,200 output (extraction is a small
prompt per review; narrative generation reads a compact pre-computed
rollup, not raw review text — see `lib/ai/prompts/`). At standard rates
that's roughly **$0.06/business/week, ~$0.25/business/month** — cheap
because of the cost controls already built in: only new reviews get
re-analyzed (`analyzedAt` check), and a report isn't regenerated if nothing
changed since the last one (see `lib/analysis/runAnalysis.ts`).

This scales with actual review volume, which varies a lot practice to
practice — treat this as an estimate, not a guarantee.

### Email — Resend

- **Free tier:** $0/month, up to 3,000 emails/month, capped at 100/day.
- **Pro tier:** starts at $20/month for 50,000 emails/month, no daily cap.

At 10 customers, weekly report emails (~40/month) stay comfortably within
the free tier. At 100 customers (~400/month, but potentially bunching up
against the 100/day cap if all reports send the same day of the week),
expect to need the Pro tier. At 1,000 customers (~4,000+/month including
welcome and weekly emails), Pro is required — $20/month covers it with
significant headroom.

### Payment processing — Stripe

Standard US rate: **2.9% + $0.30 per successful transaction.** On the
$49/month plan, that's **$1.72 per paying customer per month** — this is a
percentage of revenue collected, not a fixed cost, so it scales
proportionally with money actually coming in rather than being a fixed
burden.

### Review data — UNKNOWN

No real review-data source is connected yet (see
`docs/REVIEW-DATA-PROVIDERS.md`) — cost depends entirely on which provider
gets chosen later (the Google Business Profile API, the Yelp Fusion API, or
a licensed third-party provider), and their pricing/access terms weren't
looked up as part of this pass since no provider has been selected.
Labeled **UNKNOWN** rather than guessed, per the instruction this estimate
was built against.

### Domain

~$10–15/year (~$1/month) once a domain is purchased — optional, not
required to start (see `docs/DOMAIN-SETUP.md`).

## Estimated monthly total by customer count

| Customers | Vercel | Supabase | Claude API | Resend | Stripe fees | Review data | **Total (excl. review data)** |
|---|---|---|---|---|---|---|---|
| 0 (validation) | $0 (Hobby) | $0 (Free) | ~$0 | $0 (Free) | $0 | UNKNOWN | **~$0/month** |
| 10 | $20 | $25 | ~$2.50 | $0 | ~$17 | UNKNOWN | **~$65/month** |
| 100 | $20–30 | $25–35 | ~$25 | $20 | ~$172 | UNKNOWN | **~$260–280/month** |
| 1,000 | $20–40 | $25–50 | ~$250 | $20 | ~$1,720 | UNKNOWN | **~$2,035–2,080/month** |

At every scale shown, Stripe's processing fee is by far the largest line
item — but it's proportional to $49,000/month (100 customers) or
$490,000/month (1,000 customers) in actual recurring revenue at those
customer counts, so infrastructure cost as a share of revenue actually
*shrinks* with scale (roughly 0.5% of revenue at 100 customers, similar at
1,000) rather than growing. The MVP is inexpensive to run at every stage
shown here; nothing about this cost structure blocks starting small.
