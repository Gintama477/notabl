import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { findAndDraftProspects } from "@/lib/db/queries";

const FindSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  category: z.string().max(80).optional().or(z.literal("")),
  limit: z.number().int().min(1).max(50).optional(),
});

// Admin-only. Finds public dental-practice listings (name, address, phone,
// website, public star rating/review count — never review text) via the
// temporary Outscraper-backed connector and drafts a Tier-1 cold-outreach
// email for each new one, per the point-24 semi-automated design (see
// docs/OUTREACH-AUTOMATION.md). Nothing is sent here — this only creates
// "drafted" rows for a human to review in the outreach queue.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = FindSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const senderName = process.env.OUTREACH_SENDER_NAME || "Notabl";
  const sampleReportUrl = new URL("/sample-report", req.url).toString();

  try {
    const result = await findAndDraftProspects({
      city: parsed.data.city,
      state: parsed.data.state,
      category: parsed.data.category || undefined,
      limit: parsed.data.limit,
      sampleReportUrl,
      senderName,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("findAndDraftProspects failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Prospect search failed." }, { status: 500 });
  }
}
