// Verifies runAnalysisForBusiness skips narrative regeneration on a
// back-to-back re-run with no new reviews (see rollupsAreEquivalent in
// lib/analysis/runAnalysis.ts). Not part of the app; standalone script.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const email = `cost-control-${Date.now()}@example.com`;
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  const inputs = await page.$$("form input");
  await inputs[0].fill("Cost Control Test Dental");
  const emailInput = await page.$('input[type="email"]');
  await emailInput.fill(email);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // Signup already ran analysis once. Now trigger it twice more in a row
  // via the API directly (same as clicking "Run Analysis Now" twice).
  const run1 = await page.evaluate(async () => {
    const r = await fetch("/api/analysis/run", { method: "POST" });
    return r.json();
  });
  const run2 = await page.evaluate(async () => {
    const r = await fetch("/api/analysis/run", { method: "POST" });
    return r.json();
  });

  console.log("Run 1:", run1);
  console.log("Run 2:", run2);
  console.log("\nRun 2 reused the same report (expect true):", run1.weeklyReportId === run2.weeklyReportId);
  console.log("Run 2 reviewsNewlyAnalyzed (expect 0):", run2.reviewsNewlyAnalyzed);

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
