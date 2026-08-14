# Notabl (working name)

Automated weekly patient-review analysis for dental practices. "Know what
your patients are saying before small problems become big ones."

This repo is the **Phase 1** build: a functional demo with fake review
data — landing page, signup, dashboard, demo reviews, AI analysis pipeline,
sample report, email templates, and a minimal admin panel. See
`docs/ARCHITECTURE.md` for the full design and `docs/PHASE-1-TEST-NOTES.md`
for exactly what's been tested and what isn't built yet.

## Quick start

```bash
npm install
cp .env.example .env          # optional — app runs fine with no env vars set
npm run db:push               # creates the local SQLite database
npm run seed                  # seeds the public /sample-report demo business
npm run dev                   # http://localhost:3000
```

Sign up at `/signup` with any business name/email — it populates your
dashboard immediately using the bundled demo review dataset (clearly
labeled as demo data throughout the UI). No credentials required.

Visit `/sample-report` any time to see a full report with no signup
(the main public "sales tool" page). Visit `/admin` for the operator
dashboard — enter the admin key (`dev-admin` by default) on the login form
there; it's held as a short-lived signed cookie afterward, not a URL param.

## Key docs

- `docs/ARCHITECTURE.md` — architecture, stack, database schema, automation
  design, AI pipeline design, cost estimates, and what credentials you'll
  need for later phases.
- `docs/PHASE-1-TEST-NOTES.md` — what's been tested, two real bugs found
  and fixed during that testing, and current limitations.
- `docs/CREDENTIALS-NEEDED.md` — accounts/API keys needed, organized by
  phase.
- `marketing/` — customer profile, sales messaging, landing page copy
  variants, outreach email sequence, content ideas, and the design for a
  weekly marketing performance report.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply the schema to the local SQLite database |
| `npm run seed` | Seed the permanent public sample-report business |
| `npm run generate-demo-data` | Regenerate `data/demo-reviews/dental-demo-reviews.json` |

## Stack

Next.js (App Router, TypeScript) + Tailwind CSS, Drizzle ORM over SQLite
locally (Postgres/Supabase in production), a pluggable AI provider (free
deterministic demo analyzer, or real Claude via `ANTHROPIC_API_KEY`), Resend
for email, Stripe for billing (Phase 3). See `docs/ARCHITECTURE.md` §2 for
the full reasoning, including one deviation from the original plan (Prisma
→ Drizzle, due to a sandbox network restriction — has no effect on features).
