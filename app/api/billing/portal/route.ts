import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getSubscriptionForAccount } from "@/lib/db/queries";
import { getBillingProvider } from "@/lib/billing/provider";
import { getSiteUrl } from "@/lib/siteUrl";

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const subscription = await getSubscriptionForAccount(accountId);
  const provider = await getBillingProvider();
  // Fixed site address for returnUrl — Stripe holds onto this and sends
  // the customer back to it whenever they leave the portal, possibly long
  // after this request. requestOrigin stays request-derived and is only
  // used below for the demo billing provider's relative-path redirect —
  // that's redirecting this request's own browser right now, not
  // something Stripe stores.
  const siteUrl = getSiteUrl();
  const requestOrigin = req.nextUrl.origin;
  try {
    const { url } = await provider.createPortalSession({
      accountId,
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
      returnUrl: `${siteUrl}/billing`,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : `${requestOrigin}${url}`, { status: 303 });
  } catch (err) {
    console.error("Portal session creation failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing portal." }, { status: 500 });
  }
}
