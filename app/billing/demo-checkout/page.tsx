import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";

export default async function DemoCheckoutPage() {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");
  if (isLiveBillingEnabled()) redirect("/billing"); // real Stripe Checkout handles this when live

  const plan = PLANS[DEFAULT_PLAN];

  return (
    <>
      <Header />
      <main className="flex-1 bg-slate-50 py-16">
        <div className="mx-auto max-w-sm px-6">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            DEMO CHECKOUT — no live Stripe key is configured. This simulates what a real Stripe Checkout page
            would do; no card is collected and nothing is charged.
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="font-serif text-lg font-semibold text-slate-900">{plan.name}</h1>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatPrice(plan.priceMonthlyUsd)}<span className="text-sm font-normal text-slate-500"> / month</span></p>
            <p className="mt-1 text-xs text-slate-500">{plan.trialDays}-day free trial included</p>

            <div className="mt-6 flex flex-col gap-2">
              <form action="/api/billing/demo-checkout" method="post">
                <input type="hidden" name="outcome" value="success" />
                <button className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                  Simulate Successful Payment
                </button>
              </form>
              <form action="/api/billing/demo-checkout" method="post">
                <input type="hidden" name="outcome" value="failed" />
                <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Simulate Failed Payment
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
