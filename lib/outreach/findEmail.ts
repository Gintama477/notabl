// Outscraper "Domain Emails & Contacts" API — finds email addresses (plus
// phones/socials, unused here) for a website domain. Same account/API key
// as every other Outscraper call in this codebase (see
// lib/reviews/outscraperProvider.ts and lib/outreach/findProspects.ts for
// the "temporary, deliberate, risk-accepted" context that applies
// site-wide to this provider — this specific endpoint only reads public
// contact info off a domain, so it doesn't carry the reviews-specific
// legal caveat, but it's the same account).
//
// Unlike maps/search-v3, this endpoint has no sync mode — per Outscraper's
// own Python SDK (outscraper/client.py, emails_and_contacts: always calls
// with wait_async=True, no `async` param sent), every call returns a task
// id that has to be polled via GET /requests/{id} until it's done. This
// mirrors what that SDK does client-side.
//
// Two response shapes have to be handled, not one:
//   1. The flat shape — { query, emails: [...], phones, site_data, socials,
//      details, contacts } — live-verified via the temporary
//      app/api/admin/outreach/debug-emails/route.ts diagnostic route
//      (since deleted). Seen when Outscraper finishes fast enough that the
//      initial /emails-and-contacts call returns the result directly,
//      skipping polling entirely.
//   2. The archived/polled shape — GET /requests/{id} wraps that same flat
//      object inside a top-level `data` array (one entry per domain
//      queried, so `data[0]` here since only one domain is ever sent).
//      This isn't a guess: it's exactly what the SDK's own polling helper
//      does — outscraper/transport.py's `_wait_request_archive(id).get(
//      'data', [])` — which only makes sense if the archive response has a
//      `data` array to begin with. Missing this unwrap was the actual bug
//      that made a well-formed response look like an unrecognized shape:
//      `finalJson.emails` was undefined because the real array was one
//      level deeper, at `finalJson.data[0].emails`.
//
// Entry shape inside `emails` also varies — confirmed from a real example:
// some entries belong to a named contact (full_name/title/socials/phones
// alongside value), others are bare addresses found on a page (just
// value/source/last_seen/first_seen). Both are valid; `value` is the only
// field ever guaranteed present.

const OUTSCRAPER_BASE = "https://api.outscraper.cloud";
const POLL_INTERVAL_MS = 4000;
const POLL_BUDGET_MS = 45000; // leaves headroom under the route's maxDuration=60

type OutscraperEmailEntry = {
  value?: string;
  source?: string | null;
  last_seen?: string | null;
  first_seen?: string | null;
  // Present only when this address belongs to a specific named contact
  // (e.g. "Angela Abernathy", "lead dentist") rather than being a bare
  // address found on a page — absent for generic/unattributed addresses
  // (e.g. a "press@" address with no named owner). Optional either way.
  full_name?: string | null;
  title?: string | null;
  socials?: Record<string, string | null> | null;
  phones?: string[] | null;
};

type OutscraperEmailsResponse = {
  query?: string;
  emails?: OutscraperEmailEntry[];
};

export type FoundEmail = {
  value: string;
  source: string | null;
  fullName: string | null;
  title: string | null;
};

async function pollUntilDone(taskId: string, apiKey: string): Promise<unknown> {
  const headers = { "X-API-KEY": apiKey };
  const deadline = Date.now() + POLL_BUDGET_MS;
  let last: unknown = null;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(`${OUTSCRAPER_BASE}/requests/${taskId}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Outscraper poll request failed (${res.status}): ${body.slice(0, 3000)}`);
    }
    last = await res.json();
    const status = (last as { status?: string })?.status;
    if (status !== "Pending") return last;
  }

  throw new Error(`Timed out waiting on Outscraper (task ${taskId}) after ${POLL_BUDGET_MS / 1000}s.`);
}

/**
 * Normalizes either response shape described in the file header down to
 * the flat { emails: [...] } object, or returns null if neither shape
 * matches (a genuine, unrecognized shape change — not this function
 * failing to unwrap a known envelope).
 */
