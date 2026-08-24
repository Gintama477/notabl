import { QrCode, BellRing, ThumbsUp, TrendingUp, Quote, MessageSquareReply, type LucideIcon } from "lucide-react";

// Covers BOTH halves of the product — someone who skims only this grid has
// to come away understanding that the practice gets reviews in AND
// understands them, not four flavors of the same half (which is what this
// grid was before the Review Requests build).
//
// Tile 1 is deliberately the high-level "the ask" rather than a breakdown of
// the QR feature: ReviewRequestsSection sits directly below this grid and
// covers the QR code, the private-feedback choice, and the attribution panel
// in detail. Repeating that here would just be the same three tiles twice.
//
// Tile 2 is the ALERT, and it sits in the top row on purpose. This grid
// previously didn't mention alerts at all, which was the notable omission:
// alerts are the recurring value. The analysis is a snapshot that changes
// slowly for a practice getting a handful of reviews a month, and the QR
// code is a printed artifact the practice keeps — the alert is the part
// that happens again every time a review needs answering.
//
// Six tiles in a 3-across grid rather than five, which would orphan one on
// the second row. The sixth (reply drafting) is real product surface
// (components/dashboard/DraftReplyButton.tsx) that this grid also never
// mentioned, not filler added to square off the layout.
const FEATURES: { title: string; desc: string; icon: LucideIcon }[] = [
  {
    title: "Ask every patient, easily",
    desc: "A QR code for the front desk or checkout counter makes it easy for a patient to leave a review — no app to download, nothing to log into.",
    icon: QrCode,
  },
  {
    title: "Told the same day, not next week",
    // "Nothing at all on a quiet day" is the differentiator worth stating
    // outright — every competitor in this market sends a weekly digest
    // nobody reads. Also keeps this honest against the product: the
    // scheduled weekly report genuinely no longer exists.
    desc: "An email only when something actually needs a look — a low-rated review, a run of new ones, a shift in your rating. Never on a schedule, and nothing at all on a quiet day.",
    icon: BellRing,
  },
  {
    title: "What patients love, and what they don't",
    desc: "Every review that arrives, grouped by topic — so praise and complaints show up as patterns instead of one-offs.",
    icon: ThumbsUp,
  },
  {
    title: "What's changing",
    desc: "Complaints that are increasing, and issues that weren't showing up before and just started appearing.",
    icon: TrendingUp,
  },
  {
    title: "In your patients' own words",
    desc: "Real quotes pulled from the reviews behind every theme, so you can see exactly what was said, not just a summary of it.",
    icon: Quote,
  },
  {
    title: "A reply, drafted for you",
    // Matches what the product actually does and the constraint it works
    // under — see lib/ai/prompts/draftReply.ts and the disclaimer in
    // DraftReplyButton. Never claims Notabl posts it.
    desc: "When a review needs answering, Notabl drafts a response you can edit and post yourself — worded generically on purpose, never confirming who was a patient.",
    icon: MessageSquareReply,
  },
];

export function FeatureGrid() {
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-2xl font-semibold text-slate-900 sm:text-3xl">
          Getting reviews is half of it. Knowing what they say is the other half.
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Most practices end up with one or the other: reviews trickling in
          that nobody has time to read properly, or a careful eye on reviews
          they were never really asking for. Notabl does both — it makes the
          ask easy, then reads everything that comes in and tells you what
          it adds up to.
        </p>
        {/* 3-across at lg, 2-across at sm — six tiles divide cleanly into
            both, so no row is ever left with a single orphaned tile. */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-lg border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700 transition-colors duration-200 group-hover:bg-teal-100">
                <f.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mt-4 font-medium text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>

        <AlertExample />
      </div>
    </section>
  );
}

/**
 * A mock of the alert email, because "we email you when something needs
 * attention" is abstract and forgettable until you've seen one. Styled to
 * match what lib/email/templates/reviewAlertEmail.ts actually renders —
 * teal header bar, red-bordered review block, Open Dashboard button — so
 * this isn't promising a different product than the one that arrives.
 *
 * Explicitly labelled as an example, and uses "Brightview Family Dental",
 * the same openly fictional practice as /sample-report. The review text is
 * invented for illustration and says so. No real practice's reviews, no
 * fabricated testimonial, nothing presented as a customer's data — same
 * honesty rules as the rest of the marketing copy.
 */
function AlertExample() {
  return (
    <div className="mt-14 grid gap-8 md:grid-cols-2 md:items-center">
      <div>
        <h3 className="font-serif text-xl font-semibold text-slate-900">What actually lands in your inbox</h3>
        <p className="mt-3 text-slate-600">
          Not a dashboard link telling you to go look. The review itself, in full, with the rating and
          who left it — so you can decide what to do about it from your phone, the day it appears.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          On a quiet day, no email arrives at all.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Example alert — illustration, not a real practice
        </p>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="bg-teal-700 px-5 py-3">
            <span className="text-sm font-bold tracking-wide text-white">Notabl</span>
          </div>
          <div className="p-5">
            <p className="font-medium text-slate-900">Brightview Family Dental</p>
            <p className="mt-0.5 text-xs text-slate-500">Here&apos;s what happened with your reviews.</p>

            <div className="mt-4 rounded border-l-[3px] border-red-700 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-800">
                <span aria-hidden>★★☆☆☆</span> — Sample Patient
              </p>
              <p className="mt-1.5 text-sm text-slate-700">
                Waited almost an hour past my appointment time and nobody explained why.
              </p>
            </div>

            <ul className="mt-4 list-disc pl-5 text-xs text-slate-600">
              <li>3 new reviews since your last alert.</li>
            </ul>

            <span className="mt-3 inline-block rounded-md bg-teal-700 px-4 py-2 text-xs font-bold text-white">
              Open Dashboard
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
