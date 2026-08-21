// Outscraper-backed Google review provider — a DELIBERATE, TEMPORARY,
// risk-accepted stand-in for the real Google Business Profile API while
// that application is pending approval (see docs/CREDENTIALS-NEEDED.md and
// docs/REVIEW-DATA-PROVIDERS.md for the full reasoning and the specific
// legal caveat: Outscraper and similar providers work by collecting public
// Google Maps data, not through a licensing relationship Google has itself
// authorized — Google is actively litigating against at least one
// comparable provider (SerpApi, filed Dec 2025) over this exact practice.
// This was a knowing, explicit decision by the business owner to accept
// that risk short-term in order to have real review data for early pilots,
// NOT an oversight or a permanent architectural choice. Swap this file's
// registration in provider.ts for a real GoogleBusinessProfileProvider the
// moment official API access is approved — nothing else in the codebase
// needs to change when that happens, since both implement the same
// ReviewDataProvider interface.
//
// sourceUrl for this provider is expected to be a Google Place ID (e.g.
// "ChIJrc9T9fpYwokRdvjYRHT8nI4"), not a full URL — see the admin "Connect
// Google Reviews" form for where that gets collected.

// Type-only import — avoids a runtime circular dependency with provider.ts,
// which imports this file's class at the top level to register it.
import type { ReviewDataProvider, ReviewRecord } from "@/lib/reviews/provider";

const OUTSCRAPER_ENDPOINT = "https://api.outscraper.cloud/maps/reviews-v3";

// Cap on how many reviews we import per connect/sync. Raised from 200 to
// 500 — several practices in the outreach queue have 280-400 real reviews,
// so 200 silently truncated a real signup's history with nothing telling
// them that happened. 500 covers a normal practice at negligible cost:
// Outscraper's published pricing (outscraper.com/google-maps-reviews-scraper,
// as of this writing) is per-review, not per-request — the first 500
// reviews per month are free, and beyond that it's $0.003/review — so this
// change does not meaningfully affect spend. No documented hard per-request
// ceiling was found in Outscraper's public docs (their interactive API
// reference isn't reachable for an automated check); if a real 500-review
// import throws or silently truncates further, that's the actual vendor
// ceiling and this constant needs lowering, not removing.
//
// Exported so connectGoogleReviewSource (lib/db/queries.ts) can detect
// truncation: a response with exactly this many reviews means there are
// probably more on the actual listing than we imported, which gets
// recorded on the review source and shown plainly on the dashboard — never
// let a truncated import present itself as complete.
export const OUTSCRAPER_REVIEWS_LIMIT = 500;

// Field names below are based on Outscraper's published examples as of
// this writing, not a live-verified response — Outscraper does not
// guarantee a stable schema. If real calls start failing or returning
// unexpected shapes, log the raw response (rawPayloadJson on the review
// insert already preserves this) and adjust the mapping below; that's a
// mapping bug, not a sign the whole approach is broken.
type OutscraperReview = {
  review_id?: string;
  google_id?: string;
  author_id?: string;
  author_title?: string | null;
  author_link?: string | null;
  review_text?: string | null;
  review_rating?: number;
  review_datetime_utc?: string | null;
  review_timestamp?: number | null;
  review_link?: string | null;
};

type OutscraperResponse = {
  data?: Array<{ reviews_data?: OutscraperReview[] }>;
};

function toIsoDate(r: OutscraperReview): string {
  if (r.review_datetime_utc) {
    const parsed = new Date(r.review_datetime_utc);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof r.review_timestamp === "number") {
    return new Date(r.review_timestamp * 1000).toISOString();
  }
  // Neither field parsed — this is exactly the "partial/broken data" case
  // the project rule says to fail loudly on, not silently backdate.
  throw new Error("Outscraper review missing a usable date (review_datetime_utc/review_timestamp).");
}

function stableExternalId(r: OutscraperReview): string {
  if (r.review_id) return r.review_id;
  if (r.google_id) return r.google_id;
  if (r.author_id && (r.review_datetime_utc || r.review_timestamp)) {
    return `${r.author_id}:${r.review_datetime_utc ?? r.review_timestamp}`;
  }
  if (r.review_link) return r.review_link;
  throw new Error(
    "Outscraper review has no field usable as a stable externalReviewId (checked review_id, google_id, " +
      "author_id+date, review_link). Re-syncing would risk duplicate rows, so refusing to import this record."
  );
}

export class OutscraperReviewProvider implements ReviewDataProvider {
  name = "google" as const;
  label = "Google reviews (via Outscraper — temporary, see docs/REVIEW-DATA-PROVIDERS.md)";

  async fetchReviews(opts: { businessName: string; sourceUrl?: string | null }): Promise<ReviewRecord[]> {
    const placeId = opts.sourceUrl;
    if (!placeId) {
      throw new Error(
        `No Google Place ID provided for "${opts.businessName}" — connect a source with a valid Place ID first.`
      );
    }

    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) {
      throw new Error("OUTSCRAPER_API_KEY is not set — add it in Vercel Environment Variables before syncing.");
    }

    const url = new URL(OUTSCRAPER_ENDPOINT);
    url.searchParams.set("query", placeId);
    url.searchParams.set("reviewsLimit", String(OUTSCRAPER_REVIEWS_LIMIT));
    url.searchParams.set("language", "en");
    url.searchParams.set("async", "false");
    // Best-effort request for newest-first SELECTION when the limit above
    // truncates — NOT relied on alone. This param name/value is unverified
    // against live Outscraper docs (their interactive API reference isn't
    // reachable for an automated check from here); if Outscraper ignores an
    // unrecognized query param it's a harmless no-op. What actually
    // guarantees "most recent" below is the explicit sort of whatever comes
    // back, by reviewDate, in code — see the sort call further down. That
    // fixes the ORDER of what we received; it can't fix a wrong SELECTION
    // if the API silently returned an arbitrary (not newest) 500 out of a
    // larger total. Confirm this against a real multi-hundred-review
    // business before relying on it operationally (compare the newest
    // imported review's date against the practice's actual Google listing).
    url.searchParams.set("sort", "newest");

    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": apiKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Outscraper request failed (${res.status}) for "${opts.businessName}": ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as OutscraperResponse;
    const rawReviews = json.data?.[0]?.reviews_data;
    if (!Array.isArray(rawReviews)) {
      throw new Error(
        `Outscraper response for "${opts.businessName}" didn't contain the expected reviews_data array — ` +
          `response shape may have changed. Raw response: ${JSON.stringify(json).slice(0, 500)}`
      );
    }

    const mapped = rawReviews.map((r) => ({
      externalReviewId: stableExternalId(r),
      authorName: r.author_title ?? null,
      rating: r.review_rating ?? 0,
      reviewText: r.review_text ?? "",
      reviewDate: toIsoDate(r),
    }));

    // Explicit newest-first sort, independent of whatever order Outscraper
    // actually returned — never assume an upstream sort held, even with
    // sort=newest requested above. This guarantees correct ORDER for
    // whatever set we got; see the request-param comment above for the
    // separate SELECTION caveat this does not cover.
    mapped.sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());

    return mapped;
  }
}
