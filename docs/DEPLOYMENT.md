# Deployment Instructions (Vercel)

## Database: done

The app runs on real Postgres now, not local SQLite. `lib/db/schema.pg.ts`
+ `lib/db/client.ts` are the live database layer; the old SQLite files
(`lib/db/schema.ts`, `better-sqlite3`, the local `data/notabl.db` file) have
been removed from the codebase entirely — there's no dual-path to keep in
sync anymore.

Your production Supabase project (`notabl`, `us-east-2`) already has all 14
tables created via the Supabase connector's `apply_migration`, empty and
ready for real signups. The generated SQL lives at
`drizzle-pg/0000_lush_deathbird.sql` if you ever want to review or re-apply
it elsewhere.

Local development in this sandbox runs against a separate local Postgres
instance (not your production Supabase project) — deliberately, so test
runs and seeded demo accounts never touch your real database. The `.env`
file here holds that local connection string; it's gitignored and never
committed.

**What's still needed for Vercel specifically:** your production
`DATABASE_URL` (the Supabase Transaction pooler URI you already gave me)
needs to be set as an environment variable *in Vercel's project settings*,
not in this repo — see step 3 below. `postgres-js` is already configured
with `prepare: false`, which the Transaction pooler requires (see
`lib/db/client.ts`).

## Steps

1. **Push this repository to GitHub** (or GitLab/Bitbucket) if it isn't
   already — Vercel deploys from a git repository. Tell me if you'd like
   help with this once you have a GitHub account ready.
2. **Go to vercel.com, sign in, and click "Add New Project."** Import the
   repository. Vercel auto-detects Next.js; the default build command
   (`next build`) and output settings need no changes.
3. **Set environment variables** in the Vercel project's Settings →
   Environment Variables, before the first deploy if possible. Minimum to
   run at all:

   | Variable | Required? | Notes |
   |---|---|---|
   | `DATABASE_URL` | Yes | Your Supabase Transaction pooler connection string (already provisioned — same one used to create the tables) |
   | `SESSION_SECRET` | Yes | Generate with `openssl rand -hex 32` — do **not** reuse the local dev value |
   | `ADMIN_SECRET` | Yes | Any strong random string — do **not** leave as `dev-admin` |

   Optional, add when you're ready for that capability (see
   `docs/CREDENTIALS-NEEDED.md` for the full breakdown by phase):

   | Variable | Enables |
   |---|---|
   | `ANTHROPIC_API_KEY` | Real Claude-powered analysis instead of the free demo analyzer |
   | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | Real weekly report emails |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO` | Real billing (start in Stripe **test mode** — see `docs/STRIPE-TEST-MODE.md`) |
   | `CRON_SECRET` | Protects the scheduled-job routes once Phase 2 automation is wired up |
   | `APP_URL` | Needed once the weekly report cron job is wired up (`lib/email/send.ts`'s `sendWeeklyReportEmail`, not yet called by anything) — every URL the app builds today uses the incoming request's own origin (`req.nextUrl.origin`), which works with zero configuration for anything triggered by a real request, but a cron job has no incoming request to read an origin from. Set this to the production URL (e.g. `https://notabl.example` or the `*.vercel.app` URL) before wiring up that cron. |

4. **Deploy.** Vercel builds and gives you a `*.vercel.app` URL. Once you
   have a live Vercel connection (the Vercel connector, or manual access),
   ask me and I can run the deploy directly rather than walking you through
   the dashboard.
5. **Run `npm run seed` once against production**, if you want the public
   `/sample-report` page to have data (it reads from a seeded demo business
   — currently only your local dev copy has this seeded, production
   doesn't yet). Ask me to do this once Vercel is live and I have a way to
   run it against `DATABASE_URL`.
6. **Custom domain (optional):** Vercel project Settings → Domains. You'll
   need to own a domain first — see the "domain name" note in
   `docs/CREDENTIALS-NEEDED.md`.

## Before you tell anyone the URL

- Confirm `SESSION_SECRET` and `ADMIN_SECRET` are both set to real random
  values, not the dev defaults (see `docs/SECURITY-AUDIT.md`).
- Everything shown will still be demo/synthetic data until Phase 4's real
  review-data integration exists — that's fine and already labeled clearly
  throughout the app, just worth remembering when you're deciding who to
  share the link with.
- Supabase's security linter will flag all 14 tables as "RLS disabled."
  This is expected and safe for this app's architecture — the database is
  only ever reached through the trusted Next.js server via `DATABASE_URL`,
  never directly from a browser, so Postgres row-level security isn't the
  access-control boundary here (the app's own session checks are). Enabling
  it without policies would break the app rather than add protection. See
  the RLS discussion earlier in this conversation for the full reasoning.
