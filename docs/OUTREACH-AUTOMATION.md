# Outreach Automation — Semi-Automated Cold Email (point 24, revisited)

## The conflict this resolves

The original product requirements included an explicit rule (point 24, see
the inline comment in `app/api/admin/pilot/invite/route.ts`): no automated
mass outreach. The pilot-invite flow was built to match — one practice at a
time, no bulk/CSV path, always a manual admin action.

The business owner then asked to automate finding and emailing prospective
dental practices. That's a direct tension with point 24 as originally
written, and it was surfaced explicitly rather than quietly built around:
the owner was told about the conflict and chose a resolution themselves —
**semi-automated, not fully automated**. Finding prospects and drafting
their emails is automated; actually sending one is not. Every send is a
deliberate, individual click by a human after reviewing that specific
email. The owner also said explicitly that if this review step becomes too
much friction in practice, they may switch to full autosend later — that
hasn't happened yet, and would need its own explicit go-ahead when/if it
does. If you're reading this later and asked to "finish automating" this
feature, check with the business owner first rather than assuming that
means removing the review step.

## How it works

1. **Find** (`app/api/admin/outreach/find`, `lib/db/queries.ts`'s
   `findAndDraftProspects`) — takes a city/state (and optional category,
   default "Dentist"), calls `lib/outreach/findProspects.ts` (Outscraper
   Maps Search), and for each practice not already in the `prospects` table
   (deduped by Google Place ID), drafts a Tier-1 cold-outreach email and
   inserts a `status: "drafted"` row. **This step sends nothing.**
2. **Review** (the "Outreach — Cold Email" section of `/admin`,
   `components/admin/OutreachQueue.tsx`) — every drafted row is listed with
   an editable contact email, subject, and body. The admin can hand-edit
   any of it (e.g. add a real first-name greeting if they happen to know
   one) or skip a prospect entirely.
3. **Send** (`app/api/admin/outreach/send`, `sendProspectEmail`) — one
   explicit click per prospect. Enforces `OUTREACH_DAILY_SEND_CAP` (default
   15, see below) via a real DB count query — global, not per-IP, unlike
   `lib/rateLimit.ts`. Marks the row `"sent"` only if a real email actually
   went out; in demo mode (no `RESEND_API_KEY`) it's marked `"demo_sent"`
   instead, so the queue can never be mistaken for real sends that didn't
   happen. Demo sends don't count against the cap.

## What's deliberately NOT here

- No "send all" / bulk-send button, on purpose.
- No claim of having analyzed a specific practice's actual reviews. Every
  drafted email is Tier 1 per `marketing/personalized-outreach-system.md`
  — public listing info only (name, city/state, a public star
  rating/review count), never a line like "I noticed your reviews mention
  X." That validation rule is enforced by construction here: the drafting
  code (`lib/email/templates/outreachEmail.ts`) never reads review content
  at all, only what `lib/outreach/findProspects.ts` returns from Outscraper
  Maps *Search* (business directory data), not Maps *Reviews*.
- No `{{first_name}}` personalization. `marketing/outreach-materials.md`'s
  template assumes a human researched the contact's first name by hand;
  Outscraper's business-search results don't reliably include one, so the
  auto-drafted greeting is just "Hi," — meant to be edited per-prospect in
  the review step if the admin knows a name, not sent as-is at scale. This
  was a deliberate adaptation of the approved template, flagged here rather
  than silently decided.

## Data source note

`lib/outreach/findProspects.ts` uses the same Outscraper API key
(`OUTSCRAPER_API_KEY`) as the real-Google-reviews connector
(`lib/reviews/outscraperProvider.ts`), but calls a different endpoint (Maps
*Search*, not Maps *Reviews*) for a meaningfully different purpose: basic
public business-directory fields (name, address, phone, website, star
rating/review count), never individual review text. That's a lower-risk use
of the same provider than the reviews connector — see
`docs/REVIEW-DATA-PROVIDERS.md` for the fuller legal context on Outscraper
generally (the Google-vs-SerpApi litigation, etc.) — but it's the same
company and the same "field names aren't live-verified, throws loudly on
unexpected response shape" caveat applies. If a real search call fails,
check the thrown error's raw-response excerpt before assuming the whole
approach is broken.

## Env vars

- **`OUTSCRAPER_API_KEY`** — already required for the Google-reviews
  connector; reused here.
- **`OUTREACH_SENDER_NAME`** (optional, defaults to `"Notabl"`) — the
  sign-off name on drafted emails. Set this to your actual name —
  `marketing/outreach-materials.md` is explicit that outreach should be
  sent "from a real name and a real-looking personal address, not `team@`
  or `noreply@`."
- **`OUTREACH_FROM_ADDRESS`** (optional, falls back to
  `EMAIL_FROM_ADDRESS`) — same reasoning, for the actual From: header once
  Resend is configured. Worth setting to a real personal-looking address
  separately from the product's transactional `EMAIL_FROM_ADDRESS`.
- **`OUTREACH_DAILY_SEND_CAP`** (optional, defaults to `15`) — global cap
  on real sends per rolling 24 hours, enforced in `sendProspectEmail`.

None of these are required to test the feature end to end — without
`RESEND_API_KEY`, every "Send" click safely logs to the console and marks
the row `"demo_sent"` instead of emailing anyone real, same as every other
email path in this app (see `lib/email/send.ts`).
