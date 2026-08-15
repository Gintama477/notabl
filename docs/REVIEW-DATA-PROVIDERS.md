# Review Data Sources (point 19)

Notabl analyzes three kinds of review data today: the bundled demo
dataset, reviews manually imported by hand, and — as of August 2026 — real
Google reviews pulled via a third-party data provider (Outscraper). That
third kind is a deliberate, temporary, risk-accepted exception to the
original hard rule below, made knowingly by the business owner. Read this
whole section before touching `lib/reviews/outscraperProvider.ts`.

## The original rule, and the exception to it

The original constraint was: no live connector added by scraping — only
through an authorized API or a licensed data provider — see the Terms of
Service ("Acceptable Use") and `docs/SECURITY-AUDIT.md` ("Confirmed: no
unauthorized scraping anywhere"). That rule still stands as the target
state.

The exception: while the official Google Business Profile API application
is pending (see the "Google Business Profile API" section of
`docs/CREDENTIALS-NEEDED.md` for why that's slow — a 60+ day account-tenure
prerequisite plus a multi-week manual review), Notabl is temporarily
importing real reviews via Outscraper, a third-party provider that
collects public Google Maps data rather than using Google's own licensed
API. This is legally murkier than the rest of this product's data
sourcing: Google actively sued a comparable provider (SerpApi) in December
2025 over this exact practice, under DMCA anti-circumvention claims — see
the research trail in the chat history around August 2026 for the specific
findings. The business owner was shown this finding directly and chose to
accept the risk short-term, specifically to have real data for early
pilot customers, with an explicit plan to move to the properly licensed
Google Business Profile API (or Yelp's paid, fully-licensed API) once
either is in reach. This was not an oversight — flag it prominently if
asked to review this codebase for compliance, and don't quietly "fix" it
by ripping it out without checking with the business owner first, since
it's a live, load-bearing part of getting real customers today.

**If you're reading this months later and revenue now supports the
official APIs: retire `lib/reviews/outscraperProvider.ts`, swap the
registration in `lib/reviews/provider.ts`'s `getReviewDataProvider()` for
a real `GoogleBusinessProfileProvider` (or a Yelp equivalent), and delete
this whole "exception" section — nothing downstream needs to change, since
both implement the same `ReviewDataProvider` interface.**

## The abstraction

`lib/reviews/provider.ts` defines one interface, `ReviewDataProvider`, with
a single method: `fetchReviews({ businessName, sourceUrl }) => ReviewRecord[]`.
Everything downstream — review storage, theme extraction, trend rollups,
weekly reports — only ever sees the resulting `ReviewRecord[]`, so adding a
real connector later never touches `lib/analysis/runAnalysis.ts` or
`lib/db/queries.ts`. This mirrors the same pattern already used for AI
(`lib/ai/provider.ts`), email (`lib/email/send.ts`), and billing
(`lib/billing/provider.ts`) — one seam, swap what's behind it.

## What exists today

- **`google`** (`OutscraperReviewProvider`) — see the exception explained
  above. Connected per-business via the admin dashboard's "Connect Real
  Google Reviews" form (`components/admin/PilotManagement.tsx` →
  `ConnectGoogleReviewsForm`, `app/api/admin/reviews/connect-google`), which
  takes a business and its Google Place ID. Safe to re-run to pick up new
  reviews since the last sync — duplicates are skipped the same way as
  every other source. Requires `OUTSCRAPER_API_KEY`.
- **`demo`** (`DemoReviewProvider`) — the bundled synthetic dataset
  (`data/demo-reviews/dental-demo-reviews.json`). Every signup gets this
  same dataset today; see the demo-data banners throughout the app
  (`components/dashboard/DemoDataBanner.tsx`, the sample report page) for
  how it's labeled to users.
- **`manual`** (`lib/reviews/importManual.ts`) — for a small, already-in-hand
  set of reviews (e.g. a pilot practice exported their own reviews from
  somewhere). Not a live sync: you call `importManualReviews(businessId,
  reviews)` directly with an array of `{ externalReviewId, authorName,
  rating, reviewText, reviewDate }` objects; it validates with Zod and
  inserts them the same way any other source's reviews are stored, safely
  re-runnable (duplicates by `externalReviewId` are skipped, not
  re-inserted). No file-upload UI exists for this yet — add one only if it
  turns out to be genuinely needed, not preemptively.

## What a future real connector must implement

Implement `ReviewDataProvider` in a new file under `lib/reviews/`, register
it in `getReviewDataProvider()` in `lib/reviews/provider.ts`, and it fits
the existing pipeline with no other code changes. Requirements (also stated
as comments directly in `lib/reviews/provider.ts`, which is the source of
truth if this doc and the code ever drift):

1. **Only ever call an authorized API** with credentials the business owner
   (or Notabl, with their explicit permission) actually holds. Candidates:
   the Google Business Profile API, the Yelp Fusion API, or a licensed
   third-party review-data provider. Never scrape a review site's HTML —
   this violates those platforms' terms of service and this product's own
   Terms of Service.
2. **`externalReviewId` must be stable** across repeated calls for the same
   review, so re-syncing the same business doesn't create duplicate rows —
   this is enforced at the database level by the
   `reviews_source_external_unique` index on `(review_source_id,
   external_review_id)`.
3. **`reviewDate` must be the review's actual posted date** from the
   source, not the time of the sync — the entire trend/rollup system
   (`lib/ai/computeTrends.ts`) depends on genuine dates to compare "this
   period vs. the prior period" correctly.
4. **On partial failure, throw — don't return a truncated list silently.**
   If the API returns some reviews and then errors, callers need to know
   the sync was incomplete rather than treating a partial result as
   complete data.
5. **Respect the source platform's rate limits and terms of service.**

## What this deliberately does NOT include

No scraper, no headless-browser review harvester, no "unofficial API"
wrapper, and no bulk import of review data obtained from anywhere other
than the review's own author or an authorized API — matching the explicit
constraint in the product requirements and the Terms of Service.
