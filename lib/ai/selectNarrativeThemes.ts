// WHICH themes appear in each section of the report is decided here, in
// code, from the verified rollup — never by the model. The model only
// writes the sentences about what it's given.
//
// That division exists because the alternative silently under-reports. A
// practice with 34 positive mentions of staff friendliness and zero
// negatives had its Opportunities card render "Nothing under-used to flag"
// — the model simply returned an empty array, and an empty card that
// claims there's nothing to say is worse than the boilerplate it replaced.
// The same failure was possible for every other section: an empty
// topNegativeThemes would have hidden real complaints just as quietly.
// Code cannot omit something the data contains.

import { ThemeCategory } from "@/config/themes";
import { ThemeRollupResult } from "./computeTrends";

/** How many headline positives "What Patients Love" shows. */
const TOP_POSITIVE_LIMIT = 4;
/** How many under-used strengths "Opportunities" shows. */
const OPPORTUNITY_LIMIT = 3;
const TOP_NEGATIVE_LIMIT = 4;
const EMERGING_LIMIT = 5;

export type NarrativeSelection = {
  topPositiveThemes: ThemeCategory[];
  topNegativeThemes: ThemeCategory[];
  emergingIssues: ThemeCategory[];
  opportunities: ThemeCategory[];
};

export function selectNarrativeThemes(themes: ThemeRollupResult[]): NarrativeSelection {
  const positiveSorted = themes
    .filter((t) => t.positiveCount > t.negativeCount && t.positiveCount > 0)
    .sort((a, b) => b.positiveCount - a.positiveCount);

  const topPositiveThemes = positiveSorted.slice(0, TOP_POSITIVE_LIMIT);
  // Sliced from exactly where the headline list stops, so the two can
  // never overlap regardless of how many positives exist. A hardcoded
  // start index is what made the previous version repeat the 3rd and 4th
  // strongest themes verbatim from the card beside it.
  const opportunities = positiveSorted.slice(TOP_POSITIVE_LIMIT, TOP_POSITIVE_LIMIT + OPPORTUNITY_LIMIT);

  // negativeCount >= positiveCount, not merely negativeCount > 0 — a theme
  // praised 34 times and criticized 3 is a strength, and listing it as a
  // complaint is the "calls praise a problem" bug this rule exists to
  // prevent.
  const topNegativeThemes = themes
    .filter((t) => t.negativeCount > 0 && t.negativeCount >= t.positiveCount)
    .sort((a, b) => b.negativeCount - a.negativeCount)
    .slice(0, TOP_NEGATIVE_LIMIT);

  // trendDirection "new" says nothing about sentiment on its own — it just
  // means zero mentions as of the last report. Without the same negative
  // filter, a newly-appearing burst of praise gets reported as an issue to
  // investigate.
  const emergingIssues = themes
    .filter((t) => t.trendDirection === "new" && t.negativeCount > 0 && t.negativeCount >= t.positiveCount)
    .slice(0, EMERGING_LIMIT);

  return {
    topPositiveThemes: topPositiveThemes.map((t) => t.category),
    topNegativeThemes: topNegativeThemes.map((t) => t.category),
    emergingIssues: emergingIssues.map((t) => t.category),
    opportunities: opportunities.map((t) => t.category),
  };
}
