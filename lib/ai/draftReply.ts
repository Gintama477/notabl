// Stage: drafts a public reply to a single review, on demand (never on
// ingest — see app/api/reviews/[id]/draft-reply/route.ts). Mirrors the
// retry-once pattern in lib/ai/extractReview.ts and
// lib/ai/generateReportNarrative.ts, but the thing being retried on here is
// different and more important than a schema-shape failure: the HIPAA-rail
// check (replyContainsReviewerName) from lib/ai/validate.ts. See
// lib/ai/prompts/draftReply.ts for why this rail exists — a prompt
// instruction alone is not a guarantee, so a draft that slips through with
// the reviewer's name gets thrown away and regenerated once before this
// gives up and surfaces an error instead of ever handing back an unsafe
// draft.

import { getAIProvider } from "./provider";
import { replyContainsReviewerName } from "./validate";

export class DraftReplyFailedError extends Error {}

export async function draftReviewReply(
  reviewText: string,
  rating: number,
  businessName: string,
  authorName: string | null
): Promise<string> {
  const provider = getAIProvider();

  const attempt = async (): Promise<string> => {
    const reply = await provider.draftReply(reviewText, rating, businessName);
    if (replyContainsReviewerName(reply, authorName)) {
      throw new Error("Drafted reply contained the reviewer's name — rejected before it was ever shown or stored.");
    }
    return reply;
  };

  try {
    return await attempt();
  } catch (firstError) {
    try {
      return await attempt();
    } catch (secondError) {
      throw new DraftReplyFailedError(
        `Reply drafting failed twice. First: ${String(firstError)}. Second: ${String(secondError)}`
      );
    }
  }
}
