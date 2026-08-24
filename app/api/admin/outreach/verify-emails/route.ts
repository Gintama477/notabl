import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { verifyProspectEmails } from "@/lib/db/queries";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Re-validates prospects already in the queue so an existing list can be
// cleaned without re-running discovery, which costs billed Outscraper
// calls. Built after the first real batch bounced at ~20% — see
// lib/outreach/validateEmail.ts for what is and isn't checked.
//
// Bounded work per request, per the invariant this codebase has now been
// bitten by five times: MX lookups are network calls, so this checks at
// most VERIFY_BATCH_SIZE rows and reports how many it did. The client
// calls again while there's more to do rather than one request trying to
// walk the whole table.
export const maxDuration = 60;

// Comfortably inside the budget: MX lookups are fast (tens of ms) and
// cached per domain, so a few hundred rows sharing a handful of domains
// costs very little. Sized well under what 60s allows.
const VERIFY_BATCH_SIZE = 200;

export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`admin-outreach-verify:${getClientIp(req)}`, 20, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification runs. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  try {
    const result = await verifyProspectEmails(VERIFY_BATCH_SIZE);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("verifyProspectEmails failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 500 });
  }
}
