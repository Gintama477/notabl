import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import { getSubscriptionForAccount } from "@/lib/db/queries";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";

export default async function DemoPortalPage() {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");
  if (isLiveBillingEnabled()) redirect("/billing"); // real Stripe Billing Portal handles this when live

  const subscription = await getSubscriptionForAccount(accountId);
  const plan = PLANS[DEFAULT_PLAN];

  return (
    <>
      <Header />
      <main className="flex-1 bg-slate-50 py-16">
        <div className="mx-auto max-w-sm px-6">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            DEMO BILLING PORTAL — no live Stripe key is configured. This simulates what Stripe&apos;s real
            hosted Billing Portal would let you do.
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="font-serif text-lg font-semibold text-slate-900">{plan.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{formatPrice(plan.priceMonthlyUsd)}/month</p>
            <p className="mt-1 text-xs text-slate-500">
              Status: {subscription?.status ?? "unknown"}
              {subscription?.currentPeriodEnd ? ` · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ""}
            </p>

            <form action="/api/billing/demo-cancel" method="post" className="mt-6">
              <button className="w-full rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                Cancel Subscription
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-slate-400">Effective at the end of the current billing period.</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
