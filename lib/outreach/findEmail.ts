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
// Field names below ARE live-verified — confirmed via a real call through
// the temporary app/api/admin/outreach/debug-emails/route.ts diagnostic
// route (since deleted) before this was written, not guessed from docs:
// { query, emails: [{ value, source, last_seen, first_seen }], phones,
//   site_data, socials, details: { address, name }, contacts }

const OUTSCRAPER_BASE = "https://api.outscraper.cloud";
const POLL_INTERVAL_MS = 4000;
const POLL_BUDGET_MS = 45000; // leaves headroom under the route's maxDuration=60

type OutscraperEmailEntry = {
  value?: string;
  source?: string | null;
};

type OutscraperEmailsResponse = {
  query?: string;
  emails?: OutscraperEmailEntry[];
};

export type FoundEmail = { value: string; source: string | null };

async function pollUntilDone(taskId: string, apiKey: string): Promise<unknown> {
  const headers = { "X-API-KEY": apiKey };
  const deadline = Date.now() + POLL_BUDGET_MS;
  let last: unknown = null;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(`${OUTSCRAPER_BASE}/requests/${taskId}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Outscraper poll request failed (${res.status}): ${body.slice(0, 500)}`);
    }
    last = await res.json();
    const status = (last as { status?: string })?.status;
    if (status !== "Pending") return last;
  }

  throw new Error(`Timed out waiting on Outscraper (task ${taskId}) after ${POLL_BUDGET_MS / 1000}s.`);
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
    throw new Error(`Outscraper request failed (${initialRes.status}) for "${domain}": ${body.slice(0, 500)}`);
  }
  const initialJson = (await initialRes.json()) as { id?: string } & OutscraperEmailsResponse;

  // Always async per the SDK (see file header), but handled defensively —
  // if Outscraper ever does return data synchronously, use it directly
  // rather than polling for a task id that doesn't exist.
  const finalJson: OutscraperEmailsResponse = initialJson.id
    ? ((await pollUntilDone(initialJson.id, apiKey)) as OutscraperEmailsResponse)
    : initialJson;

  const rawEmails = finalJson.emails;
  if (!Array.isArray(rawEmails)) {
    throw new Error(
      `Outscraper emails-and-contacts response for "${domain}" didn't contain an "emails" array — response shape ` +
        `may have changed. Raw response: ${JSON.stringify(finalJson).slice(0, 3000)}`
    );
  }

  return rawEmails
    .filter((e): e is OutscraperEmailEntry & { value: string } => typeof e.value === "string" && e.value.length > 0)
    .map((e) => ({ value: e.value, source: e.source ?? null }));
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

/**
 * Prefers an email whose `source` is the queried domain's own site (i.e.
 * actually found on the business's website) over one found elsewhere (a
 * directory listing, a third party mentioning them, etc.); falls back to
 * the first email found if none matches the domain directly; returns null
 * if the list is empty.
 */
export function pickBestEmail(domain: string, emails: FoundEmail[]): FoundEmail | null {
  if (emails.length === 0) return null;
  const normalizedDomain = normalizeHost(domain);
  const onDomain = emails.find((e) => {
    const host = sourceHostname(e.source);
    return host !== null && normalizeHost(host) === normalizedDomain;
  });
  return onDomain ?? emails[0];
}

/** Strips a website URL down to a bare hostname (e.g. Outscraper's expected `query` form). */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
