// Three steps that describe the whole loop, not just the analysis half —
// step 2 is the review-request side, which this list omitted entirely before
// the Review Requests build. Step 2 says "you share it" on purpose: Notabl
// never contacts patients, and the copy shouldn't leave room to assume
// otherwise (see the constraint comments in lib/db/schema.pg.ts's
// patient_feedback table and app/r/[slug]/ReviewChoiceSection.tsx).
const STEPS = [
  {
    step: "1",
    title: "Connect your practice",
    desc: "Enter your practice name and link your Google reviews. Takes a couple of minutes.",
  },
  {
    step: "2",
    title: "Share your QR code",
    desc: "Print it for the front desk, or drop your link into the appointment reminders you already send. Patients scan it and choose where their feedback goes.",
  },
  {
    step: "3",
    title: "Get your weekly report",
    desc: "Notabl reads every review that comes in and sends a clear summary each week — plus a live dashboard, and a count of what your requests brought in.",
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
