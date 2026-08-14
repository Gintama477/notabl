# Notabl — MVP Architecture & Planning

*Prepared by: Claude (technical cofounder role) — Date: 2026-08-13*

This document answers the 9 upfront questions before any code was written. Decisions
are made (not deferred back to you) per your instruction, with brief reasoning. Every
assumption that affects money (pricing, plan limits, AI cost thresholds) lives in one
config file (`/config/pricing.ts` and `/config/plans.ts`) — never hardcoded inline.

---

## 1. Final MVP Architecture

Single Next.js application (monolith) that serves the marketing site, the app
(signup/dashboard), and the API routes that power both. This is the right call for an
MVP run by one person: one codebase, one deploy, one bill, and no service-to-service
auth to babysit.

```
Browser
  │
  ▼
Next.js App (Vercel)
  ├─ Public pages: landing, sample report, marketing pages, legal
  ├─ App pages: signup, dashboard, weekly report viewer
  ├─ API routes: /api/* (signup, analysis trigger, stripe webhook, admin)
  └─ Server-side rendering + React Server Components for data pages
  │
  ├──► Postgres (Supabase) — all persistent data (see §3)
  ├──► Claude API (Anthropic) — structured review analysis (see §5)
  ├──► Stripe — subscriptions & billing (Phase 3)
  ├──► Resend — transactional + weekly report email (Phase 2)
  └──► Scheduled Jobs (Vercel Cron → API routes) — see §4
```

**Phase 1 substitution (no credentials yet):** Postgres is swapped for a local
SQLite file via Prisma (`prisma/dev.db`), auth is a lightweight cookie-session mock
instead of Supabase Auth, and the AI analyzer runs in **deterministic demo mode**
(rule-based, not a live model call) instead of calling the Claude API. All of this is
behind small adapter interfaces so swapping in the real services later is a config
change, not a rewrite. Details on exactly what's mocked are in each phase's test
notes.

---

## 2. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | **Next.js 14 (App Router, TypeScript)** | One deployable unit, great Vercel fit, server components keep the dashboard fast without a separate API client layer. |
| Styling | **Tailwind CSS** | Fast to build a clean, non-"AI startup" look without fighting a component library. |
| Database | **Postgres via Supabase** (prod) / **SQLite via Drizzle ORM** (Phase 1 dev) | Supabase gives Postgres + Auth + Storage in one free-tier product, which matters at this budget. **Deviation from original plan:** Prisma was the first choice, but its `generate` step needs to download a platform binary from an external CDN that this sandbox's network allowlist blocks. Drizzle ORM + better-sqlite3 needs no such fetch (pure npm + native compile) and supports the same query API against Postgres later, so the Supabase migration is still a driver swap, not a rewrite. Prisma remains a fine choice once you're developing outside this sandbox (Vercel's build environment isn't blocked) — see `lib/db/schema.ts` for the note. |
| Auth | **Supabase Auth** (prod) / mock cookie session (Phase 1) | Avoids hand-rolling password storage; magic-link or email/password both work for small-business owners. |
| Payments | **Stripe** (Checkout + Billing Portal + webhooks) | Industry standard, we never touch card numbers, built-in dunning for failed payments. |
| Email | **Resend** | Cheap, simple API, good deliverability, React-email templates supported. |
| AI | **Claude API (Anthropic), model: Claude Sonnet** | Strong structured-JSON output, good at following "don't invent data" constraints, reasonably priced for batch review analysis. |
| Scheduled jobs | **Vercel Cron Jobs** calling internal API routes | No extra infra (no separate worker service) needed at this scale. |
| Hosting | **Vercel** | Native Next.js support, cron, previews, cheap starter tier. |
| Analytics/events | Custom `events` table (see §3) + simple admin dashboard | No need to pay for Mixpanel/Amplitude at 10-1000 customers; we already need an events table for the product itself. |

**Changes from your suggested default:** none structurally — this matches your
suggested Next.js/Supabase/Vercel/Stripe/Resend/Claude stack. The one addition is
Prisma as the ORM (keeps us portable between SQLite-now and Postgres-later with the
same code) and Vercel Cron instead of a separate queue/worker (unnecessary
complexity at this volume).

---

## 3. Database Structure

Modeled so a single **account** can eventually own multiple **businesses** (multi-location
practices, or later multi-industry rollups), even though Phase 1 UI only shows one
business per account.

