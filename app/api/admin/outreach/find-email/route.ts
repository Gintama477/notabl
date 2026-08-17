import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { findEmailForProspect } from "@/lib/db/queries";

const FindEmailSchema = z.object({ prospectId: z.string().min(1) });

// Can take up to ~45s (Outscraper's emails-and-contacts endpoint is
// always-async, polled internally — see lib/outreach/findEmail.ts), so
// this needs the same extended duration as the other Outscraper-backed
// routes rather than the default.
export const maxDuration = 60;

/**
 * Admin-only, single-prospect email lookup — see the "Find Email" button in
 * components/admin/OutreachQueue.tsx and findEmailForProspect's doc comment
 * in lib/db/queries.ts for why this is deliberately never called in bulk.
 */
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = FindEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await findEmailForProspect(parsed.data.prospectId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Email lookup failed." }, { status: 500 });
  }
}
