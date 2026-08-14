// Demo-mode-only simulation of cancelling through Stripe's real Billing
// Portal (which handles cancellation itself in live mode — see
// lib/billing/stripeProvider.ts createPortalSession). Refuses to run if
// live billing is configured.

import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { updateSubscriptionForAccount } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

export async function POST(req: NextRequest) {
  if (isLiveBillingEnabled()) {
    return NextResponse.json({ error: "Live billing is configured — demo portal is disabled." }, { status: 403 });
  }
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await updateSubscriptionForAccount(accountId, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
  });
  await track("subscription_cancelled", { accountId, properties: { mode: "demo" } });

  const url = new URL("/billing?cancelled=1", req.url);
  return NextResponse.redirect(url, { status: 303 });
}
