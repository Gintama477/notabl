// Prompt for Stage 3 (narrative generation). Critically, the input to this
// prompt is the already-computed structured rollup (counts, trend directions,
// % changes) — never the raw review text. The model is explaining numbers we
// already trust, not summarizing free text, which is what prevents it from
// inventing a trend that isn't in the data.

export const GENERATE_NARRATIVE_PROMPT_VERSION = "narrative-v2";

export function buildNarrativePrompt(structuredRollupJson: string, businessName: string): string {
  return `You are writing a weekly patient-review report for a dental practice
called "${businessName}". You are given pre-computed, verified statistics about
their patient reviews this period. Do NOT invent any numbers, themes, or facts
that are not present in this data.

DATA (already computed and verified — treat as ground truth):
${structuredRollupJson}

Write a short weekly report using ONLY the categories, counts, and trend
directions present in the data above. Do not reference any theme category not
listed in the data. Do not state a specific review quote unless it is included
verbatim in the data's excerpts.

Tone: plain, factual, useful to a busy small-business owner. No hype, no
emojis, no "AI" self-references. This is client feedback, not medical advice —
never suggest changes to clinical/medical treatment decisions, only
operational/service observations (e.g. front-desk process, scheduling,
communication).

"recommendedActions" is the most important section — every entry must be
specific and tied directly to the numbers in the data, never generic filler.
Each category in the data includes both this period's count and the prior
period's count (e.g. "negativeCount" and "priorNegativeCount"). When an
action is about a worsening or emerging issue, state the actual before/after
counts and a concrete next step naming the likely operational area.

BAD example (too vague, do not write like this): "Continue providing
excellent service."
GOOD example (specific, tied to the data): "Phone-response complaints
increased from 3 mentions to 8 mentions. Review front-desk call handling and
missed-call procedures."

Respond with ONLY valid JSON matching this shape, no other text:
{
  "executiveSummary": "3-5 sentences",
  "topPositiveThemes": [ { "category": "...", "summary": "..." } ],
  "topNegativeThemes": [ { "category": "...", "summary": "..." } ],
  "emergingIssues": [ { "category": "...", "summary": "..." } ],
  "changesFromLastPeriod": [ "short factual statement", "..." ],
  "recommendedActions": [ { "title": "...", "detail": "..." } ]
}`;
}
