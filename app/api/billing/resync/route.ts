import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getAccountById, getSubscriptionForAccount } from "@/lib/db/queries";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { StripeBillingProvider } from "@/lib/billing/stripeProvider";
import { reconcileSubscriptionFromStripe } from "@/lib/billing/reconcile";

// Reads subscription state back from Stripe. A missing maxDuration is a silent 10s limit, not "no limit" —
// see app/api/signup/route.ts for the bug that trap caused.
export const maxDuration = 30;

/**
 * "Resync with Stripe" — the self-heal path for a subscription row stuck
 * with a real status (trialing/active/...) but no stripeCustomerId, e.g.
 * an incomplete reconciliation (a webhook that never landed, or any other
 * gap). Looks up the Stripe customer by the account's email, pulls their
 * most recent subscription, and reconciles through the exact same
 * reconcileSubscriptionFromStripe used by the webhook and the
 * checkout=success fallback — so this stays consistent with every other
 * path that writes subscription state. See the "Resync with Stripe" link
 * in app/billing/page.tsx for where this is offered.
 */
export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL("/billing", req.url);

  if (!isLiveBillingEnabled()) {
    url.searchParams.set("resync", "unavailable");
    return NextResponse.redirect(url, { status: 303 });
  }

  const [account, subscription] = await Promise.all([
    getAccountById(accountId),
    getSubscriptionForAccount(accountId),
  ]);
  if (!account || !subscription) {
    url.searchParams.set("resync", "failed");
    return NextResponse.redirect(url, { status: 303 });
  }

  try {
    const provider = new StripeBillingProvider(process.env.STRIPE_SECRET_KEY as string);
    const customer = await provider.findCustomerByEmail(account.email);
    if (!customer) {
      url.searchParams.set("resync", "notfound");
      return NextResponse.redirect(url, { status: 303 });
    }

    const latestSubscription = await provider.findMostRecentSubscriptionForCustomer(customer.id);
    if (!latestSubscription) {
      url.searchParams.set("resync", "notfound");
      return NextResponse.redirect(url, { status: 303 });
    }

    await reconcileSubscriptionFromStripe(accountId, latestSubscription.id, customer.id, provider);
    url.searchParams.set("resync", "success");
  } catch (err) {
    console.error("Resync with Stripe failed:", err);
    url.searchParams.set("resync", "failed");
  }

  return NextResponse.redirect(url, { status: 303 });
}
