import { QrCode, MessageSquareText, LineChart } from "lucide-react";

// A distinct capability from FeatureGrid above it — that section is about
// reading the reviews a practice already has; this one is about getting
// more of them. Kept as its own section rather than a 5th FeatureGrid tile
// so the pitch reads as "analysis, AND getting more reviews," not one more
// bullet buried in the analysis list.
export function ReviewRequestsSection() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-2xl font-semibold text-slate-900 sm:text-3xl">
          Find out what patients think — and get more of them to say it publicly
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Every plan includes a branded QR code and short link for your practice. Print it for the front desk or
          checkout counter, or drop it into the appointment reminders you already send. Patients choose, on one
          screen, whether to leave a public Google review or send private feedback — no gating, no pre-screening.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
              <QrCode className="h-5 w-5" strokeWidth={2} />
            </div>
            <h3 className="mt-4 font-medium text-slate-900">A QR code and link, ready to print</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              A branded page at your own short link — no app, no login required for patients to use it.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
              <MessageSquareText className="h-5 w-5" strokeWidth={2} />
            </div>
            <h3 className="mt-4 font-medium text-slate-900">Patients choose where it goes</h3>
            {/*
              Deliberately NOT framed as a way to head off or intercept bad
              reviews, even though that's the tempting sales angle. That
              framing describes review gating, which Google prohibits and the
              FTC's Consumer Review Rule creates separate exposure for — and
              stating it in writing on a public marketing page is exactly the
              thing a competitor or a journalist screenshots. The accurate,
              safe description is the neutral one: both options, equal
              weight, patient's call. See the no-gating comment in
              app/r/[slug]/ReviewChoiceSection.tsx, which enforces the same
              constraint in the UI itself.
            */}
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Every patient sees the same two choices side by side, at equal weight, and decides for themselves.
              Anything sent privately comes straight to you instead of being posted.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
              <LineChart className="h-5 w-5" strokeWidth={2} />
            </div>
            <h3 className="mt-4 font-medium text-slate-900">See how many new reviews it brought in</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Scans, clicks, and the real Google reviews that arrived in the same window — measured honestly, never
              overstated.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
