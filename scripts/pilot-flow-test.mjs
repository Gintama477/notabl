import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // Log into admin
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const needsLogin = await page.$('input[name="key"]');
  if (needsLogin) {
    await page.fill('input[name="key"]', "dev-admin");
    await page.click("form button");
    await page.waitForTimeout(1000);
  }

  const email = `pilot-${Date.now()}@example.com`;
  await page.fill('input[placeholder="Practice name"]', "Pilot Test Dental");
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Invite to Pilot")');
  await page.waitForTimeout(1500);

  const bodyText = await page.textContent("body");
  console.log("Invite success message shown:", bodyText.includes("Pilot account created and invite sent."));

  // Extract the demo login link
  const demoLink = await page.$eval('a[href*="/api/login/verify"]', (el) => el.href).catch(() => null);
  console.log("Demo login link found:", !!demoLink);

  if (demoLink) {
    await page.goto(demoLink, { waitUntil: "networkidle" });
    console.log("After clicking pilot login link, URL:", page.url());

    await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
    const billingText = await page.textContent("body");
    console.log("Billing page shows Pilot Access — Free:", billingText.includes("Pilot Access"));
    console.log("Billing page hides Add Payment Method:", !billingText.includes("Add Payment Method"));
  }

  // Confirm the pilot row shows up in the admin table
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const adminText = await page.textContent("body");
  console.log("Admin pilot table shows the new practice:", adminText.includes("Pilot Test Dental"));

  console.log("\nConsole/page errors:", errors.length ? errors : "none");
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
