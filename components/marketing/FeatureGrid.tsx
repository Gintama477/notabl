import { ThumbsUp, ThumbsDown, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";

const FEATURES: { title: string; desc: string; icon: LucideIcon }[] = [
  {
    title: "What patients love",
    desc: "The themes patients consistently praise, so you know what to protect.",
    icon: ThumbsUp,
  },
  {
    title: "What patients dislike",
    desc: "Recurring complaints, grouped by topic instead of buried in individual reviews.",
    icon: ThumbsDown,
  },
  {
    title: "New this week",
    desc: "Issues that weren't showing up before and just started appearing.",
    icon: Sparkles,
  },
  {
    title: "Issues getting worse",
    desc: "Complaints that are increasing in frequency compared with prior periods.",
    icon: TrendingUp,
  },
];

export function FeatureGrid() {
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-2xl font-semibold text-slate-900 sm:text-3xl">
          Reading every review yourself doesn&apos;t scale
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          A busy practice can accumulate hundreds of reviews across Google
          and other sites. Individually they&apos;re useful; read one at a
          time, patterns are easy to miss. Notabl reads all of them
          and tells you what&apos;s changing.
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
