import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { findEmailForProspect, updateProspectDraft } from "@/lib/db/queries";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const FindEmailSchema = z.object({
  prospectId: z.string().min(1),
  // Persist the result instead of handing it back for the admin to save
  // by hand. The single-prospect UI still leaves saving to the human (they
  // may want to edit it first); bulk lookups set this, because clicking
  // Save on forty rows defeats the point.
  save: z.boolean().optional(),
});

// Can take up to ~45s (Outscraper's emails-and-contacts endpoint is
// always-async, polled internally — see lib/outreach/findEmail.ts), so
// this needs the same extended duration as the other Outscraper-backed
// routes rather than the default.
export const maxDuration = 60;

/**
 * Admin-only email lookup for ONE prospect. Still one prospect per
 * request even when the queue's bulk action is driving it — each lookup
 * takes ~45s and cannot be batched inside a 60s function, so the client
 * loops over this rather than a server-side batch endpoint existing.
 * See the bulk controls in components/admin/OutreachQueue.tsx.
 */
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Same reasoning as app/api/admin/outreach/find/route.ts — admin-gated,
  // but a leaked admin session could still loop a real, billed Outscraper
  // call with no other cap. Raised from 10 to 150 per 10 minutes because
  // the queue's bulk lookup legitimately makes one request per selected
  // prospect: at the old limit, selecting more than ten rows failed
  // partway through by design. Still a real ceiling on a runaway loop.
  const rateLimit = checkRateLimit(`admin-outreach-find-email:${getClientIp(req)}`, 150, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many lookups. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = FindEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await findEmailForProspect(parsed.data.prospectId);
    // Only persists a hit — a miss must never blank an address the admin
    // already typed in by hand.
    if (parsed.data.save && result.email) {
      await updateProspectDraft(parsed.data.prospectId, { contactEmail: result.email });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Email lookup failed." }, { status: 500 });
  }
}
