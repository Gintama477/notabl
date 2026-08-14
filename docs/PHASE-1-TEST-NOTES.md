# Phase 1 — Test Notes

Phase 1 goal (per the development plan): a functional demo with fake review
data — landing page, signup, dashboard, demo reviews, analysis, sample
report. This document records what was actually tested and its result.

## What was tested and works

- **`npx tsc --noEmit`** — passes, no type errors.
- **`npm run lint`** — passes clean (fixed 23 errors, mostly unescaped
  quotes/apostrophes in JSX text; fixed 5 unused-variable warnings).
- **`npm run build`** — production build succeeds and generates all 15
  routes (8 static, 7 dynamic).
- **Production server (`npm run start`) smoke test** — every page returns
  HTTP 200: `/`, `/pricing`, `/signup`, `/sample-report`, `/legal/terms`,
  `/legal/privacy`, `/legal/ai-disclaimer`, `/admin` (after submitting the
  admin key on its login form).
- **Signup → dashboard flow (real browser, via Playwright)** — filled out
  the actual signup form, submitted, landed on `/dashboard` with:
  - 100 demo reviews imported and analyzed automatically (no manual
    "analyze" step needed — the core promise from the spec)
  - All six section types populated with real (demo) data: What Patients
    Love, What Patients Dislike, New This Week, Issues Getting Worse,
    Opportunities, AI Recommendations
  - Metrics row (reviews analyzed, average rating, positive/negative %,
    emerging issues count, important themes count) all correct
  - "Issues Getting Worse" correctly surfaced Scheduling (+600%), Waiting
    Time (+40%), and Communication (+200%) — matching the trend pattern
    intentionally built into the demo dataset
- **Weekly report detail page** — executive summary, themed sections,
  changes-from-last-period, recommended actions, and six representative
  review excerpts (verbatim, sourced from stored review text) all render.
- **Sample report page (`/sample-report`, public, no signup)** — renders
  the same report structure for the permanent demo business "Brightview
  Family Dental," seeded via `npm run seed`.
- **Idempotency / cost-control bug found and fixed:** the first version of
  the analysis pipeline used "does a review have a stored theme mention" as
  its marker for "already analyzed." Reviews where the AI found zero themes
  never got that marker, so they were silently re-analyzed (and would be
  re-billed against a live AI key) on every subsequent run. Fixed by adding
  a dedicated `reviews.analyzed_at` column set unconditionally after
  extraction — verified via a live re-run showing `reviewsNewlyAnalyzed: 0`
  on the second call. See `lib/analysis/runAnalysis.ts`.
- **Narrative schema bug found and fixed:** the deterministic demo
  narrative generator could emit more than 6 "changes from last period"
  entries, which failed its own Zod validation (`WeeklyNarrativeSchema`) and
  made the very first seed run fail outright. Fixed by sorting by magnitude
  and capping at the schema's limit. See `lib/ai/demoProvider.ts`.
- **Email template** — rendered via `/api/email/preview?sample=1`,
  confirmed subject line, short body (top complaint, top positive trend,
  CTA), and that it degrades gracefully (logs instead of sending) with no
  `RESEND_API_KEY` configured.
- **Admin panel** — confirmed account/business/subscription counts update
  correctly after new signups, and automation log / email delivery tables
  render (empty states handled).

## Known limitations in this sandbox (not app bugs)

- **Google Fonts couldn't be fetched** from this sandboxed environment
  (network allowlist blocks `fonts.googleapis.com`), which actually broke
  `next build` outright the first time. Fixed by switching to system font
  stacks (`app/globals.css`) instead of `next/font/google` — this also
  means zero external font dependency going forward, which is arguably
  better for a fast, simple, trustworthy small-business site. If you'd
  prefer a specific webfont later, swap in `next/font/local` with a
  downloaded font file, or `next/font/google` once deploying somewhere with
  normal internet access (e.g. Vercel).
- **Prisma was swapped for Drizzle ORM** for the same reason (its engine
  binary download was blocked here) — see the note at the top of
  `lib/db/schema.ts`. Functionally equivalent; not a limitation of the app
  itself.

## What does NOT work yet (by design — later phases)

- No real review data import (Google/Yelp/licensed provider) — Phase 4.
- No scheduled/automatic weekly runs — Phase 2. The pipeline itself works
  (proven above); it just isn't on a cron yet. "Run Analysis Now" on the
  dashboard exercises the exact same code path a cron job will call.
- No real email sending — Phase 2, needs a Resend account + verified domain.
- No real payments/checkout — Phase 3, needs a Stripe account.
- Admin panel access is a single shared-secret query parameter
  (`?key=...`), not real authenticated admin access — fine for a
  single-operator MVP prototype, should be replaced before this handles
  real customer data.
- Signup uses passwordless "mock" sessions (a signed cookie, no password) —
  intentional simplification for Phase 1 per the plan's "use demo data
  where live integration isn't configured yet" allowance; real auth
  (Supabase Auth) is a Phase 2 concern.

## How to run this yourself

```bash
npm install
npm run db:push       # creates the local SQLite database + tables
npm run generate-demo-data   # (already generated; re-run only if you edit the generator)
npm run seed          # seeds the public /sample-report business
npm run dev           # http://localhost:3000
```

To exercise the AI pipeline with real Claude output instead of the free
deterministic demo analyzer, set `ANTHROPIC_API_KEY` in `.env` before
running `npm run seed` or signing up — no code change needed (see
`lib/ai/provider.ts`).
