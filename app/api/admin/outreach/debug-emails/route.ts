import { NextRequest, NextResponse } from "next/server";
import { isNotNull, ne, and } from "drizzle-orm";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { db } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema.pg";

// TEMPORARY diagnostic-only route — not linked from any admin UI, visit
// directly. Returns the RAW Outscraper "Domain Emails & Contacts" response
// for a real prospect's website (or ?domain=... if passed) so the actual
// field names can be inspected before lib/reviews/outscraperProvider.ts-style
// code is written against them — same reasoning and same pattern as the old
// debug-search route (see docs/REVIEW-DATA-PROVIDERS.md). Writes nothing to
// the database; safe to delete once the response shape is confirmed.
//
// Per the outscraper-python SDK (outscraper/client.py, emails_and_contacts):
// GET /emails-and-contacts?query=<domain> always runs as an async task —
// there's no sync-mode flag for this endpoint, unlike maps/search-v3. The
// initial call returns a task id; the actual data comes from polling
// GET /requests/{id} until status is no longer "Pending". This route does
// that polling itself (the SDK does the same thing client-side) and returns
// both the initial task response and the final polled response verbatim, so
// nothing about Outscraper's real field names is guessed or reshaped.
export const maxDuration = 60;

const OUTSCRAPER_BASE = "https://api.outscraper.cloud";
const POLL_INTERVAL_MS = 4000;
const POLL_BUDGET_MS = 45000; // leaves headroom under maxDuration=60

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OUTSCRAPER_API_KEY is not set." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  let domain = searchParams.get("domain");
  let domainSource: "query_param" | "prospects_table" = "query_param";

  if (!domain) {
    // No ?domain= given — pull a real website from an existing prospect row,
    // per the instruction to test against real data rather than a made-up
    // domain. Picks the first prospect with a non-empty website.
    const [row] = await db
      .select({ website: prospects.website, businessName: prospects.businessName })
      .from(prospects)
      .where(and(isNotNull(prospects.website), ne(prospects.website, "")))
      .limit(1);

    if (!row?.website) {
      return NextResponse.json(
        { error: "No prospect with a website found in the database, and no ?domain=... was passed." },
        { status: 400 }
      );
    }
    domain = hostnameOf(row.website);
    domainSource = "prospects_table";
    if (!domain) {
      return NextResponse.json(
        { error: `Prospect "${row.businessName}"'s website ("${row.website}") isn't a parseable URL.` },
        { status: 500 }
      );
    }
  }

  const headers = { "X-API-KEY": apiKey };

  const initialUrl = new URL(`${OUTSCRAPER_BASE}/emails-and-contacts`);
  initialUrl.searchParams.set("query", domain);

  const initialRes = await fetch(initialUrl.toString(), { headers });
  const initialText = await initialRes.text();
  let initialJson: unknown;
  try {
    initialJson = JSON.parse(initialText);
  } catch {
    return new NextResponse(initialText, { status: initialRes.status, headers: { "Content-Type": "text/plain" } });
  }

  // Task-based response shape isn't guessed either — just checking for the
  // presence of an "id" field (as the SDK's own polling logic does) rather
  // than assuming anything about the rest of the object's structure.
  const taskId = (initialJson as { id?: string })?.id;
  if (!taskId) {
    // Already got data back synchronously (or an error) — nothing to poll.
    return NextResponse.json(
      { domain, domainSource, initialResponse: initialJson, polled: false },
      { status: initialRes.status }
    );
  }

  const pollUrl = `${OUTSCRAPER_BASE}/requests/${taskId}`;
  const deadline = Date.now() + POLL_BUDGET_MS;
  let lastPollJson: unknown = null;
  let pollCount = 0;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    pollCount++;
    const pollRes = await fetch(pollUrl, { headers });
    const pollText = await pollRes.text();
    try {
      lastPollJson = JSON.parse(pollText);
    } catch {
      lastPollJson = { unparsableResponse: pollText };
      break;
    }
    const status = (lastPollJson as { status?: string })?.status;
    if (status !== "Pending") break;
  }

  return NextResponse.json({
    domain,
    domainSource,
    taskId,
    pollCount,
    initialResponse: initialJson,
    finalResponse: lastPollJson,
    polled: true,
  });
}
