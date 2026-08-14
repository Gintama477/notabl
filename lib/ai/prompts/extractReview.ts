// Prompt for Stage 1 (per-review structured extraction). Used only by
// ClaudeProvider (lib/ai/provider.ts) when ANTHROPIC_API_KEY is configured.
// Kept in its own file/versioned string so prompt changes are reviewable
// independently of the calling code, and so analysis_runs.promptVersion can
// reference a specific version of this text.

import { THEME_CATEGORIES } from "@/config/themes";

export const EXTRACT_REVIEW_PROMPT_VERSION = "extract-v1";

export function buildExtractReviewPrompt(reviewText: string, rating: number): string {
  return `You are analyzing a single public customer review for a dental practice.

Review (rating given by customer: ${rating}/5 stars):
"""
${reviewText}
"""

Identify the overall sentiment and any themes mentioned, using ONLY these theme
categories: ${THEME_CATEGORIES.join(", ")}.

Rules (follow exactly):
1. Only include a theme if it is actually discussed in the review text.
2. Do not invent, exaggerate, or infer details not present in the text.
3. If you include an "excerpt", it MUST be an exact, verbatim substring of the
   review text above (same casing/punctuation) — copy it directly, do not
   paraphrase. If no short excerpt clearly supports the theme, omit excerpt.
4. severity should reflect how strongly the review expresses the issue (low/medium/high).
5. confidence is your certainty in this theme call, 0 to 1.
6. Return at most 6 themes.

Respond with ONLY valid JSON matching this shape, no other text:
{
  "sentiment": "positive" | "neutral" | "negative",
  "themes": [
    { "category": "...", "sentiment": "...", "severity": "...", "confidence": 0.0, "excerpt": "..." }
  ]
}`;
}
