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

// 25, not 200. A DNS/MX lookup is a network call, and ninety-odd of them
// sequentially do not finish inside the 60s Hobby ceiling — the function
// was killed mid-run, rows already written kept their status, the rest
// stayed NULL, and the client reported success because it never learned
// the function died. A small batch that reliably completes, called
// repeatedly by the client until `remaining` hits zero, is the fix.
const VERIFY_BATCH_SIZE = 25;

export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Raised: the client now loops one request per 25 rows, so a single
  // Verify click on a 300-row queue is a dozen requests, not one.
  const rateLimit = checkRateLimit(`admin-outreach-verify:${getClientIp(req)}`, 200, 10 * 60 * 1000);
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
    const retryUnchecked = req.nextUrl.searchParams.get("retryUnchecked") === "1";
    const result = await verifyProspectEmails({ limit: VERIFY_BATCH_SIZE, retryUnchecked });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("verifyProspectEmails failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 500 });
  }
}
