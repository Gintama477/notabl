// Review-data source abstraction (point 19). Mirrors the same pluggable-
// provider pattern already used for AI (lib/ai/provider.ts), email
// (lib/email/send.ts), and billing (lib/billing/provider.ts) — one
// interface, swap the implementation behind it, nothing downstream changes.
//
// What exists today: DemoReviewProvider (the bundled synthetic dataset) and
// ManualReviewProvider (importing a small, already-in-hand set of reviews —
// e.g. something a pilot practice exported themselves — without a live API).
//
// What does NOT exist, on purpose: a Google Business Profile / Yelp / any
// other live connector. Building one requires either an authorized API
// (Google Business Profile API, Yelp Fusion API) or a licensed data
// provider — never scraping (see the Terms of Service "Acceptable Use"
// section and docs/SECURITY-AUDIT.md's "no unauthorized scraping" finding).
// See "Building a real connector" below for the exact contract a future
// implementation must satisfy — this file is the single source of truth
// for that contract, not just documentation of it.

export type ReviewRecord = {
  // Stable ID from the source system, used for de-duplication on repeated
  // syncs (see reviews.externalReviewId + the reviews_source_external_unique
  // index in lib/db/schema.ts). Required — a provider that can't supply a
  // stable ID can't be synced safely more than once.
  externalReviewId: string;
  authorName: string | null;
  rating: number; // 1-5, whole star rating
  reviewText: string;
  reviewDate: string; // ISO-8601 — must be the review's actual posted date, not the sync time
};

export interface ReviewDataProvider {
  // Machine-readable identifier stored on review_sources.source_type.
  name: "demo" | "manual" | "google" | "yelp";
  // Human-readable label for UI (e.g. "connect a Google Business Profile").
  label: string;
  // Fetches every available review for a business from this source.
  // sourceUrl is whatever the business supplied when connecting the source
  // (e.g. a Google Business Profile URL) — demo/manual providers ignore it.
  // Must throw a clear Error rather than return an empty array on failure,
  // so callers can distinguish "no reviews yet" from "the fetch broke."
  fetchReviews(opts: { businessName: string; sourceUrl?: string | null }): Promise<ReviewRecord[]>;
}

// ---------------------------------------------------------------------------
// Demo provider — the bundled synthetic dataset, same data every time.
// ---------------------------------------------------------------------------

class DemoReviewProvider implements ReviewDataProvider {
  name = "demo" as const;
  label = "Demo data";

  async fetchReviews(): Promise<ReviewRecord[]> {
    const { loadDemoReviews } = await import("@/lib/demo/loadDemoReviews");
    const demo = loadDemoReviews();
    return demo.reviews.map((r) => ({
      externalReviewId: r.id,
      authorName: r.authorName,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewDate: r.reviewDate,
    }));
  }
}

// ---------------------------------------------------------------------------
// Manual provider — a small, already-in-hand set of reviews (e.g. a pilot
// practice's own export), imported once. Not a live sync; the caller passes
// the reviews directly rather than this provider fetching them from
// anywhere. Deliberately minimal — no CSV parser, no file upload UI; if that
// becomes useful later it layers on top of this without changing the shape.
// ---------------------------------------------------------------------------

class ManualReviewProvider implements ReviewDataProvider {
  name = "manual" as const;
  label = "Manually imported reviews";

  async fetchReviews(): Promise<ReviewRecord[]> {
    throw new Error(
      "ManualReviewProvider.fetchReviews() is not how manual import works — pass reviews directly to " +
        "importManualReviews() in lib/reviews/importManual.ts instead. This provider exists so 'manual' " +
        "is a valid review_sources.source_type with a documented place in the provider registry."
    );
  }
}

// ---------------------------------------------------------------------------
// Building a real connector (Google Business Profile, Yelp Fusion, or a
// licensed data provider): implement ReviewDataProvider above, register it
// in getReviewDataProvider() below, and it fits the same shape reviews
// already flow through — nothing in lib/analysis/runAnalysis.ts or
// lib/db/queries.ts needs to change. Requirements for a real implementation:
//
// 1. Only ever call an authorized API with credentials the business owner
//    (or Notabl, with their permission) actually holds — never scrape a
//    review site's HTML. This is a hard line, not a style preference; see
//    the Terms of Service and docs/SECURITY-AUDIT.md.
// 2. externalReviewId must be stable across repeated calls for the same
//    review, so re-syncing doesn't create duplicates (enforced at the DB
//    level by reviews_source_external_unique).
// 3. reviewDate must be the review's actual posted date from the source,
//    not "now" — the whole trend/rollup system depends on real dates.
// 4. On partial failure (e.g. the API returns some reviews then errors),
//    throw rather than silently returning a truncated list — callers should
//    know a sync was incomplete, not treat a partial result as complete.
// 5. Respect the source platform's rate limits and terms of service.
// ---------------------------------------------------------------------------

let cachedProvider: ReviewDataProvider | null = null;

export function getReviewDataProvider(sourceType: string = "demo"): ReviewDataProvider {
  if (sourceType === "demo") {
    if (!cachedProvider || cachedProvider.name !== "demo") cachedProvider = new DemoReviewProvider();
    return cachedProvider;
  }
  if (sourceType === "manual") {
    return new ManualReviewProvider();
  }
  throw new Error(
    `No review data provider is implemented for source type "${sourceType}" yet. See the "Building a real ` +
      `connector" comment in lib/reviews/provider.ts for the exact contract to implement, and ` +
      `docs/CREDENTIALS-NEEDED.md for what account/API access it would require.`
  );
}
