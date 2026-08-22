import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { redraftDraftedProspects } from "@/lib/db/queries";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/siteUrl";

// Bulk-updates every drafted prospect row. A missing maxDuration is a silent 10s limit, not "no limit" —
// see app/api/signup/route.ts for the bug that trap caused.
export const maxDuration = 30;

// Admin-only. Regenerates the subject and body of every "drafted" prospect
// from the CURRENT outreach template — the fix for the fact that
// emailSubject/emailBody are frozen at draft time, so a copy change leaves
// everything already queued holding the old wording.
//
// Costs nothing external: unlike /find, this touches no third-party API,
// it only rewrites rows that already exist. Still rate-limited and
// admin-gated on the same pattern as the other outreach routes, since it
// is a bulk write. See redraftDraftedProspects for why it's scoped to
// "drafted" only and what it deliberately does not touch.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`admin-outreach-redraft:${getClientIp(req)}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many re-draft requests. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const senderName = process.env.OUTREACH_SENDER_NAME || "Notabl";
  // Fixed site address, not req.url — same reasoning as /find: this link is
  // written into an email that may sit unsent for a while and then go to
  // someone with no idea which URL the admin was using.
  const sampleReportUrl = new URL("/sample-report", getSiteUrl()).toString();

  try {
    const result = await redraftDraftedProspects({ sampleReportUrl, senderName });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("redraftDraftedProspects failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Re-draft failed." }, { status: 500 });
  }
}
