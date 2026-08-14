// Stage 1: per-review structured extraction, with validation and a single
// retry on invalid output. This is the only place raw review text is sent to
// an AI call — everything downstream operates on the validated structured
// result, never on the raw text again (see lib/ai/computeTrends.ts and
// lib/ai/generateReportNarrative.ts).

import { getAIProvider } from "./provider";
import { ReviewExtraction, ReviewExtractionSchema, sanitizeExtraction } from "./validate";

export class ExtractionFailedError extends Error {}

export async function extractReviewThemes(
  reviewText: string,
  rating: number
): Promise<ReviewExtraction> {
  const provider = getAIProvider();

  const attempt = async (): Promise<ReviewExtraction> => {
    const raw = await provider.analyzeReview(reviewText, rating);
    const parsed = ReviewExtractionSchema.parse(raw); // throws if shape is wrong
    return sanitizeExtraction(parsed, reviewText);
  };

  try {
    return await attempt();
  } catch (firstError) {
    try {
      return await attempt();
    } catch (secondError) {
      throw new ExtractionFailedError(
        `AI extraction failed twice for review. First: ${String(firstError)}. Second: ${String(secondError)}`
      );
    }
  }
}
