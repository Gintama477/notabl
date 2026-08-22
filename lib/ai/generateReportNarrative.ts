// Stage 3: narrative generation from the already-computed, already-verified
// rollup (see lib/ai/computeTrends.ts). The AI (or demo template) never sees
// raw review text at this stage — only numbers we already trust.

import { getAIProvider } from "./provider";
import { WeeklyNarrative, WeeklyNarrativeSchema, narrativeReferencesOnlyKnownThemes, reconcileNarrativeSelection } from "./validate";
import { ThemeRollupResult } from "./computeTrends";
import { selectNarrativeThemes } from "./selectNarrativeThemes";
import { THEME_LABELS, ThemeCategory } from "@/config/themes";

export class NarrativeFailedError extends Error {}

// No periodLabel parameter, deliberately. Under the cumulative model there
// is no reporting period, and the label that used to be passed here ("full
// history through 2026-08-20 (compared with the snapshot as of
// 2026-08-13)") was the direct source of raw ISO dates and internal
// bookkeeping leaking into the customer-facing executive summary. The model
// doesn't need it: the prompt already states that every count is a
// cumulative total (see lib/ai/prompts/generateNarrative.ts).
export async function generateWeeklyNarrative(
  rollups: ThemeRollupResult[],
  totalReviews: number,
  businessName: string
): Promise<WeeklyNarrative> {
  const provider = getAIProvider();
  const knownCategories = new Set(rollups.map((r) => r.category));

  // WHICH themes each section shows is decided here, in code, from the
  // verified rollup — the model only writes the words. See
  // selectNarrativeThemes for why: left to choose, the model returned an
  // empty opportunities array for a practice with three themes at zero
  // negatives, and the card claimed there was nothing to flag.
  const selection = selectNarrativeThemes(rollups);

  // The selection travels inside the data blob rather than as a new
  // argument, so nothing about the AIProvider interface changes and the
  // demo provider reads exactly the same field the prompt does.
  const structuredRollupJson = JSON.stringify({
    themes: rollups,
    totalReviews,
    selection,
  });

  // Used only for themes the model failed to write about. Plain, accurate,
  // and built from the same verified counts — worse prose than the model
  // produces, but never a missing theme.
  const byCategory = new Map(rollups.map((r) => [r.category as string, r]));
  const fallbackSummary = (category: string, section: string): string => {
    const stats = byCategory.get(category);
    const label = THEME_LABELS[category as ThemeCategory] ?? category;
    if (!stats) return `${label} appears in this report's data.`;
    if (section === "topNegativeThemes" || section === "emergingIssues") {
      return `${label} has ${stats.negativeCount} negative mention${stats.negativeCount === 1 ? "" : "s"} overall.`;
    }
    return `${label} has ${stats.positiveCount} positive mention${stats.positiveCount === 1 ? "" : "s"} overall.`;
  };

  const attempt = async (): Promise<WeeklyNarrative> => {
    const raw = await provider.generateNarrative(structuredRollupJson, businessName);
    const parsed = WeeklyNarrativeSchema.parse(raw);
    if (!narrativeReferencesOnlyKnownThemes(parsed, knownCategories)) {
      throw new Error("Narrative referenced a theme category not present in the verified rollup");
    }
    // Applied after validation, not instead of it: the schema proves the
    // shape is sound and the guard above proves no category was invented;
    // this proves nothing selected was dropped.
    return reconcileNarrativeSelection(parsed, selection, fallbackSummary);
  };

  try {
    return await attempt();
  } catch (firstError) {
    try {
      return await attempt();
    } catch (secondError) {
      throw new NarrativeFailedError(
        `Narrative generation failed twice. First: ${String(firstError)}. Second: ${String(secondError)}`
      );
    }
  }
}