```
accounts                 -- billing/auth root (was "users", broadened for multi-business)
  id, email, created_at, role (owner/admin)

users                    -- login identities, 1:1 with accounts for MVP, but kept
                            separate so we can add team members later
  id, account_id, email, auth_provider_id, created_at

businesses
  id, account_id, name, industry ('dental' for MVP, enum-ready for others),
  website, address, city, state, phone, timezone, created_at

review_sources
  id, business_id, source_type (google/yelp/demo/manual), source_url,
  external_id, connected_at, status (active/pending/error), last_synced_at

reviews
  id, business_id, review_source_id, external_review_id, author_name,
  rating (1-5), review_text, review_date, is_demo_data (bool),
  raw_payload (jsonb), created_at
  -- unique(review_source_id, external_review_id) prevents duplicate import

analysis_runs
  id, business_id, run_type (weekly/manual/backfill), period_start, period_end,
  status (pending/running/completed/failed), reviews_analyzed_count,
  ai_model_used, prompt_version, started_at, completed_at, error_message

review_theme_mentions      -- one row per (review, theme) the AI detected
  id, review_id, analysis_run_id, theme_category, sentiment (positive/neutral/negative),
  severity (low/medium/high), confidence, excerpt (short, only if legally OK to store)

themes_rollup               -- aggregated per business per period, what dashboards read
  id, business_id, analysis_run_id, theme_category, period_start, period_end,
  mention_count, positive_count, negative_count, neutral_count,
  trend_direction (increasing/decreasing/flat/new), pct_change_vs_prior_period

weekly_reports
  id, business_id, analysis_run_id, period_start, period_end,
  executive_summary, top_positive_themes (jsonb), top_negative_themes (jsonb),
  emerging_issues (jsonb), changes_from_last_period (jsonb),
  recommended_actions (jsonb), status (draft/sent), created_at

subscriptions
  id, account_id, stripe_customer_id, stripe_subscription_id, plan_id,
  status (trialing/active/past_due/canceled), trial_ends_at,
  current_period_end, created_at, canceled_at

email_deliveries
  id, business_id, weekly_report_id, recipient_email, email_type
  (weekly_report/welcome/trial_ending/payment_failed), status (queued/sent/failed/opened),
  resend_message_id, sent_at, opened_at, error_message

events                     -- product analytics, see §10
  id, account_id, business_id, event_name, properties (jsonb), created_at

automation_logs            -- added beyond your list: every scheduled job run,
                              needed for §8/§11 "automation errors" requirement
  id, job_name, business_id (nullable), status (success/failed/retried),
  detail, started_at, finished_at
```

