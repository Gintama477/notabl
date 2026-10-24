import { NextRequest, NextResponse } from "next/server";
import { denyUnauthorizedCron } from "@/lib/auth/cronAuth";
import { runAutosend } from "@/lib/outreach/autosend";

// Report-first outreach autosend. Explicitly authorised by the business
// owner on 24 Oct 2026 ("autosend"), superseding the one-click-per-email
// rule in docs/OUTREACH-AUTOMATION.md for THIS flow only — the old Tier-1
// queue keeps its review step. Only prospects whose report was actually
// built (status "ready", report_token set) are ever emailed.
//
// Runs once a day on weekdays (vercel.json). Each run: follow-ups first
// (older commitments), then first emails, under one global cap shared with
// the manual queue. A recorded reply_status stops follow-ups for that
// prospect. Logic lives in lib/outreach/autosend.ts.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = denyUnauthorizedCron(req, "outreach-autosend");
  if (denied) return denied;
  const result = await runAutosend();
  return NextResponse.json(result);
}
