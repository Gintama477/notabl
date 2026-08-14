// Stage 3: narrative generation from the already-computed, already-verified
// rollup (see lib/ai/computeTrends.ts). The AI (or demo template) never sees
// raw review text at this stage — only numbers we already trust.

import { getAIProvider } from "./provider";
import { WeeklyNarrative, WeeklyNarrativeSchema, narrativeReferencesOnlyKnownThemes } from "./validate";
import { ThemeRollupResult } from "./computeTrends";

export class NarrativeFailedError extends Error {}

export async function generateWeeklyNarrative(
  rollups: ThemeRollupResult[],
  totalReviews: number,
  periodLabel: string,
  businessName: string
): Promise<WeeklyNarrative> {
  const provider = getAIProvider();
  const knownCategories = new Set(rollups.map((r) => r.category));

  const structuredRollupJson = JSON.stringify({
    themes: rollups,
    totalReviews,
    periodLabel,
  });

  const attempt = async (): Promise<WeeklyNarrative> => {
    const raw = await provider.generateNarrative(structuredRollupJson, businessName);
    const parsed = WeeklyNarrativeSchema.parse(raw);
    if (!narrativeReferencesOnlyKnownThemes(parsed, knownCategories)) {
      throw new Error("Narrative referenced a theme category not present in the verified rollup");
    }
    return parsed;
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
