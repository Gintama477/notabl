// Prompt for Stage 3 (narrative generation). Critically, the input to this
// prompt is the already-computed structured rollup (counts, trend directions,
// % changes) — never the raw review text. The model is explaining numbers we
// already trust, not summarizing free text, which is what prevents it from
// inventing a trend that isn't in the data.

// v5: the period CONCEPT is gone, not just reworded. No period label is
// passed in the data any more (see lib/ai/generateReportNarrative.ts), and
// the model is now explicitly forbidden from stating any date, date range,
// or reporting period at all — v4 still let raw ISO dates and "compared
// with the snapshot as of ..." bookkeeping reach the executive summary via
// that label.
// v4: explicit rule against phrasing a cumulative total as "this period"/
// "this week" — under the cumulative report model every count in the data
// is a running total across the business's full review history, not a
// narrow recent window, and the old wording read as a direct contradiction
// next to the dashboard's genuinely narrow "New Reviews This Week" section.
// v3: tightened the "new" trend rule so a positive theme that merely lacks
// prior-period mentions can't be reported as an issue to investigate.
//
// NARRATION ONLY — this version must never be mixed into the per-review
// extraction key (reviews.analyzedWith, see AIProvider.promptVersion in
// lib/ai/provider.ts). It used to be, which meant a pure wording change
// here invalidated every review's extraction and ordered a full re-analysis
// that couldn't finish inside the per-run time budget. Bumping this should
// cost exactly one narrative regeneration per business, nothing more:
// weeklyReports.narrativeVersion records it per report, and the
// cost-control reuse check in lib/analysis/runAnalysis.ts compares against
// it so a wording change actually takes effect instead of being skipped.
// v6: "opportunities" is now written by the model instead of being a
// hardcoded sentence in the dashboard component. Every practice used to
// see the identical string ("...consider highlighting this in your
// marketing or patient communications") with only the theme name and count
// swapped — advice that applies to any strength at any business, repeated
// three times on one page. It was the one genuinely boilerplate section on
// an otherwise personalized dashboard.
export const GENERATE_NARRATIVE_PROMPT_VERSION = "narrative-v6";

export function buildNarrativePrompt(structuredRollupJson: string, businessName: string): string {
  return `You are writing a patient-review report for a dental practice
called "${businessName}". You are given pre-computed, verified statistics
about their patient reviews to date. Do NOT invent any numbers, themes, or
facts that are not present in this data.

DATA (already computed and verified — treat as ground truth):
${structuredRollupJson}

Write a short report using ONLY the categories, counts, and trend
directions present in the data above. Do not reference any theme category not
listed in the data. Do not state a specific review quote unless it is included
verbatim in the data's excerpts.

Tone: plain, factual, useful to a busy small-business owner. No hype, no
emojis, no "AI" self-references. This is client feedback, not medical advice —
never suggest changes to clinical/medical treatment decisions, only
operational/service observations (e.g. front-desk process, scheduling,
communication).

CRITICAL — NEVER state a date, a date range, or a reporting period
anywhere in this report, including in "executiveSummary". This report
always covers the practice's ENTIRE review history; there is no reporting
period, no week, and no date range to describe. Do not write "for the
period ending...", do not write a date in any format, and do not reference
a "snapshot." If you want to say what the report covers, say it in terms of
the review count only — e.g. "This report covers all 200 reviews."

CRITICAL — every count in the data is a CUMULATIVE TOTAL across the
business's entire review history, recalculated fresh each time, NOT a
narrow recent window. Never phrase a raw count as "this period," "this
week," or similar — that phrasing describes a short, recent slice of time,
which these numbers are not, and this report sits right next to a genuinely
narrow "new reviews since your last report" section on the dashboard, so
the wrong phrasing reads as a direct contradiction between the two ("86
this period" next to "0 new this week" looks broken even though neither
number is wrong). Use "overall," "in total," or "to date" for a raw
cumulative count. Reserve time-bounded language — "since your last
report," "recently" — strictly for describing an actual before/after
change between the current data and the previous one ("priorMentionCount"
etc.), never for a raw total.

BAD example (phrases a cumulative total as if it were recent): "Professionalism
continues to receive positive mentions (86 this period)."
GOOD example (same number, correctly framed as a total): "Professionalism has
86 positive mentions overall, and remains a consistent strength."

BAD example (states a date range, which must never appear): "This report
covers 200 reviews for the period 2026-08-13 to 2026-08-20."
GOOD example (count only, no dates): "This report covers all 200 reviews
for the practice."

A theme's "trendDirection" being "new" means it had zero mentions as of the
previous report — it says NOTHING about whether the theme is positive or
negative. Never treat a "new" theme as an issue, and never place it in
"emergingIssues" or reference it in "recommendedActions", unless its
negativeCount is greater than 0 AND negativeCount >= positiveCount for that
theme. A theme that is "new" but overwhelmingly positive (e.g. positiveCount
86, negativeCount 0) is good news, not something to "investigate" or "watch
before it becomes a pattern" — it belongs in "topPositiveThemes" instead,
never in "emergingIssues".

"recommendedActions" is the most important section — every entry must be
specific and tied directly to the numbers in the data, never generic filler.
Each category in the data includes both its current cumulative count and its
count as of the previous report (e.g. "negativeCount" and
"priorNegativeCount"). When an action is about a worsening or genuinely
negative emerging issue (per the sentiment rule above), state the actual
before/after counts (phrased as "since your last report," not "this
period") and a concrete next step naming the likely operational area.

BAD example (too vague, do not write like this): "Continue providing
excellent service."
GOOD example (specific, tied to the data): "Phone-response complaints
increased from 3 mentions to 8 mentions since your last report. Review
front-desk call handling and missed-call procedures."

"opportunities" are the practice's UNDER-USED strengths: genuine
strengths in the data that you did NOT already place in
"topPositiveThemes". Never repeat a category between those two lists —
"topPositiveThemes" is where the headline strengths go, and this section
exists to surface the ones a busy owner would otherwise overlook. Include
at most 3, and include none at all if every real strength is already
covered above; an empty list is correct and expected for a practice with
only one or two themes.

For each, write one or two sentences saying something specific about how
THIS strength could be put to work, grounded in that theme's actual counts.
The reader is paying for this — it must be something they could not have
written themselves about their own practice. Generic marketing advice that
would fit any business is a failure, even if it is technically true.
Operational suggestions only, same as "recommendedActions": how the
practice communicates, schedules, or presents itself — never anything
clinical.

BAD example (generic filler, do not write like this): "Praised in 34
reviews overall — consider highlighting this in your marketing."
GOOD example (specific, tied to the data): "Staff friendliness has 34
positive mentions and zero negatives — the most consistent strength in the
data. Worth naming specific team members in appointment reminders, since
patients already single them out by name."

Respond with ONLY valid JSON matching this shape, no other text:
{
  "executiveSummary": "3-5 sentences",
  "topPositiveThemes": [ { "category": "...", "summary": "..." } ],
  "topNegativeThemes": [ { "category": "...", "summary": "..." } ],
  "emergingIssues": [ { "category": "...", "summary": "..." } ],
  "opportunities": [ { "category": "...", "summary": "..." } ],
  "changesFromLastPeriod": [ "short factual statement", "..." ],
  "recommendedActions": [ { "title": "...", "detail": "..." } ]
}`;
}
