// One-time script: assigns a slug to every existing business row that
// doesn't have one yet. businesses.slug was added nullable so this
// migration applies cleanly to existing data (see lib/db/schema.pg.ts), but
// the Review Requests feature (app/r/[slug]) hangs entirely off it — every
// business needs a real slug before that feature is usable for them.
//
// Reuses generateUniqueBusinessSlug (lib/db/queries.ts) — the exact same
// function new signups/pilot invites use — so backfilled slugs follow the
// same shape and collision handling as freshly created ones.
//
// Run once: npx tsx scripts/backfill-business-slugs.ts
// Safe to re-run: only rows where slug IS NULL are touched.

import "dotenv/config"; // load .env — see scripts/seed.ts for why this is needed here
import { db } from "../lib/db/client";
import { businesses } from "../lib/db/schema.pg";
import { eq, isNull } from "drizzle-orm";
import { generateUniqueBusinessSlug } from "../lib/db/queries";

async function main() {
  const rows = await db.select().from(businesses).where(isNull(businesses.slug));
  console.log(`Found ${rows.length} business(es) with no slug.`);

  let updated = 0;
  for (const row of rows) {
    const slug = await generateUniqueBusinessSlug(row.name);
    await db.update(businesses).set({ slug }).where(eq(businesses.id, row.id));
    console.log(`Assigned "${slug}" to ${row.name} (${row.id})`);
    updated++;
  }

  console.log(`\nDone. Assigned slugs to ${updated} business(es).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
