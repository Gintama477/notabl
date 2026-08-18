import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionAccountId } from "@/lib/auth/session";
import { getSubscriptionForAccount } from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { isLiveBillingEnabled } from "@/lib/billing/provider";

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
  searchParams: Promise<{ checkout?: string; cancelled?: string }>;
}) {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const { checkout, cancelled } = await searchParams;
  const subscription = await getSubscriptionForAccount(accountId);
  const plan = PLANS[DEFAULT_PLAN];
  const liveBilling = isLiveBillingEnabled();

  return (
    <>
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

            {!subscription?.isPilot && (
              <div className="mt-6 flex flex-col gap-2">
                {(!subscription ||
                  subscription.status === "none" ||
                  subscription.status === "trialing" ||
                  subscription.status === "past_due" ||
                  subscription.status === "canceled") && (
                  <form action="/api/billing/checkout" method="post">
                    <button className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                      {subscription?.status === "past_due" ? "Retry Payment" : "Add Payment Method"}
                    </button>
                  </form>
                )}
                {subscription?.status === "active" && (
                  <form action="/api/billing/portal" method="post">
                    <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Manage Billing
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
