import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { sendProspectEmail } from "@/lib/db/queries";

const SendSchema = z.object({ prospectId: z.string().min(1) });

// Admin-only, one prospect at a time — this is the actual "approve and
// send" click in the human-in-the-loop design (see
// docs/OUTREACH-AUTOMATION.md). Deliberately no bulk/"send all" endpoint,
// per the point-24 constraint this feature was built around.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await sendProspectEmail(parsed.data.prospectId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed." }, { status: 400 });
  }
}
