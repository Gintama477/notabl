import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { denyUnauthorizedCron } from "@/lib/auth/cronAuth";
import { getAlertCandidateBusinesses, syncBusinessReviews } from "@/lib/alerts/reviewAlerts";

// Imports ONE business's Google reviews, and nothing else.
//
// This exists so the daily cron can stop doing the importing itself. When
// it did, only one business could be re-imported per run — a single
// Outscraper fetch can consume most of a 60-second function — which meant
// with N connected practices each got fresh data every N days. At 7
// customers a new 1-star review could sit unimported for a week while the
// landing page and the outreach email both promise the practice hears
// about it the same day. app/api/cron/check-reviews now fans out to this
// route, once per business, so every practice gets its own fresh 60
// seconds and they all sync from one daily trigger.
//
// Same CRON_SECRET bearer check as the dispatcher: this must never be
// publicly triggerable, since each call spends real Outscraper money.
//
// NO analysis pass here, same invariant as everywhere else (see
// app/api/reviews/connect-google/route.ts): never chain an external
// provider call and an analysis pass in one request. Newly imported
// reviews are picked up by the next analysis run on its own budgeted loop.
export const maxDuration = 60;

const SyncSchema = z.object({ businessId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const denied = denyUnauthorizedCron(req, "sync-business");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = SyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolved through the same eligibility query the dispatcher uses
  // (active/trialing subscription + an active Google source) rather than
  // trusting the id alone. A business that isn't a legitimate alert
  // candidate can't be made to spend an Outscraper call by passing its id
  // here.
  const candidates = await getAlertCandidateBusinesses();
  const candidate = candidates.find((c) => c.businessId === parsed.data.businessId);
  if (!candidate) {
    return NextResponse.json({ error: "Not a syncable business" }, { status: 404 });
  }

  // syncBusinessReviews reports its own failures as a result rather than
  // throwing — a failed import shouldn't read as a broken route, and the
  // 10-minute resync cooldown plus (reviewSourceId, externalReviewId)
  // dedupe make a retry harmless.
  const result = await syncBusinessReviews(candidate);
  return NextResponse.json({ ok: true, ...result });
}