function unwrapEmailsResponse(json: unknown): OutscraperEmailsResponse | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  if (Array.isArray(obj.emails)) return obj as OutscraperEmailsResponse;

  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const first = obj.data[0];
    if (first && typeof first === "object" && Array.isArray((first as Record<string, unknown>).emails)) {
      return first as OutscraperEmailsResponse;
    }
  }

  return null;
}

/**
 * Looks up every email Outscraper can find for a domain (its own site plus
 * any third-party pages that mention it, per each entry's `source` field).
 * Returns an empty array for a genuinely empty result — only throws for an
 * actual request/response failure, never for "no emails found".
 */
export async function fetchDomainEmails(domain: string): Promise<FoundEmail[]> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error("OUTSCRAPER_API_KEY is not set — add it in Vercel Environment Variables before looking up emails.");
  }

  const url = new URL(`${OUTSCRAPER_BASE}/emails-and-contacts`);
  url.searchParams.set("query", domain);

  const initialRes = await fetch(url.toString(), { headers: { "X-API-KEY": apiKey } });
  if (!initialRes.ok) {
    const body = await initialRes.text().catch(() => "");
    throw new Error(`Outscraper request failed (${initialRes.status}) for "${domain}": ${body.slice(0, 3000)}`);
  }
  const initialJson = (await initialRes.json()) as { id?: string } & OutscraperEmailsResponse;

  // Always async per the SDK (see file header), but handled defensively —
  // if Outscraper ever does return data synchronously, use it directly
  // rather than polling for a task id that doesn't exist.
  const rawFinal: unknown = initialJson.id ? await pollUntilDone(initialJson.id, apiKey) : initialJson;

  const finalJson = unwrapEmailsResponse(rawFinal);
  if (!finalJson || !Array.isArray(finalJson.emails)) {
    throw new Error(
      `Outscraper emails-and-contacts response for "${domain}" didn't contain an "emails" array — response shape ` +
        `may have changed. Raw response: ${JSON.stringify(rawFinal).slice(0, 3000)}`
    );
  }

  return finalJson.emails
    .filter((e): e is OutscraperEmailEntry & { value: string } => typeof e.value === "string" && e.value.length > 0)
    .map((e) => ({
      value: e.value,
      source: e.source ?? null,
      fullName: e.full_name ?? null,
      title: e.title ?? null,
    }));
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function sourceHostname(source: string | null): string | null {
  if (!source) return null;
  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

function emailAddressDomain(value: string): string | null {
  const at = value.lastIndexOf("@");
  return at === -1 ? null : value.slice(at + 1).toLowerCase() || null;
}

/** True if the email address itself (the part after `@`) is on the queried domain. */
function addressOnDomain(e: FoundEmail, normalizedDomain: string): boolean {
  const addrDomain = emailAddressDomain(e.value);
  return addrDomain !== null && normalizeHost(addrDomain) === normalizedDomain;
}

/** True if Outscraper found this email on a page that's itself on the queried domain. */
function sourceOnDomain(e: FoundEmail, normalizedDomain: string): boolean {
  const sourceHost = sourceHostname(e.source);
  return sourceHost !== null && normalizeHost(sourceHost) === normalizedDomain;
}

// Substrings checked against an entry's `title`, lowercased — matches the
// "owner, dentist, office/practice/studio manager, or coordinator" examples
// given (e.g. "lead dentist", "practice manager", "owner") plus a couple of
// obvious synonyms a dental practice's contact list would realistically use.
const DECISION_MAKER_TITLE_KEYWORDS = [
  "dentist",
  "dds",
  "dmd",
  "doctor",
  "owner",
  "manager",
  "coordinator",
  "director",
  "founder",
  "principal",
];

function hasDecisionMakerTitle(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DECISION_MAKER_TITLE_KEYWORDS.some((kw) => lower.includes(kw));
}

function localPart(value: string): string {
  const at = value.indexOf("@");
  return (at === -1 ? value : value.slice(0, at)).toLowerCase();
}

// Meant for general inquiries — a reasonable email to send an outreach pitch
// to when no named contact is available.
const GENERAL_INQUIRY_PREFIXES = ["hello", "info", "contact", "office", "admin"];

// Narrow-purpose role addresses — for a specific kind of inquiry (press,
// legal, recruiting, ...), not general contact. Someone checking one of
// these would likely ignore a sales-style outreach email, so these rank
// below even an unclassified domain-matching address; only used if
// literally nothing else on the domain is available.
const NARROW_PURPOSE_PREFIXES = ["press", "media", "pr", "privacy", "legal", "security", "careers", "jobs"];

function isGeneralInquiryAddress(value: string): boolean {
  const local = localPart(value);
  return GENERAL_INQUIRY_PREFIXES.some((prefix) => local.includes(prefix));
}

function isNarrowPurposeAddress(value: string): boolean {
  const local = localPart(value);
  return NARROW_PURPOSE_PREFIXES.some((prefix) => local.includes(prefix));
}

// Any domain-matching tier must always outrank any non-domain-matching one
// (see pickBestEmail's doc comment) — spacing domain-match category scores
// starting well above the non-domain-matching max (1) guarantees that no
// combination of category*2 + sourceBonus can ever dip below it.
const DOMAIN_MATCH_BASE = 10;

/**
 * Ranks candidate emails and returns the best one, or null if the list is
 * empty. A strict priority order, NOT an additive score — a domain match
 * always beats a title match, full stop, because a title match on the
 * wrong domain is very likely a completely unrelated person Outscraper's
 * data conflated in (e.g. a "practice manager" at some other business
 * entirely). A nicer title never overrides a domain mismatch; it only
 * breaks ties among emails that don't otherwise match the domain at all.
 *
 * Among emails that DO match the queried domain (the address itself, per
 * addressOnDomain — `source` only breaks ties within a category, see
 * below), a second priority order applies:
 *   1. Best — a named contact (full_name present) with a business-relevant
 *      title: owner, dentist, office/practice/studio manager, coordinator.
 *   2. Good fallback — a generic general-inquiry address (hello@, info@,
 *      contact@, office@, admin@).
 *   3. Any other domain-matching email that isn't classified above.
 *   4. Worst (last resort, only if nothing else on the domain matched at
 *      all) — a narrow-purpose role address (press@, media@, pr@,
 *      privacy@, legal@, security@, careers@, jobs@): meant for a specific
 *      kind of inquiry, not general contact.
 * Within any of those four categories, an email whose `source` is also the
 * queried domain's own site (not just the address) is preferred — but this
 * never crosses a category boundary, e.g. a source-matching narrow-purpose
 * address still ranks below a non-source-matching general-inquiry one.
 *
 * Outside a domain match, a named contact with a business-relevant title is
 * a last resort before the plain "first in the list" fallback — never
 * allowed to outrank any domain-matching email regardless of its category.
 */
export function pickBestEmail(domain: string, emails: FoundEmail[]): FoundEmail | null {
  if (emails.length === 0) return null;
  const normalizedDomain = normalizeHost(domain);

  function tier(e: FoundEmail): number {
    const addrMatch = addressOnDomain(e, normalizedDomain);

    if (addrMatch) {
      let category: number;
      if (e.fullName && hasDecisionMakerTitle(e.title)) category = 3;
      else if (isGeneralInquiryAddress(e.value)) category = 2;
      else if (isNarrowPurposeAddress(e.value)) category = 0;
      else category = 1;

      const sourceBonus = sourceOnDomain(e, normalizedDomain) ? 1 : 0;
      return DOMAIN_MATCH_BASE + category * 2 + sourceBonus;
    }

    if (hasDecisionMakerTitle(e.title)) return 1;
    return 0;
  }

  let best = emails[0];
  let bestTier = tier(best);
  for (const candidate of emails.slice(1)) {
    const candidateTier = tier(candidate);
    if (candidateTier > bestTier) {
      best = candidate;
      bestTier = candidateTier;
    }
  }
  return best;
}

/** Strips a website URL down to a bare hostname (e.g. Outscraper's expected `query` form). */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
