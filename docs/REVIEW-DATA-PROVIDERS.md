# Review Data Sources (point 19)

Notabl currently analyzes exactly two kinds of review data: the bundled
demo dataset, and reviews manually imported by hand. There is no live
connector to Google, Yelp, Facebook, Healthgrades, or any other review
platform, and none will be added by scraping — only through an authorized
API or a licensed data provider. This is a hard constraint, not a
prioritization choice; see the Terms of Service ("Acceptable Use") and
`docs/SECURITY-AUDIT.md` ("Confirmed: no unauthorized scraping anywhere").

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
