// Outscraper Maps Search — finds prospective dental practices by city/state
// for the outreach-automation feature (see docs/OUTREACH-AUTOMATION.md).
// Same "temporary, deliberate, risk-accepted" category as
// lib/reviews/outscraperProvider.ts (same provider, same
// OUTSCRAPER_API_KEY), but a meaningfully lower-risk use of it: this only
// ever reads basic public business-directory fields (name, address, phone,
// website, a public star rating/review count) to build a cold-outreach
// list — it never fetches or reads individual review text, which is where
// the legal caveat documented in docs/REVIEW-DATA-PROVIDERS.md actually
// bites. Still worth knowing this calls the same third-party API family;
// flagged here rather than assumed.
//
// Field names below are based on Outscraper's published examples for the
// /maps/search-v3 endpoint as of this writing, not a live-verified
// response — Outscraper doesn't guarantee a stable schema. If a real call
// fails or returns an unexpected shape, this throws loudly (per project
// convention — see the same note in outscraperProvider.ts) rather than
// silently returning nothing or garbage rows. Check the thrown error's
// raw-response excerpt and adjust the mapping below; that's a mapping bug,
// not a sign the whole approach is broken.

const OUTSCRAPER_SEARCH_ENDPOINT = "https://api.outscraper.cloud/maps/search-v3";

type OutscraperBusiness = {
  name?: string;
  site?: string | null;
  website?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  city?: string | null;
  state?: string | null;
  place_id?: string | null;
  google_id?: string | null;
  rating?: number | null;
  reviews?: number | null;
  // Optional email-enrichment field Outscraper's docs mention for some
  // search configurations — not guaranteed to be present; treated as a
  // convenience, never required.
  email_1?: string | null;
};

type OutscraperSearchResponse = {
  data?: unknown;
};

export type FoundProspect = {
  businessName: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  googlePlaceId: string;
  googleRating: number | null;
  googleReviewCount: number | null;
  contactEmail: string | null;
};

function flattenBusinesses(data: unknown): OutscraperBusiness[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `Outscraper search response's "data" field wasn't an array — response shape may have changed: ${JSON.stringify(
        data
      ).slice(0, 500)}`
    );
  }
  // The API groups results per query string when multiple queries are sent
  // in one call (comma-separated in `query`) — data[i] is itself an array
  // of businesses for query i. A single-query call has been observed
  // returning both that nested shape and a flat array of businesses
  // directly in different Outscraper endpoints, so handle both rather than
  // guessing which one applies here.
  if (data.length > 0 && Array.isArray(data[0])) {
    return (data as unknown[][]).flat() as OutscraperBusiness[];
  }
  return data as OutscraperBusiness[];
}

export type FindProspectsResult = {
  prospects: FoundProspect[];
  /**
   * Usable listings the API returned BEFORE the rating/review filters
   * below. Reported separately from prospects.length so the admin can tell
   * "this city only has 12 dentists" apart from "50 came back and your
   * filter rejected 38" — opposite problems that look identical from a
   * bare result count.
   */
  searchedCount: number;
};

export async function findProspects(opts: {
  city: string;
  state: string;
  category?: string;
  limit?: number;
  // Applied AFTER the response is mapped. Outscraper's Maps Search has no
  // documented server-side rating or review-count filtering, so this is a
  // post-fetch filter over whatever comes back — which is why a filtered
  // search returns fewer rows than `limit` and why that gets reported
  // rather than quietly re-querying to top the number back up (each
  // re-query is another billed call the admin didn't ask for).
  minRating?: number;
  maxRating?: number;
  minReviewCount?: number;
  maxReviewCount?: number;
}): Promise<FindProspectsResult> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error("OUTSCRAPER_API_KEY is not set — add it in Vercel Environment Variables before finding prospects.");
  }

  const category = opts.category?.trim() || "Dentist";
  // Capped at 100 (raised from 50). A search near that size can run past
  // the 60s ceiling on the calling route — see the maxDuration comment in
  // app/api/admin/outreach/find/route.ts, and the warning under the form's
  // limit input. 20 stays the default when the caller doesn't ask.
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
  const query = `${category}, ${opts.city}, ${opts.state}, US`;

  const url = new URL(OUTSCRAPER_SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", "en");
  url.searchParams.set("async", "false");

  const res = await fetch(url.toString(), { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Outscraper search request failed (${res.status}) for "${query}": ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as OutscraperSearchResponse;
  const businesses = flattenBusinesses(json.data);

  // Missing place_id/google_id rows are skipped rather than aborting the
  // whole batch (unlike outscraperProvider.ts's per-review throw) — this is
  // a bulk discovery search, not a sync where partial data implies a
  // corrupted account history; one bad row among twenty shouldn't lose the
  // other nineteen.
  const seen = new Set<string>();
  const results: FoundProspect[] = [];
  for (const b of businesses) {
    const placeId = b.place_id || b.google_id;
    if (!placeId || !b.name) continue;
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    results.push({
      businessName: b.name,
      website: b.site || b.website || null,
      phone: b.phone || b.phone_number || null,
      city: b.city || opts.city,
      state: b.state || opts.state,
      googlePlaceId: placeId,
      googleRating: typeof b.rating === "number" ? b.rating : null,
      googleReviewCount: typeof b.reviews === "number" ? b.reviews : null,
      contactEmail: b.email_1 || null,
    });
  }

  // A listing with no rating at all can't satisfy a rating filter, so it's
  // excluded when one is set rather than being let through on a
  // technicality — asking for "4.3 stars and below" and receiving unrated
  // practices would be a worse answer than a shorter list.
  const matches = (p: FoundProspect): boolean => {
    if (opts.minRating != null && (p.googleRating == null || p.googleRating < opts.minRating)) return false;
    if (opts.maxRating != null && (p.googleRating == null || p.googleRating > opts.maxRating)) return false;
    if (opts.minReviewCount != null && (p.googleReviewCount == null || p.googleReviewCount < opts.minReviewCount)) return false;
    if (opts.maxReviewCount != null && (p.googleReviewCount == null || p.googleReviewCount > opts.maxReviewCount)) return false;
    return true;
  };

  return { prospects: results.filter(matches), searchedCount: results.length };
}
