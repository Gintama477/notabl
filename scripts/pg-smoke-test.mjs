// One-off validation: exercises schema.pg.ts against a real Postgres
// instance with the same kind of operations queries.ts performs (insert
// account -> business -> review source -> review, then a themed rollup-style
// query), to prove the Postgres port isn't just DDL-correct but also
// query-correct. Not part of the app; not run in CI; delete once the real
// cutover happens and this is superseded by testing against the real thing.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, gte, lt, and } from "drizzle-orm";
import * as schema from "../lib/db/schema.pg.ts";

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  const [account] = await db
    .insert(schema.accounts)
    .values({ email: `pg-smoke-${Date.now()}@example.com` })
    .returning();
  console.log("Inserted account:", account.id, "createdAt type:", typeof account.createdAt);

  const [business] = await db
    .insert(schema.businesses)
    .values({ accountId: account.id, name: "PG Smoke Test Dental", city: "Austin", state: "TX" })
    .returning();
  console.log("Inserted business:", business.id);

  const [source] = await db
    .insert(schema.reviewSources)
    .values({ businessId: business.id, sourceType: "demo", status: "active" })
    .returning();

  const now = new Date();
  const reviewDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const [review] = await db
    .insert(schema.reviews)
    .values({
      businessId: business.id,
      reviewSourceId: source.id,
      externalReviewId: "smoke-1",
      authorName: "Test T.",
      rating: 5,
      reviewText: "Great visit, friendly staff.",
      reviewDate,
      isDemoData: true,
    })
    .returning();
  console.log("Inserted review:", review.id, "isDemoData type:", typeof review.isDemoData, review.isDemoData);

  // Same query shape runAnalysis.ts uses: date-range filter with gte/lt on
  // a text column holding ISO strings.
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = now.toISOString();
  const inRange = await db
    .select()
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.businessId, business.id),
        gte(schema.reviews.reviewDate, periodStart),
        lt(schema.reviews.reviewDate, periodEnd)
      )
    );
  console.log("Reviews found in 7-day range (expect 1):", inRange.length);

  // Foreign key cascade check: deleting the business should cascade to
  // review_sources/reviews per the schema's onDelete: "cascade".
  await db.delete(schema.businesses).where(eq(schema.businesses.id, business.id));
  const orphanCheck = await db.select().from(schema.reviews).where(eq(schema.reviews.id, review.id));
  console.log("Review gone after cascading business delete (expect 0):", orphanCheck.length);

  // Cleanup
  await db.delete(schema.accounts).where(eq(schema.accounts.id, account.id));

  await sql.end();
  console.log("\nPG SMOKE TEST: PASS");
}

main().catch((err) => {
  console.error("PG SMOKE TEST: FAIL", err);
  process.exit(1);
});
