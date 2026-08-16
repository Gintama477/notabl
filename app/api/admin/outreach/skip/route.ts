import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { skipProspect } from "@/lib/db/queries";

const SkipSchema = z.object({
  prospectId: z.string().min(1),
  reason: z.string().max(300).optional().or(z.literal("")),
});

// Admin-only — marks a drafted prospect as intentionally not being
// contacted (e.g. bad match, duplicate the search missed, admin changed
// their mind), removing it from the active queue without deleting the row.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = SkipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await skipProspect(parsed.data.prospectId, parsed.data.reason || "");
  return NextResponse.json({ ok: true });
}
