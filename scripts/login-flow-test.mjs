import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const email = `login-verify-${Date.now()}@example.com`;

  // 1. Sign up a fresh account
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  const inputs = await page.$$("form input");
  await inputs[0].fill("Login Flow Test Dental");
  const emailInput = await page.$('input[type="email"]');
  await emailInput.fill(email);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  console.log("Signed up, on dashboard:", page.url());

  // 2. Log out
  await page.click('form[action="/api/logout"] button');
  await page.waitForTimeout(1000);
  console.log("After logout, URL:", page.url());

  // 3. Try dashboard directly while logged out -> should redirect
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  console.log("Dashboard while logged out redirects to:", page.url());
  const isBlocked = !page.url().includes("/dashboard");
  console.log("Correctly blocked dashboard access:", isBlocked);

  // 4. Go to /login, request a magic link for the account we just made
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');
  await page.waitForURL(/check-email/, { timeout: 10000 });
  console.log("On check-email page:", page.url());

  // 5. In demo mode, the page should surface a clickable demo link
  await page.waitForTimeout(500);
  const demoLinkEl = await page.$('a:has-text("Continue to Dashboard")');
  console.log("Demo login link present:", !!demoLinkEl);

  if (demoLinkEl) {
    await demoLinkEl.click();
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    console.log("After clicking demo login link, URL:", page.url());
  }

  // 6. Try requesting a login link for a NON-existent email -> should get the
  // same generic check-email page, no enumeration signal, no demo link
  await page.click('form[action="/api/logout"] button').catch(() => {});
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', `nonexistent-${Date.now()}@example.com`);
  await page.click('button[type="submit"]');
  await page.waitForURL(/check-email/, { timeout: 10000 });
  const bodyText = await page.textContent("body");
  console.log("Non-existent email also lands on check-email page:", page.url().includes("check-email"));
  console.log("Non-existent email shows NO demo link:", !bodyText.includes("Continue to Dashboard"));

  // 7. Tampered/garbage token should redirect to /login with an error, not crash
  await page.goto(`${BASE}/api/login/verify?token=garbage`, { waitUntil: "networkidle" });
  console.log("Garbage token redirects to:", page.url());

  console.log("\nConsole/page errors:", errors.length ? errors : "none");
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
