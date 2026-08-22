import Link from "next/link";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { PrimaryCta } from "./PrimaryCta";

export function Hero() {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-teal-50/70 via-white to-white py-24 sm:py-28">
      {/* Subtle decorative glow — purely visual, no content, kept faint on purpose. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-teal-100/40 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid gap-16 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-5 inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium tracking-wide text-teal-800 uppercase ring-1 ring-inset ring-teal-100">
              Built for dental practices
            </p>
            {/*
              Both halves of the product, in order: getting reviews in, and
              understanding them. Leading with either one alone is the
              failure mode — "get more reviews" on its own makes Notabl sound
              like the fifth review-generation vendor to cold-pitch this
              practice that month (Podium, Birdeye, NiceJob, Weave all sell
              into this exact market at $75-$500/month), and "we read your
              reviews" on its own is the analysis-only positioning this copy
              replaced. The pairing at $49/month is what's actually
              differentiated. See marketing/core-sales-message.md.
            */}
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              Get more patient reviews — and know what they&apos;re
              actually telling you.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600">
              Share a QR code at the front desk, and patients can leave a
              Google review in a couple of taps. Notabl reads every review
              that comes in and emails you the moment one actually needs
              your attention — not on a schedule, only when it matters.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta
                trackAsMainCta
                className="rounded-md bg-teal-700 px-6 py-3 text-center text-sm font-medium text-white shadow-sm shadow-teal-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md hover:shadow-teal-900/20"
              />
              <Link
                href="/sample-report"
                className="rounded-md border border-slate-300 bg-white px-6 py-3 text-center text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-md"
              >
                See Sample Report
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Free sample report, no signup required. Paid plan starts at{" "}
              {formatPrice(plan.priceMonthlyUsd)}/month after a {plan.trialDays}-day trial.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 sm:p-7">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Example — Your Notabl Report
            </p>
            <p className="mt-1.5 font-serif text-lg font-semibold text-slate-900">
              Brightview Family Dental
            </p>
            <div className="mt-5 space-y-5 border-t border-slate-100 pt-5 text-sm">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-teal-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                  Positive trends
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600">
                  <li>Staff friendliness continues to receive strong praise</li>
                  <li>Patients increasingly mention clean facilities</li>
                </ul>
              </div>
              <div>
                <p className="flex items-center gap-1.5 font-medium text-red-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  Negative trends
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600">
                  <li>Complaints about appointment delays increased recently</li>
                  <li>4 reviews mentioned difficulty reaching the office by phone</li>
                </ul>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="font-medium text-slate-700">Suggested action</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600">
                  <li>Review front desk response times</li>
                  <li>Investigate appointment scheduling delays</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
