import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const consoleErrors = [];
const bugs = [];

async function newCtx(viewport, label) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[${label}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[${label}] pageerror: ${err.message}`);
  });
  return { ctx, page };
}

async function shot(page, name) {
  await page.screenshot({ path: `/tmp/flow-${name}.png`, fullPage: true });
  console.log("saved", name);
}

// ---------- DESKTOP FLOW ----------
{
  const { ctx, page } = await newCtx({ width: 1280, height: 900 }, "desktop");
  const uniqueEmail = `test-${Date.now()}@example.com`;

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await shot(page, "01-landing-desktop");

  // Check nav links exist and are clickable
  const sampleLink = page.getByRole("link", { name: "See Sample Report" });
  if (!(await sampleLink.count())) bugs.push("Landing: 'See Sample Report' link not found");

  await page.getByRole("link", { name: "Analyze My Reviews" }).first().click();
  await page.waitForURL("**/signup", { waitUntil: "networkidle" });
  await shot(page, "02-signup-desktop");

  await page.getByPlaceholder("Brightview Family Dental").fill("Test Dental Practice");
  await page.getByPlaceholder("https://yourpractice.com").fill("https://testdental.example.com");
  await page.getByPlaceholder("Austin").fill("Springfield");
  await page.getByPlaceholder("TX").fill("IL");
  await page.getByPlaceholder("you@yourpractice.com").fill(uniqueEmail);

  await page.getByRole("button", { name: "Analyze My Reviews" }).click();
  try {
    await page.waitForURL("**/dashboard", { timeout: 15000, waitUntil: "networkidle" });
  } catch (e) {
    bugs.push("Signup: did not redirect to /dashboard within 15s — " + e.message);
  }
  await shot(page, "03-dashboard-desktop");

  // Check dashboard actually has data (not stuck on empty state)
  const emptyState = await page.getByText("No analysis has run yet").count();
  if (emptyState > 0) bugs.push("Dashboard: shows empty state right after signup — analysis-on-signup may have failed");

  const viewReportLink = page.getByRole("link", { name: "View Full Report" });
  if (await viewReportLink.count()) {
    await viewReportLink.click();
    await page.waitForURL("**/weekly-report/**", { waitUntil: "networkidle" });
    await shot(page, "04-weekly-report-desktop");
  } else {
    bugs.push("Dashboard: 'View Full Report' link missing (no report generated?)");
  }

  await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
  await shot(page, "05-pricing-desktop");

  await page.goto(BASE + "/sample-report", { waitUntil: "networkidle" });
  await shot(page, "06-sample-report-desktop");

  // Admin auth is now a POST-based login that sets a short-lived cookie
  // (see lib/auth/adminSession.ts) rather than a ?key= URL param.
  await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Admin key").fill("dev-admin");
  await page.getByRole("button", { name: "Enter" }).click();
  try {
    await page.waitForSelector("text=Notabl Admin", { timeout: 10000 });
  } catch (e) {
    bugs.push("Admin: login with correct dev-admin key did not reach the admin dashboard — " + e.message);
  }
  await shot(page, "07-admin-desktop");

  await ctx.close();
}

// ---------- MOBILE FLOW (iPhone 13 size) ----------
{
  const { ctx, page } = await newCtx({ width: 390, height: 844 }, "mobile");

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await shot(page, "m01-landing-mobile");

  await page.goto(BASE + "/signup", { waitUntil: "networkidle" });
  await shot(page, "m02-signup-mobile");

  await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
  await shot(page, "m03-pricing-mobile");

  await page.goto(BASE + "/sample-report", { waitUntil: "networkidle" });
  await shot(page, "m04-sample-report-mobile");

  await page.goto(BASE + "/legal/terms", { waitUntil: "networkidle" });
  await shot(page, "m05-terms-mobile");

  // Check header nav on mobile - is it usable / does it overflow?
  const headerBox = await page.locator("header").boundingBox();
  if (headerBox && headerBox.width > 390) {
    bugs.push(`Mobile: header wider than viewport (${headerBox.width}px > 390px) on at least one page`);
  }

  // check horizontal scroll / overflow on body
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > 400) {
    bugs.push(`Mobile: page has horizontal overflow, scrollWidth=${scrollWidth}px on /legal/terms`);
  }

  await ctx.close();
}

fs.writeFileSync("/tmp/flow-test-results.json", JSON.stringify({ bugs, consoleErrors }, null, 2));
console.log("\n=== BUGS ===");
console.log(bugs.length ? bugs.join("\n") : "none found");
console.log("\n=== CONSOLE ERRORS ===");
console.log(consoleErrors.length ? consoleErrors.join("\n") : "none found");

await browser.close();
