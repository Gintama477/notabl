import { QrCode, ThumbsUp, TrendingUp, Quote, type LucideIcon } from "lucide-react";

// Covers BOTH halves of the product — someone who skims only this grid has
// to come away understanding that the practice gets reviews in AND
// understands them, not four flavors of the same half (which is what this
// grid was before the Review Requests build).
//
// Tile 1 is deliberately the high-level "the ask" rather than a breakdown of
// the QR feature: ReviewRequestsSection sits directly below this grid and
// covers the QR code, the private-feedback choice, and the attribution panel
// in detail. Repeating that here would just be the same three tiles twice.
const FEATURES: { title: string; desc: string; icon: LucideIcon }[] = [
  {
    title: "Ask every patient, easily",
    desc: "A QR code for the front desk or checkout counter makes it easy for a patient to leave a review — no app to download, nothing to log into.",
    icon: QrCode,
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
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </section>
  );
}
