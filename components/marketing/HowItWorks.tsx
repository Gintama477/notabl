const STEPS = [
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
];

export function HowItWorks() {
  return (
    <section className="border-y border-slate-200 bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-serif text-2xl font-semibold text-slate-900 sm:text-3xl">How it works</h2>
        <div className="relative mt-14 grid gap-10 sm:grid-cols-3">
          {/* Connects the centers of the 1st and 3rd step circles; the
              circles themselves (bg-white, higher z-index) sit on top of it,
              breaking the line at each number like a typical step indicator. */}
          <div
            aria-hidden
            className="absolute top-[18px] left-[16.6%] right-[16.6%] hidden h-px bg-slate-200 sm:block"
          />
          {STEPS.map((s) => (
            <div key={s.step} className="relative">
              <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-teal-700 bg-white font-serif text-sm font-semibold text-teal-800">
                {s.step}
              </div>
              <h3 className="mt-4 font-medium text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
