// Demo-mode-only simulation of the two outcomes a real Stripe Checkout can
// have. Refuses to run if live billing is actually configured, so this can
// never become an accidental "pay nothing" bypass in a real deployment —
// see docs/STRIPE-TEST-MODE.md.

import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { updateSubscriptionForAccount } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

export async function POST(req: NextRequest) {
  if (isLiveBillingEnabled()) {
    return NextResponse.json({ error: "Live billing is configured — demo checkout is disabled." }, { status: 403 });
  }
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const outcome = form.get("outcome")?.toString();
  const url = new URL("/billing", req.url);

  if (outcome === "success") {
    await updateSubscriptionForAccount(accountId, {
      status: "active",
      stripeCustomerId: `demo_cus_${accountId.slice(0, 8)}`,
      stripeSubscriptionId: `demo_sub_${accountId.slice(0, 8)}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await track("subscription_started", { accountId, properties: { mode: "demo" } });
    url.searchParams.set("checkout", "success");
  } else {
    await updateSubscriptionForAccount(accountId, { status: "past_due" });
    url.searchParams.set("checkout", "failed");
  }

  return NextResponse.redirect(url, { status: 303 });
}
