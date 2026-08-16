import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/adminSession";

// TEMPORARY diagnostic-only route — not linked from any admin UI, visit
// directly. Returns the RAW Outscraper Maps Search response for a given
// city/state (capped at 3 results) so the real field names can be inspected
// and lib/outreach/findProspects.ts's mapping corrected against them — see
// that file's "not live-verified" caveat, which is exactly the situation
// this is for. Writes nothing to the database; safe to delete once the
// mapping is confirmed correct.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") || "";
  const state = searchParams.get("state") || "";
  const category = searchParams.get("category") || "Dentist";
  if (!city || !state) {
    return NextResponse.json({ error: "Pass ?city=...&state=... in the URL, e.g. ?city=Boston&state=MA" }, { status: 400 });
  }

  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OUTSCRAPER_API_KEY is not set." }, { status: 500 });
  }

  const query = `${category}, ${city}, ${state}, US`;
  const url = new URL("https://api.outscraper.cloud/maps/search-v3");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "3");
  url.searchParams.set("language", "en");
  url.searchParams.set("async", "false");

  const res = await fetch(url.toString(), { headers: { "X-API-KEY": apiKey } });
  const text = await res.text();

  // Passed through verbatim (pretty-printed if it parses as JSON) rather
  // than re-summarized, so the actual field names are visible exactly as
  // Outscraper sent them.
  try {
    const json = JSON.parse(text);
    return NextResponse.json(json, { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": "text/plain" } });
  }
}
