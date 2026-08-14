import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { track } from "@/lib/analytics/track";

export default async function PricingPage() {
  const plan = PLANS[DEFAULT_PLAN];
  await track("pricing_viewed", {});
  return (
    <>
      <Header />
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h1 className="font-serif text-3xl font-semibold text-slate-900">Simple pricing</h1>
          <p className="mt-3 text-slate-600">
            One plan built for a single dental practice location. No setup fees.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="font-serif text-xl font-semibold text-slate-900">{plan.name}</h2>
          <p className="mt-2">
            <span className="text-4xl font-semibold text-slate-900">{formatPrice(plan.priceMonthlyUsd)}</span>
            <span className="text-slate-500"> / month</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{plan.trialDays}-day free trial, cancel anytime</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-teal-700">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="mt-8 block rounded-md bg-teal-700 px-6 py-3 text-center text-sm font-medium text-white hover:bg-teal-800"
          >
            Start Free Trial
          </Link>
          <p className="mt-3 text-center text-xs text-slate-400">
            No credit card required to start your trial.
          </p>
        </div>

        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-slate-500">
          Not ready to talk to a salesperson or enter payment details? See a{" "}
          <Link href="/sample-report" className="text-teal-700 underline">
            full sample report
          </Link>{" "}
          first — no account needed.
        </p>
      </main>
      <Footer />
    </>
  );
}
