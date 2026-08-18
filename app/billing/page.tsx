import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionAccountId } from "@/lib/auth/session";
import { getSubscriptionForAccount } from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { StripeBillingProvider } from "@/lib/billing/stripeProvider";
import { reconcileSubscriptionFromStripe } from "@/lib/billing/reconcile";

const STATUS_LABELS: Record<string, string> = {
  none: "Not started",
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Cancelled",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; cancelled?: string; session_id?: string }>;
}) {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const { checkout, cancelled, session_id } = await searchParams;
  const liveBilling = isLiveBillingEnabled();
  let subscription = await getSubscriptionForAccount(accountId);
  const plan = PLANS[DEFAULT_PLAN];

  // Fallback for when the Stripe webhook hasn't landed yet by the time the
  // customer's browser reaches this success page — reconcile directly with
  // Stripe instead of showing a dashboard/billing page that doesn't know
  // about the subscription yet. Only runs when there's actually a gap to
  // close (no stripeSubscriptionId on file yet); once the webhook does
  // land, this becomes a no-op (subscription is already up to date).
  if (checkout === "success" && session_id && liveBilling && !subscription?.stripeSubscriptionId) {
    try {
      const provider = new StripeBillingProvider(process.env.STRIPE_SECRET_KEY as string);
      const session = await provider.retrieveCheckoutSession(session_id);
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      // Only ever reconcile onto the CURRENT logged-in account — never trust
      // a session_id from the URL alone, since anyone could put a different
      // (even someone else's) session id in the query string.
      if (stripeSubscriptionId && session.metadata?.accountId === accountId) {
        await reconcileSubscriptionFromStripe(accountId, stripeSubscriptionId, stripeCustomerId, provider);
        subscription = await getSubscriptionForAccount(accountId);
      }
    } catch (err) {
      // Non-fatal — the page still renders with whatever the DB already
      // has; the real webhook will catch up on its own if this fails.
      console.error("Checkout session reconciliation fallback failed:", err);
    }
  }

  return (
    <>
      <BfcacheGuard />
      <Header />
      <main className="flex-1 bg-slate-50 py-16">
        <div className="mx-auto max-w-lg px-6">
          <h1 className="font-serif text-2xl font-semibold text-slate-900">Billing</h1>

          {!liveBilling && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              DEMO MODE — no live Stripe key is configured, so nothing here charges a real card. This page
              exercises the same subscription states a real integration would. See docs/STRIPE-TEST-MODE.md.
            </div>
          )}

          {checkout === "success" && (
            <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
              <p>Subscription started{!liveBilling ? " (simulated)" : ""}.</p>
              <Link
                href="/dashboard"
                className="mt-3 inline-block rounded-md bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Go to Dashboard
              </Link>
            </div>
          )}
          {checkout === "failed" && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              Payment failed{!liveBilling ? " (simulated)" : ""}. Try again below.
            </div>
          )}
          {cancelled === "1" && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
              Subscription cancelled{!liveBilling ? " (simulated)" : ""}.
            </div>
          )}

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Current plan</p>
            <p className="mt-1 font-serif text-lg font-semibold text-slate-900">{plan.name}</p>
            <p className="mt-1 text-sm text-slate-600">{formatPrice(plan.priceMonthlyUsd)}/month</p>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
            <p className="mt-1 text-sm text-slate-700">
              {subscription?.isPilot
                ? "Pilot Access — Free"
                : subscription
                  ? STATUS_LABELS[subscription.status] || subscription.status
                  : "No subscription found"}
            </p>

            {subscription?.isPilot && (
              <p className="mt-2 text-xs text-slate-500">
                You have free pilot access — no payment needed. Thanks for trying Notabl early.
              </p>
            )}
            {!subscription?.isPilot && subscription?.trialEndsAt && subscription.status === "trialing" && (
              <p className="mt-2 text-xs text-slate-500">
                Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}.
              </p>
            )}
            {!subscription?.isPilot && subscription?.currentPeriodEnd && subscription.status === "active" && (
              <p className="mt-2 text-xs text-slate-500">
                Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
              </p>
            )}

            {!subscription?.isPilot &&
              (() => {
                const status = subscription?.status;
                const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);
                // First-time or fully-over: no Stripe history at all, or
                // had one but it's fully canceled — both are safe to send
                // through a fresh Checkout (item 7's route-level guard is
                // the real backstop against ever creating a second live
                // subscription, not this button logic).
                const showCheckoutButton = !hasStripeCustomer || status === "canceled" || status === "trialing";
                // Any existing Stripe customer whose subscription isn't
                // fully canceled goes to the portal — covers active,
                // trialing, past_due, and any other real Stripe status not
                // specifically mapped (incomplete, incomplete_expired,
                // unpaid, paused, ...), so nobody hits a dead end with a
                // status label and no actionable button at all.
                const showPortalButton = hasStripeCustomer && status !== "canceled";

                return (
                  <div className="mt-6 flex flex-col gap-2">
                    {showCheckoutButton && (
                      <form action="/api/billing/checkout" method="post">
                        <button className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                          {status === "canceled" ? "Resubscribe" : "Add Payment Method"}
                        </button>
                      </form>
                    )}
                    {showPortalButton && (
                      <form action="/api/billing/portal" method="post">
                        <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          {status === "past_due" ? "Update Payment Method" : "Manage Billing"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })()}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
