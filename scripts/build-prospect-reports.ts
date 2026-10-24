// Builds report-first outreach reports for prospects (see
// lib/outreach/prospectReport.ts). Runs OUTSIDE Vercel on purpose: each
// prospect needs one Outscraper fetch plus several 45-second analysis
// rounds, far past a 60-second function.
//
//   npx tsx scripts/build-prospect-reports.ts --campaign notabl-dental --limit 20 [--reviews 60] [--dry-run]
//   npx tsx scripts/build-prospect-reports.ts --ids id1,id2
//
// Needs DATABASE_URL, OUTSCRAPER_API_KEY, ANTHROPIC_API_KEY in .env.local
// (vercel env pull .env.local). Skips prospects already "ready"/"sent".

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: false });
import { appendFileSync } from "node:fs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../lib/db/client";
import { prospects } from "../lib/db/schema.pg";
import { buildProspectReport, DeadlineReached, DEFAULT_PROSPECT_REVIEWS_LIMIT } from "../lib/outreach/prospectReport";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");
const reviewsLimit = Number(arg("reviews")) || DEFAULT_PROSPECT_REVIEWS_LIMIT;
const logFile = arg("log") || "scripts/build-prospect-reports.log";
const maxSeconds = Number(arg("max-seconds")) || 0;
const deadlineMs = maxSeconds ? Date.now() + maxSeconds * 1000 : 0;
const log = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(logFile, stamped + "\n");
};

async function main() {
  const ids = arg("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
  const campaign = arg("campaign");
  const limit = Number(arg("limit")) || 20;

  let rows;
  if (ids?.length) {
    rows = await db.select().from(prospects).where(inArray(prospects.id, ids));
  } else if (campaign) {
    rows = await db
      .select()
      .from(prospects)
      .where(and(eq(prospects.campaign, campaign), eq(prospects.status, "drafted"), isNull(prospects.reportToken)))
      .orderBy(prospects.createdAt)
      .limit(limit);
  } else {
    throw new Error("Pass --ids or --campaign.");
  }

  log(`${rows.length} prospect(s) selected; reviewsLimit=${reviewsLimit}; dryRun=${dryRun}`);
  let ok = 0;
  let failed = 0;
  for (const p of rows) {
    if (p.status === "ready" || p.status === "sent" || p.status === "followed_up") {
      log(`skip ${p.businessName}: status ${p.status}`);
      continue;
    }
    if (deadlineMs && Date.now() > deadlineMs - 20_000) {
      log("time budget used up; re-run to continue");
      break;
    }
    log(`--- ${p.businessName} (${p.city}) ${p.googleReviewCount ?? "?"} reviews, ${p.contactEmail ?? "no email"}`);
    if (dryRun) continue;
    try {
      const r = await buildProspectReport(p.id, { reviewsLimit, deadlineMs: deadlineMs || undefined, log: (l) => log(`    ${l}`) });
      log(`    READY token=${r.token} reviews=${r.reviewCount}`);
      ok++;
    } catch (e) {
      if (e instanceof DeadlineReached) {
        log(`    paused: ${e.message}`);
        break;
      }
      failed++;
      log(`    FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(`done: ${ok} ready, ${failed} failed`);
  process.exit(0);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
