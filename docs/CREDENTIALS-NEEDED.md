# Credentials / Accounts Needed

Reorganized this pass into three tiers by when you actually need each one,
rather than by build phase. Nothing in any tier is required to run the app
today — it works entirely on demo data and mock services with zero
credentials. See `docs/DEPLOYMENT.md` and `docs/STRIPE-TEST-MODE.md` for the
step-by-step on the two biggest items below.

## Now (before you deploy anywhere, even just to look at)

Everything here is about not shipping something insecure by default —
none of it unlocks a new feature, it just closes the gaps a demo-mode app
is allowed to have but a deployed one isn't.

- **`SESSION_SECRET`** — a real random value (`openssl rand -hex 32`).
  Currently defaults to a clearly-labeled insecure placeholder for local
  dev. See `docs/SECURITY-AUDIT.md`.
- **`ADMIN_SECRET`** — a real random value, not the default `dev-admin`.
  Same reasoning.
- ~~A hosted Postgres database~~ — **done.** Your Supabase project
  (`notabl`) is live with all 14 tables created; the app runs on it
  directly, SQLite has been removed from the codebase. See
  `docs/DEPLOYMENT.md`.
- **Vercel account** (or equivalent host) — to get a real URL at all. This
  is now the only remaining blocker to a real public URL — everything else
  in this bullet point is done.

## Now (active — temporary real-data stopgap)

- **`OUTSCRAPER_API_KEY`** — powers the temporary Outscraper-backed Google
  review connector (see `docs/REVIEW-DATA-PROVIDERS.md` for the full
  reasoning, including the legal caveat that was explicitly discussed and
  accepted). Free tier covers the first 500 reviews. Get a key at
  outscraper.com, add it in Vercel Environment Variables. Retire this once
  the official Google Business Profile API access (below) is approved.

## Before public beta (before real strangers use this and you charge them)

- **Google Business Profile API access** and/or **Yelp Fusion API access**,
  or a licensed third-party review-data provider — the single most
  important item on this whole list, long-term. Without it, there is
  nothing to actually sell on a properly licensed basis; see
  `docs/PRICING-AUDIT.md`. **Status as of August 2026: paused, not
  abandoned.** Google's process turned out to require the applicant's
  Google account to already manage a verified Business Profile active for
  60+ days before it'll even accept an application — a real prerequisite,
  not a UI bug. Progress already made and preserved: a Google Cloud
  project (`notabl-505600`) with billing enabled, an OAuth consent screen
  configured with the `business.manage` scope, and a Google Business
  Profile "organization" account (`business.google.com/agencysignup`,
  organization name "Notabl") created under `hello@trynotabl.com`. Resume
  by either waiting out the 60 days on a listing under that account, or —
  faster — getting an actual pilot practice with an already-old, verified
  listing to add that account as a manager. See the domain/email setup
  below, both already done (`trynotabl.com`, `hello@trynotabl.com`
  forwarding). This is also the slowest,
  most process-heavy credential to obtain (API approval, terms review),
  which is exactly why it's sequenced last rather than first — no point
  rushing approval for an API you're not ready to use yet.
- **Resend account** — for the weekly report email to actually send. Need:
  API key, and a verified sending domain (so you'll need a domain name —
  see "Nice-to-have" below).
- **Stripe account, test mode first** — publishable key, secret key, a
  webhook signing secret, and a Product + Price for "Notabl Pro" ($49/month
  — configurable in `config/pricing.ts`). The full integration is already
  built and wired (`docs/STRIPE-TEST-MODE.md`) — this is a config step, not
  a code change. Switch test-mode keys for live keys only once you're
  ready to actually charge someone; do this deliberately, not as a default.
- ~~Basic rate limiting~~ on `/api/signup` and `/api/analysis/run` — **done.**
  In-memory limiter (5 signups / 30 min per IP, 10 analysis runs / 10 min
  per account) — see `lib/rateLimit.ts`. Not distributed, so it's a soft
  per-instance limit rather than a hard guarantee; upgrade to Vercel KV /
  Upstash if real abuse shows up in practice. See `docs/SECURITY-AUDIT.md`.
- **`CRON_SECRET`** — any random string, to protect the scheduled-job API
  routes once real automation is wired up (the manual "Run Analysis Now"
  button already exercises the same code path a cron job will call — see
  `app/api/analysis/run/route.ts`).

## Later (once the above is validated and working)

- **`ANTHROPIC_API_KEY`** — optional even then. The free deterministic
  demo analyzer is a legitimate permanent fallback, not just a placeholder
  — see `lib/ai/demoProvider.ts`. Add a real key once you want
  Claude-quality theme extraction and narrative writing instead of the
  rule-based version, which is a real cost per review analyzed.
- **Real per-operator admin authentication** (e.g. a role check against
  Supabase Auth) to replace the current single-shared-secret admin gate —
  fine for a single-operator MVP, should be replaced once more than one
  person needs admin access or the data behind it is no longer just yours.
- **Jurisdiction-specific privacy language** (GDPR/CCPA/etc.) in
  `app/legal/privacy/page.tsx` once operating in regions where those apply
  — currently placeholder text, flagged inline in that file.

## Nice-to-have, any time

- A **domain name** for the product (currently just "Notabl" as a working
  product name — see the trademark-risk note in the naming discussion) —
  needed for Resend domain verification and for a professional production
  URL either way. Not required to start testing — a temporary `*.vercel.app`
  URL works fine for early validation. See `docs/DOMAIN-SETUP.md` for format
  recommendations, whether `.com` is worth it, and exactly how to connect
  one once you have it.
