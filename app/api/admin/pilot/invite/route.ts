import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { grantPilotAccess } from "@/lib/db/queries";
import { createLoginToken } from "@/lib/auth/loginToken";
import { sendPilotInviteEmail } from "@/lib/email/send";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { track } from "@/lib/analytics/track";
import { getSiteUrl } from "@/lib/siteUrl";

const InviteSchema = z.object({
  businessName: z.string().min(2).max(120),
  email: z.string().email(),
  recipientName: z.string().max(120).optional().or(z.literal("")),
});

// Admin-only, one practice at a time — deliberately no bulk/CSV upload path,
// per the explicit "no automated mass outreach" constraint (point 24).
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { account, business, reused } = await grantPilotAccess({
    businessName: parsed.data.businessName,
    email: parsed.data.email,
    website: "",
    city: "",
    state: "",
    reviewProfileLinks: "",
  });
  if (!business) {
    return NextResponse.json({ error: "Could not create pilot account" }, { status: 500 });
  }

  if (!reused) {
    await track("business_added", { accountId: account.id, businessId: business.id });
    try {
      await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
    } catch (err) {
      console.error("Pilot initial analysis failed:", err);
    }
  }

  // Longer-lived than a regular self-requested login link (15m) — this one
  // sits in someone's inbox unsolicited, they might not open it right away.
  const token = await createLoginToken(account.id, "7d");
  // Fixed site address, not req.url — this sits unsolicited in someone's
  // inbox for up to 7 days; it must point at the real site regardless of
  // which URL the admin happened to be sending the invite from.
  const loginUrl = new URL(`/api/login/verify?token=${token}`, getSiteUrl()).toString();

  const result = await sendPilotInviteEmail({
    businessId: business.id,
    recipientEmail: parsed.data.email,
    input: {
      practiceName: parsed.data.businessName,
      recipientName: parsed.data.recipientName || null,
      loginUrl,
      senderName: "Notabl",
    },
  });

  return NextResponse.json({ ok: true, accountId: account.id, reused, demoLoginUrl: result.demoLoginUrl });
}
