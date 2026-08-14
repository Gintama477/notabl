import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getSubscriptionForAccount } from "@/lib/db/queries";
import { getBillingProvider } from "@/lib/billing/provider";

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const subscription = await getSubscriptionForAccount(accountId);
  const provider = await getBillingProvider();
  const origin = req.nextUrl.origin;
  try {
    const { url } = await provider.createPortalSession({
      accountId,
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
      returnUrl: `${origin}/billing`,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : `${origin}${url}`, { status: 303 });
  } catch (err) {
    console.error("Portal session creation failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing portal." }, { status: 500 });
  }
}
