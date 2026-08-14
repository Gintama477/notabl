import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";
import { LandingPageView } from "@/components/marketing/LandingPageView";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";

export default function LandingPage() {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <>
      <Header />
      <LandingPageView />
      <main>
        <section className="border-b border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <div>
                <p className="mb-4 inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium tracking-wide text-teal-800 uppercase">
                  Built for dental practices
                </p>
                <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                  Know what your patients are saying before small problems
                  become big ones.
                </h1>
                <p className="mt-6 text-lg leading-relaxed text-slate-600">
                  Notabl analyzes your patient reviews and sends you a
                  clear weekly report showing praise, complaints, emerging
                  issues, and what deserves your attention.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <TrackedCtaLink
                    href="/signup"
                    className="rounded-md bg-teal-700 px-6 py-3 text-center text-sm font-medium text-white hover:bg-teal-800"
                  >
                    Analyze My Reviews
                  </TrackedCtaLink>
                  <Link
                    href="/sample-report"
                    className="rounded-md border border-slate-300 px-6 py-3 text-center text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  >
                    See Sample Report
                  </Link>
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Free sample report, no signup required. Paid plan starts at{" "}
                  {formatPrice(plan.priceMonthlyUsd)}/month after a {plan.trialDays}-day trial.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Example — Your Weekly Notabl
                </p>
                <p className="mt-2 font-serif text-lg font-semibold text-slate-900">
                  Brightview Family Dental
                </p>
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <p className="font-medium text-teal-800">Positive trends</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">
                      <li>Staff friendliness continues to receive strong praise</li>
                      <li>Patients increasingly mention clean facilities</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-red-800">Negative trends</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">
                      <li>Complaints about appointment delays increased this week</li>
                      <li>4 reviews mentioned difficulty reaching the office by phone</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Suggested action</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">
                      <li>Review front desk response times</li>
                      <li>Investigate appointment scheduling delays</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-serif text-2xl font-semibold text-slate-900">
              Reading every review yourself doesn&apos;t scale
            </h2>
            <p className="mt-3 max-w-2xl text-slate-600">
              A busy practice can accumulate hundreds of reviews across Google
              and other sites. Individually they&apos;re useful; read one at a
              time, patterns are easy to miss. Notabl reads all of them
              and tells you what&apos;s changing.
            </p>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "What patients love",
                  desc: "The themes patients consistently praise, so you know what to protect.",
                },
                {
                  title: "What patients dislike",
                  desc: "Recurring complaints, grouped by topic instead of buried in individual reviews.",
                },
                {
                  title: "New this week",
                  desc: "Issues that weren't showing up before and just started appearing.",
                },
                {
                  title: "Issues getting worse",
                  desc: "Complaints that are increasing in frequency compared with prior periods.",
                },
              ].map((f) => (
                <div key={f.title} className="rounded-lg border border-slate-200 bg-white p-5">
                  <h3 className="font-medium text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-serif text-2xl font-semibold text-slate-900">How it works</h2>
            <div className="mt-10 grid gap-10 sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Connect your practice",
                  desc: "Enter your practice name, website, and public review profile links.",
                },
                {
                  step: "2",
                  title: "We analyze your reviews",
                  desc: "Themes, sentiment, and trends are extracted automatically — no manual reading required.",
                },
                {
                  step: "3",
                  title: "Get your weekly report",
                  desc: "A clear summary lands in your inbox every week, plus a live dashboard.",
                },
              ].map((s) => (
                <div key={s.step}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-teal-700 font-serif text-sm font-semibold text-teal-800">
                    {s.step}
                  </div>
                  <h3 className="mt-4 font-medium text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="font-serif text-2xl font-semibold text-slate-900">
              {formatPrice(plan.priceMonthlyUsd)}/month, cancel anytime
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              One plan, no hidden tiers. Start with a free sample report — no
              signup needed — then try the full dashboard for {plan.trialDays} days.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrackedCtaLink
                href="/signup"
                className="rounded-md bg-teal-700 px-6 py-3 text-sm font-medium text-white hover:bg-teal-800"
              >
                Analyze My Reviews
              </TrackedCtaLink>
              <Link
                href="/pricing"
                className="rounded-md border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              >
                See Pricing Details
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
