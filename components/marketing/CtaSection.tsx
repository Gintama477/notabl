import Link from "next/link";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { TrackedCtaLink } from "./TrackedCtaLink";

export function CtaSection() {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="font-serif text-2xl font-semibold text-slate-900 sm:text-3xl">
          {formatPrice(plan.priceMonthlyUsd)}/month, cancel anytime
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          One plan, no hidden tiers, no sales call — review requests and
          ongoing analysis both included. Start with a free sample report —
          no signup needed — then try the full dashboard for {plan.trialDays} days.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TrackedCtaLink
            href="/signup"
            className="rounded-md bg-teal-700 px-6 py-3 text-sm font-medium text-white shadow-sm shadow-teal-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md hover:shadow-teal-900/20"
          >
            Analyze My Reviews
          </TrackedCtaLink>
          <Link
            href="/pricing"
            className="rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-md"
          >
            See Pricing Details
          </Link>
        </div>
      </div>
    </section>
  );
}
