# Project Handoff — read this first if you're picking this up fresh

This file exists so a new Claude session (Claude Code, a new Cowork
session, or a human) can get oriented without needing this project's full
chat history. It's a living "current state" doc — update it as things
change, don't let it go stale like `docs/STATUS-REPORT.md` did (that one's
now a historical snapshot from an early cleanup pass, not current status).

## What this is

Notabl — a SaaS tool that turns a dental practice's patient reviews into a
plain-language weekly summary (recurring themes, what's improving/getting
worse, recommended actions). Live at **trynotabl.com**, deployed on Vercel,
backed by a Supabase Postgres database (project name "notabl", region
us-east-2). Admin panel at **trynotabl.com/admin**, gated by a shared
`ADMIN_SECRET` (already rotated once this project — ask the business owner
if you need the current value, don't assume any default).

## How code gets deployed (updated Aug 2026)

Earlier in this project, all work happened through a Claude cloud session
(Cowork), which had **no working `git push` path** to `gintama477/notabl` —
a proxy blocked it at the network level for that session type, confirmed
thoroughly (direct push attempts, GitHub API calls, connector checks all
blocked the same way). The workaround at the time was pasting changed files
directly into GitHub's web UI.

**As of Aug 2026, the owner set up Claude Code running locally on their own
Mac**, authenticated with their own GitHub account via `gh auth login`. If
you're reading this as that local Claude Code session: you have real `git
push` access via the owner's local git credentials — just use it normally,
no workaround needed. The above paragraph is historical context for why
older commits may look like they were made oddly (single-file pastes,
batched unusual-looking diffs).

If a future Cowork session ever picks this project back up: the git-push
block described above was real and confirmed at the product level, not a
one-off bug — don't spend time re-diagnosing it, just use the same
paste-into-GitHub workaround, or better, tell the owner to use their local
Claude Code setup instead for anything code-related.

## Standing operating instructions from the business owner

Given early in this project and still in force: *"Do as much work yourself
as you safely can. Do not ask me technical questions that you can
reasonably decide yourself. When an action requires access to one of my
accounts, credentials, payments, or external authorization, stop and ask
me instead of guessing."* The owner is non-technical — explain things in
plain language, confirm each deploy step actually worked (ask for a
screenshot if unsure), and don't assume familiarity with dev tooling.

## Billing (Stripe) — DONE, confirmed working live (Aug 2026)

Stripe test-mode ("Sandbox") billing is fully wired up and verified
end-to-end: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO`, and
`STRIPE_WEBHOOK_SECRET` are all set in Vercel. Tested live with a real
Stripe Checkout session using a test card (4242 4242 4242 4242) on a
throwaway test signup — the checkout completed, redirected back
correctly, and the Stripe webhook correctly updated the subscription
status in the database (visible in `/admin`'s Subscriptions table).

Note: `lib/billing/stripeProvider.ts` sets `trial_period_days` on checkout
(pulled from `PLANS[DEFAULT_PLAN].trialDays`), so a brand-new subscription
shows status `trialing` with a real trial-end date immediately after a
successful checkout — that's expected, correct behavior, not a bug. It
only becomes `active` after the trial period ends and the first real (in
test mode, fake) charge succeeds. As of Aug 2026 this only ever happens
once per account: a second checkout (stripeCustomerId already on file)
skips the trial and charges immediately — see the one-trial-per-account
note in `lib/billing/stripeProvider.ts`.

This is still **test-mode only** — switching to real/live Stripe keys to
accept actual money is a separate, deliberate step that needs its own
explicit go-ahead from the owner before happening. Don't do it
proactively.

## Currently in progress: outreach automation feature

Semi-automated cold-email system for reaching prospective (not-yet-signed-up)
dental practices — see `docs/OUTREACH-AUTOMATION.md` for the full design
and the "point 24 / no automated mass outreach" policy conflict it
resolves (owner explicitly approved a human-reviews-and-approves-each-send
design; said they may switch to full autosend later if the review step
becomes too much friction — that would need a fresh explicit go-ahead,
don't assume it's already been given).

**Status:** built and working, confirmed by the owner. Field mapping was
fixed against a real Outscraper `/maps/search-v3` response (the temporary
`app/api/admin/outreach/debug-search` diagnostic route was used to confirm
this, then deleted — Aug 2026 audit found and removed it) — `website`,
`phone`, `address`, `city`, `state_code` all map correctly and display in
the queue UI. **There is no email field anywhere in that API response** —
contact email is never auto-populated and must be typed in by hand for
every prospect. This is a real data-source limitation, not a bug to keep
chasing.

## Known pending items (surfaced to owner, awaiting their decision)

- **Supabase RLS is disabled on all 14 tables.** Flagged to the owner
  directly (a Supabase tool advisory instructed surfacing this without
  auto-applying a fix). Not yet acted on either way — don't silently
  enable or silently ignore; ask where they landed if it comes up again.
- **`RESEND_API_KEY` not set** — all email (weekly reports, pilot invites,
  login links, outreach) runs in safe demo/log-only mode: nothing is
  actually emailed, sends are logged to the console and (for most email
  types) the `email_deliveries` table instead.
- **`OUTREACH_SENDER_NAME` / `OUTREACH_FROM_ADDRESS` not set** — drafted
  outreach emails currently sign off as "Notabl" instead of the owner's
  real name, which their own outreach materials doc says to avoid.
- **Google Business Profile API application is paused**, not abandoned —
  see `docs/CREDENTIALS-NEEDED.md` for the 60-day-tenure blocker and how to
  resume it. `lib/reviews/outscraperProvider.ts` is a deliberate, owner-
  accepted temporary stand-in with a real legal caveat — see
  `docs/REVIEW-DATA-PROVIDERS.md` before touching or removing it.
- **Yelp integration** — not started, timing is the owner's own call, not
  currently blocked on anything technical known to us.

## What's confirmed actually working end-to-end (tested live, not just built)

- Real Google review import via the admin panel (tested with a real
  practice, Newton Corner Dental Office — 200 reviews imported, duplicate
  re-syncs correctly skip already-imported reviews).
- Demo-data cleanup on first real connect (was buggy, now fixed and
  verified — connecting real reviews clears the synthetic demo dataset and
  hides the demo banner).
- Outreach queue: finding/drafting prospects from a real Outscraper search,
  reviewing/editing a draft, and demo-mode "sending" (logs only, marks
  `demo_sent`) all confirmed working by the owner.
- Stripe test-mode billing, full checkout-to-webhook-to-database flow,
  confirmed working by the owner (see Billing section above).

## Where to look for more context

Every non-obvious decision in this codebase has a comment explaining *why*,
not just *what* — same for the docs in this folder. If something looks odd
or seems like it should be "fixed," read the surrounding comment first;
several things that look like bugs at a glance (e.g. the Outscraper
provider, the lack of bulk outreach sending) are deliberate, owner-approved
tradeoffs with reasoning attached, not oversights.
