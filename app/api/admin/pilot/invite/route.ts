import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { grantPilotAccess } from "@/lib/db/queries";
import { createLoginToken } from "@/lib/auth/loginToken";
import { sendPilotInviteEmail } from "@/lib/email/send";
// Sends a real email (Resend), so an explicit budget rather than the
// invisible 10-second default. See the maxDuration comment on
// app/api/signup/route.ts for why that default is a trap.
export const maxDuration = 30;
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
    // NO analysis pass here, same reason as app/api/signup/route.ts: this
    // route also sends an email, and chaining a full analysis in front of
    // it is what left signup hanging. The pilot practice's dashboard runs
    // it on their first load (components/dashboard/FirstRunAnalysis.tsx),
    // which is also better for them — progress they can watch, rather than
    // work finished before they ever log in.
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
