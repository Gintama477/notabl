// Stage 2: business-level rollup. Pure arithmetic, no AI call — cheap, fast,
// fully auditable, and safe to re-run any time without spending on API calls.

import { ThemeCategory, THEME_CATEGORIES, TrendDirection } from "@/config/themes";

export type ThemeMentionRecord = {
  category: ThemeCategory;
  sentiment: "positive" | "neutral" | "negative";
};

export type ThemeRollupResult = {
  category: ThemeCategory;
  mentionCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  priorMentionCount: number;
  priorPositiveCount: number;
  priorNegativeCount: number;
  trendDirection: TrendDirection;
  pctChangeVsPrior: number | null;
};

/**
 * Compares this period's theme mentions against the prior period's and
 * returns one rollup row per theme category that had at least one mention in
 * either period (categories with zero mentions in both periods are omitted —
 * nothing to report).
 */
export function computeThemeRollups(
  currentPeriodMentions: ThemeMentionRecord[],
  priorPeriodMentions: ThemeMentionRecord[]
): ThemeRollupResult[] {
  const results: ThemeRollupResult[] = [];

  for (const category of THEME_CATEGORIES) {
    const current = currentPeriodMentions.filter((m) => m.category === category);
    const prior = priorPeriodMentions.filter((m) => m.category === category);

    if (current.length === 0 && prior.length === 0) continue;

    const positiveCount = current.filter((m) => m.sentiment === "positive").length;
    const negativeCount = current.filter((m) => m.sentiment === "negative").length;
    const neutralCount = current.filter((m) => m.sentiment === "neutral").length;
    const mentionCount = current.length;
    const priorCount = prior.length;
    const priorPositiveCount = prior.filter((m) => m.sentiment === "positive").length;
    const priorNegativeCount = prior.filter((m) => m.sentiment === "negative").length;

    let trendDirection: TrendDirection;
    let pctChangeVsPrior: number | null;

    if (priorCount === 0 && mentionCount > 0) {
      trendDirection = "new";
      pctChangeVsPrior = null; // undefined % change from zero — report as "new" instead
    } else if (priorCount === 0 && mentionCount === 0) {
      trendDirection = "flat";
      pctChangeVsPrior = null;
    } else {
      const pctChange = ((mentionCount - priorCount) / priorCount) * 100;
      pctChangeVsPrior = Math.round(pctChange * 10) / 10;
      if (pctChange >= 15) trendDirection = "increasing";
      else if (pctChange <= -15) trendDirection = "decreasing";
      else trendDirection = "flat";
    }

    results.push({
      category,
      mentionCount,
      positiveCount,
      negativeCount,
      neutralCount,
      priorMentionCount: priorCount,
      priorPositiveCount,
      priorNegativeCount,
      trendDirection,
      pctChangeVsPrior,
    });
  }

  return results.sort((a, b) => b.mentionCount - a.mentionCount);
}
