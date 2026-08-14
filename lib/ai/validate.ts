// Zod schemas that every AI output must pass before the app trusts it.
// This is the enforcement mechanism behind "do not allow AI to invent review
// information" and "generate structured JSON before natural language."

import { z } from "zod";
import { THEME_CATEGORIES, SENTIMENTS, SEVERITIES } from "@/config/themes";

export const ThemeMentionSchema = z.object({
  category: z.enum(THEME_CATEGORIES),
  sentiment: z.enum(SENTIMENTS),
  severity: z.enum(SEVERITIES),
  confidence: z.number().min(0).max(1).default(0.8),
  // excerpt must be checked against the source text by the caller (see
  // assertExcerptIsSubstring below) — Zod alone can't know the source text.
  excerpt: z.string().max(240).nullable().optional(),
});

export const ReviewExtractionSchema = z.object({
  sentiment: z.enum(SENTIMENTS),
  themes: z.array(ThemeMentionSchema).max(6),
});

export type ReviewExtraction = z.infer<typeof ReviewExtractionSchema>;

/**
 * Enforces "never invent review information": if the model produced an
 * excerpt, it must literally appear in the source review text. If it
 * doesn't, we drop the excerpt (keep the theme/sentiment/severity call,
 * since that's a judgment, not a quote) rather than reject the whole
 * extraction — a stray excerpt shouldn't throw away a correct theme call.
 */
export function sanitizeExtraction(
  extraction: ReviewExtraction,
  sourceText: string
): ReviewExtraction {
  const normalizedSource = sourceText.toLowerCase();
  return {
    ...extraction,
    themes: extraction.themes.map((t) => {
      if (t.excerpt && !normalizedSource.includes(t.excerpt.toLowerCase())) {
        return { ...t, excerpt: null };
      }
      return t;
    }),
  };
}

export const NarrativeActionSchema = z.object({
  title: z.string().max(140),
  detail: z.string().max(400),
});

export const NarrativeThemeRefSchema = z.object({
  category: z.enum(THEME_CATEGORIES),
  summary: z.string().max(300),
});

export const WeeklyNarrativeSchema = z.object({
  executiveSummary: z.string().min(20).max(1200),
  topPositiveThemes: z.array(NarrativeThemeRefSchema).max(5),
  topNegativeThemes: z.array(NarrativeThemeRefSchema).max(5),
  emergingIssues: z.array(NarrativeThemeRefSchema).max(5),
  changesFromLastPeriod: z.array(z.string().max(300)).max(6),
  recommendedActions: z.array(NarrativeActionSchema).max(5),
});

export type WeeklyNarrative = z.infer<typeof WeeklyNarrativeSchema>;

/**
 * Guards the narrative stage against fabricating a theme that isn't in the
 * structured rollup it was given. The narrative stage only ever sees
 * pre-computed numbers (see lib/ai/generateReportNarrative.ts) — this is the
 * belt-and-suspenders check that it didn't reference a category outside
 * what was actually passed in.
 */
export function narrativeReferencesOnlyKnownThemes(
  narrative: WeeklyNarrative,
  knownCategories: Set<string>
): boolean {
  const refs = [
    ...narrative.topPositiveThemes,
    ...narrative.topNegativeThemes,
    ...narrative.emergingIssues,
  ];
  return refs.every((r) => knownCategories.has(r.category));
}
