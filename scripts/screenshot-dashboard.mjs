import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// Sign up via the real UI form so this exercises the actual client flow.
page.on("response", (r) => {
  if (r.url().includes("/api/")) console.log("RESPONSE", r.status(), r.url());
});
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto("http://localhost:3000/signup", { waitUntil: "load" });
await page.waitForSelector("form", { timeout: 15000 });
await page.fill('input[placeholder="Brightview Family Dental"]', "Riverside Smiles Dental");
await page.fill('input[placeholder="Austin"]', "Portland");
await page.fill('input[placeholder="TX"]', "OR");
await page.fill('input[type="email"]', `screenshot-${Date.now()}@example.com`);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/shot-signup-after-click.png" });
console.log("URL after click:", page.url());
await page.waitForURL("**/dashboard", { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/shot-dashboard.png", fullPage: true });

// Click into the weekly report
const reportLink = await page.$('a[href^="/dashboard/weekly-report/"]');
if (reportLink) {
  await reportLink.click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "/tmp/shot-weekly-report.png", fullPage: true });
}

await browser.close();
console.log("done");