Full Prisma schema is in `/prisma/schema.prisma`. Two additions beyond your list:
`review_theme_mentions` (row-level AI output, needed so we never re-derive themes
from raw text more than once — see §18 cost control) and `automation_logs` (needed
for the admin panel's "automation errors" view in §11). `users` and `accounts` are
split so team members can be added to one account later without a schema change.

---

## 4. Automation Architecture

All automation is Vercel Cron → a protected API route → a job function. Every job
writes to `automation_logs` on start and finish (success or failure), so the admin
panel has a real audit trail from day one instead of us adding logging later.

```
Vercel Cron (weekly, e.g. Mon 6am business-local)
  → POST /api/jobs/import-reviews        (Phase 2/4: pulls new reviews from connected sources)
  → POST /api/jobs/run-analysis          (Phase 2: processes only new/unanalyzed reviews)
  → POST /api/jobs/compute-trends        (Phase 2: rolls up themes, compares to prior period)
  → POST /api/jobs/generate-weekly-report (Phase 2: builds weekly_reports row)
  → POST /api/jobs/send-reports          (Phase 2: emails via Resend, logs to email_deliveries)

Vercel Cron (daily)
  → POST /api/jobs/monitor-failures      (checks automation_logs for failed/stuck jobs,
                                            emails the admin — you — a digest)
```

Retry policy: each job function wraps its core work in up to 2 retries with backoff
for transient errors (network/API timeouts). Non-transient errors (bad data, AI
validation failure) are logged and skipped for that business, not retried blindly —
we don't want a bad review payload to loop forever. A failed job never blocks other
businesses' jobs; each business is processed independently.

Job routes are protected by a shared secret header (`CRON_SECRET`) so they can't be
triggered by random requests.

Phase 1 has no live cron yet — jobs exist as callable functions and there's a manual
"Run analysis now" button in the dashboard so you can see the pipeline work without
waiting a week. Phase 2 wires up the actual schedule.

---

## 5. AI Analysis Architecture

Two-stage pipeline, structured JSON in, structured JSON out — never "summarize these
reviews" as a single freeform prompt.

**Stage 1 — Per-review extraction** (`lib/ai/extractReview.ts`)
Input: one review's text + rating + date.
Output (validated against a Zod schema before it's trusted):
```json
{
  "sentiment": "positive | neutral | negative",
  "themes": [
    { "category": "scheduling", "sentiment": "negative", "severity": "medium", "excerpt": "..." }
  ]
}
```
`category` is constrained to the fixed enum from your spec (staff friendliness,
scheduling, waiting time, cleanliness, communication, billing, treatment experience,
parking/accessibility, office environment, professionalism). The model cannot invent
new categories or new review text — `excerpt` must be validated as a substring of
the original review, or it's dropped. This directly enforces "do not allow AI to
invent review information."

**Stage 2 — Business-level rollup** (`lib/ai/computeTrends.ts`, pure code, no AI call)
Aggregates `review_theme_mentions` into `themes_rollup`: counts, percentages, and
trend direction by comparing this period's counts to the prior period. This is
deterministic arithmetic, not an AI call — cheaper, faster, and auditable.

**Stage 3 — Narrative generation** (`lib/ai/generateReportNarrative.ts`)
Input: the *already-computed* structured rollup (not raw reviews). Output: the
executive summary and recommended actions in the weekly report. Because the model
only sees pre-verified structured numbers at this stage, it can't fabricate a trend
that doesn't exist in the data — it's explaining numbers we already trust.

**Validation layer** (`lib/ai/validate.ts`): every AI response is parsed through a
Zod schema; on failure the run is retried once with a stricter instruction, then
marked `failed` in `analysis_runs` and logged rather than silently producing bad
data.

**Phase 1 demo mode:** `lib/ai/provider.ts` exports one interface
(`analyzeReview()`, `generateNarrative()`) with two implementations — a
`ClaudeProvider` (real API calls, used when `ANTHROPIC_API_KEY` is set) and a
`DemoProvider` (deterministic keyword/theme matching against the demo dataset, free,
instant, no key required). The rest of the app never knows which one is active. This
is also our cost-control mechanism in dev — see §18.

---

## 6. Folder / Project Structure

```
notabl/
├─ app/
│  ├─ (marketing)/
│  │  ├─ page.tsx                  -- landing page
│  │  ├─ sample-report/page.tsx    -- public sample report
│  │  ├─ pricing/page.tsx
│  │  ├─ legal/(terms|privacy|ai-disclaimer)/page.tsx
│  ├─ (app)/
│  │  ├─ signup/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ dashboard/weekly-report/[id]/page.tsx
│  │  ├─ billing/page.tsx          -- Phase 3
│  ├─ admin/page.tsx                -- Phase 1 basic, Phase 5 full
│  ├─ api/
│  │  ├─ signup/route.ts
│  │  ├─ analysis/run/route.ts     -- manual "run analysis now" (Phase 1)
│  │  ├─ jobs/[job]/route.ts       -- cron targets (Phase 2)
│  │  ├─ stripe/webhook/route.ts   -- Phase 3
│  │  ├─ events/route.ts           -- analytics capture
├─ lib/
│  ├─ ai/ (provider.ts, extractReview.ts, computeTrends.ts,
│  │        generateReportNarrative.ts, validate.ts, prompts/)
│  ├─ db/ (prisma client, queries/)
│  ├─ email/ (templates/, send.ts)
│  ├─ payments/ (stripe.ts)
│  ├─ analytics/ (track.ts)
├─ config/
│  ├─ pricing.ts                    -- single source of truth for plan price/limits
│  ├─ themes.ts                     -- theme category enum (shared FE/BE/AI)
│  ├─ industries.ts                 -- industry enum, dental-only active for MVP
├─ prisma/
│  ├─ schema.prisma
│  ├─ seed.ts                       -- loads demo business + demo reviews
├─ data/
│  └─ demo-reviews/dental-demo-reviews.json
├─ components/ (ui/, dashboard/, report/, marketing/)
├─ marketing/                        -- non-code marketing assets (§14)
│  ├─ customer-profile.md
│  ├─ core-sales-message.md
│  ├─ landing-page-copy-variants.md
│  ├─ outreach-materials.md
│  ├─ personalized-outreach-system.md
│  ├─ content-ideas.md
│  ├─ weekly-marketing-report-design.md
├─ docs/
│  ├─ ARCHITECTURE.md               -- this file
│  ├─ PHASE-1-TEST-NOTES.md
│  ├─ CREDENTIALS-NEEDED.md
├─ legal/ (placeholder source docs, also rendered at /legal/*)
```

---

## 7. Estimated Monthly Operating Costs

Assumes weekly analysis per business, ~50-150 reviews analyzed per business per
run (most runs process only *new* reviews after the first backfill — see §18), Claude
Sonnet-class pricing, Vercel Pro once traffic justifies it, Supabase/Resend/Stripe at
their published tiers as of mid-2025 (verify current pricing before committing —
these vendors change tiers periodically).

| | 10 customers | 100 customers | 1,000 customers |
|---|---|---|---|
| Hosting (Vercel) | $0 (Hobby) | $20 (Pro) | $20-150 (Pro + usage) |
| Database (Supabase) | $0 (Free tier) | $25 (Pro) | $25-100 (Pro + add-ons) |
| Email (Resend) | $0 (Free, <3k/mo) | ~$20 (Pro tier) | ~$90-100 (higher volume tier) |
| AI (Claude API) | ~$5-15 | ~$50-150 | ~$500-1,500 |
| Stripe fees | 2.9%+$0.30/txn (~$16 at 10 paid) | ~$160 at 100 paid | ~$1,600 at 1,000 paid |
| **Estimated total (excl. Stripe fees)** | **~$5-30/mo** | **~$115-345/mo** | **~$635-1,850/mo** |

At $49/month × 10 paying customers = $490 MRR against maybe $20-45 in costs — very
healthy margin even at tiny scale, which is the point of this design. The AI line is
the one that scales with usage rather than being fixed, which is exactly why §18
(cost control: only reprocess new reviews, cache rollups, deterministic Stage 2) matters —
without it, re-analyzing all reviews every week would multiply that AI cost line by
10-20x at the 1,000-customer tier.

---

## 8. External Accounts / API Keys You Will Need

| Service | Needed for | When |
|---|---|---|
| **Anthropic (Claude API) key** | Real AI analysis instead of demo mode | Now if you want live AI in Phase 1; otherwise Phase 2 |
| **Supabase project** (URL + anon key + service role key) | Real database + auth | Before Phase 2 (moving off local SQLite) |
| **Vercel account** | Hosting + cron | Before first deploy |
| **Stripe account** (+ webhook signing secret) | Subscriptions/checkout | Phase 3 |
| **Resend account** (+ verified sending domain) | Weekly report emails | Phase 2 |
| **A domain name** (e.g. notabl.io or your final chosen name) | Professional email sending + production URL | Before Phase 2 email sending (Resend needs domain verification) |
| **Google Business Profile API / Yelp Fusion API access** (or a licensed review-data provider) | Real review import (vs. demo data) | Phase 4 only — do not pursue until Phases 1-3 are validated |

None of these are required to see Phase 1 working — it runs entirely on demo data
and mock services.

---

## 9. What Can Be Built Immediately Without Credentials

Everything in Phase 1: landing page, sample report, signup flow (stores to local
SQLite), dashboard, demo review dataset, the full AI analysis *pipeline* (running in
deterministic demo mode), and all of the `/marketing` content. Also buildable now:
the full database schema, the automation job *functions* (just not yet on a live
cron schedule), the Stripe integration *code* (in Stripe test mode, using publishable
test keys if you create a free Stripe account — real card numbers never touch our
code either way), and the legal placeholder pages.

Blocked without credentials: sending real emails (Resend), a persisted cloud
database reachable outside this session (Supabase), a public production URL
(Vercel), real subscription charges (Stripe live mode), and real review data
(Google/Yelp/licensed provider). All of these are designed as swap-in
integrations, not rewrites, per the adapter pattern in §5.

---

*Proceeding to Phase 1 now.*
