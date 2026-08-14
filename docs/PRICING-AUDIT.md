# Pricing Audit: Is $49/month Justified?

This is a written audit only — **no pricing has been changed**. Current
pricing lives in `config/pricing.ts`: $49/month, 14-day free trial, one plan,
up to 1 business location.

## What supports $49/month

- **Time savings is real and easy to explain.** A practice accumulating
  hundreds of reviews across Google and other sites has no practical way to
  read all of them and spot patterns. Even 20 minutes/week of an owner's or
  office manager's time has real value; automating that is an easy pitch.
- **Early-warning pattern detection has outsized value relative to its
  cost.** Catching a scheduling or communication problem while it's
  mentioned in 3 reviews instead of 30 is worth far more than $49/month if
  it prevents even one lost patient relationship or a public reputation
  problem.
- **It's priced low relative to the reputation-management category.**
  Established competitors aimed at multi-location businesses (Birdeye,
  Podium, and similar) commonly start in the $250–400+/month range and are
  sold with annual contracts and sales calls. $49/month, self-serve, no
  contract, is deliberately positioned for a solo or small practice that
  those tools weren't built for or priced for.
- **Single flat tier reduces decision friction.** A non-technical buyer
  doesn't have to guess which plan they need — appropriate for the target
  buyer (a practice owner, not a procurement team).

## What undermines it today

Be direct about this: **a practice paying $49/month right now would receive
no analysis of their actual reviews.** Three concrete gaps, in order of
severity:

1. **No live review data ingestion.** Phase 1 runs entirely on demo/synthetic
   review data. The Google Business Profile / Yelp integration that would
   analyze a real practice's real reviews is Phase 4 — intentionally last,
   per the original plan, because it's the slowest credential to obtain. Until
   it exists, there is nothing to sell as a paid, ongoing service.
2. **No live email delivery.** "Weekly email report" is a listed paid-plan
   feature; without a connected Resend account and verified sending domain
   (Phase 2), that feature doesn't function for a real customer.
3. **No live billing.** There's no Stripe integration yet (scaffolded this
   pass, see `docs/DEPLOYMENT.md` and `lib/billing/`, but not connected to
   real keys) — so $49/month can't actually be charged today regardless of
   the above.

Secondary, lower-severity gaps: the price has not been validated with any
real practice owner yet (the outreach batch prepared in this pass is meant
to start generating that signal); there's no annual-pay discount, which
some early, price-sensitive customers may ask for; and a single flat tier
may eventually need a second tier for multi-location groups, though that's
correctly out of scope for Phase 1's single-location focus.

## Minimum needed before charging anyone real money

In order:

1. **Real review data source connected** (Google Business Profile API
   and/or Yelp Fusion API, or a licensed provider) for at least the specific
   practices being charged. This is the non-negotiable one — everything
   else is secondary to "does this analyze real reviews."
2. **Real email delivery** (Resend account + verified domain) so the
   promised weekly email actually arrives.
3. **Real Stripe integration switched from test mode to live keys** (see
   the test-mode scaffolding added this pass) — trivial once 1 and 2 are
   done, since the checkout/subscription code path will already be built
   and tested against Stripe's test mode.
4. **At least a few pilot practices confirming the analysis is actually
   useful**, ideally gathered via the free sample report and the outreach
   sequence prepared in this pass, before broadly charging $49/month to
   strangers. Cheap to get, and the highest-leverage way to find out if the
   price (or the product) needs to change before it's a real conversation
   with real money.

Nothing above requires changing the $49 number itself — it requires making
the thing being charged for actually exist and work for a real customer.
