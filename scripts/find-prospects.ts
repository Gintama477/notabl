// Finds prospects for a campaign via Outscraper Maps search and validates
// their emails. Companion to scripts/build-prospect-reports.ts.
//
//   npx tsx scripts/find-prospects.ts --campaign auto-nj --category "Auto repair shop" \
//     --cities "Jersey City,Hoboken,Bayonne,Union City,Kearny" --state "New Jersey" \
//     --min-reviews 100 --limit 15
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: false });
import { findAndDraftProspects, verifyProspectEmails } from "../lib/db/queries";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const campaign = arg("campaign");
  const category = arg("category") || "Dentist";
  const cities = (arg("cities") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const state = arg("state") || "New Jersey";
  const minReviewCount = Number(arg("min-reviews")) || 100;
  const maxReviewCount = Number(arg("max-reviews")) || 1500;
  const limit = Number(arg("limit")) || 15;
  if (!campaign || !cities.length) throw new Error("Pass --campaign and --cities.");

  for (const city of cities) {
    const r = await findAndDraftProspects({
      city,
      state,
      category,
      campaign,
      limit,
      minReviewCount,
      maxReviewCount,
      sampleReportUrl: "https://www.trynotabl.com/sample-report",
      senderName: process.env.OUTREACH_SENDER_NAME || "Murat Emre Yesilsirt",
    });
    console.log(`${city}: ${JSON.stringify(r)}`);
  }
  for (let i = 0; i < 6; i++) {
    const v = await verifyProspectEmails({ limit: 25 });
    console.log(`verify pass ${i + 1}: ${JSON.stringify(v)}`);
    if (v.processed === 0) break;
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
