// Manual review import — for a small, already-in-hand set of reviews (e.g.
// a pilot practice exported their own reviews and wants them analyzed
// before any live API connector exists). Validated with Zod, inserted the
// same way any other review source's reviews are, de-duplicated by
// (reviewSourceId, externalReviewId) same as every other source per the
// reviews_source_external_unique index — importing the same file twice is
// safe, it just no-ops on the duplicates.
//
// Deliberately no UI for this yet — call importManualReviews() directly
// (e.g. from a one-off script) when it's actually needed. See
// docs/REVIEW-DATA-PROVIDERS.md.

import { z } from "zod";
import { db } from "@/lib/db/client";
import { reviewSources, reviews } from "@/lib/db/schema.pg";
import { eq, and } from "drizzle-orm";

export const ManualReviewSchema = z.object({
  externalReviewId: z.string().min(1),
  authorName: z.string().max(120).nullable().optional(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(1).max(5000),
  reviewDate: z.string().datetime({ offset: true }).or(z.string().date()),
});

export type ManualReviewInput = z.infer<typeof ManualReviewSchema>;

export async function importManualReviews(businessId: string, rawReviews: unknown[]) {
  const parsed = rawReviews.map((r) => ManualReviewSchema.parse(r));

  let [source] = await db
    .select()
    .from(reviewSources)
    .where(and(eq(reviewSources.businessId, businessId), eq(reviewSources.sourceType, "manual")))
    .limit(1);

  if (!source) {
    [source] = await db
      .insert(reviewSources)
      .values({ businessId, sourceType: "manual", status: "active", lastSyncedAt: new Date().toISOString() })
      .returning();
  }

  let imported = 0;
  let skipped = 0;
  for (const r of parsed) {
    const [existing] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.reviewSourceId, source.id), eq(reviews.externalReviewId, r.externalReviewId)))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(reviews).values({
      businessId,
      reviewSourceId: source.id,
      externalReviewId: r.externalReviewId,
      authorName: r.authorName ?? null,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewDate: r.reviewDate,
      isDemoData: false,
      rawPayloadJson: null,
    });
    imported++;
  }

  await db.update(reviewSources).set({ lastSyncedAt: new Date().toISOString() }).where(eq(reviewSources.id, source.id));

  return { imported, skipped, sourceId: source.id };
}
