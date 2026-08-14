// Verifies point 26: failure categories are visible in /admin's Automation
// Errors section. Triggers a real failed admin login (wrong key), then logs
// into admin with the correct key and checks the failed attempt appears in
// the automation log table.
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_SECRET || "dev-admin";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

// 1. Trigger a failed admin login (wrong key) via a direct POST.
const failRes = await page.request.post(`${BASE}/api/admin/login`, {
  form: { key: "definitely-wrong-key" },
});
console.log("Wrong-key admin login status:", failRes.status());

// 2. Log in for real.
await page.goto(`${BASE}/admin`);
const keyInput = page.locator('input[name="key"]');
if (await keyInput.count()) {
  await keyInput.fill(ADMIN_KEY);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.getByRole("button", { name: "Enter" }).click(),
  ]);
}

// 3. Check the admin page shows the failed login in Automation Errors / Recent Automation Log.
const bodyText = await page.textContent("body");
const hasErrorsSection = bodyText.includes("Automation Errors");
const hasAdminLoginEntry = bodyText.includes("admin-login");
console.log("Has 'Automation Errors' section:", hasErrorsSection);
console.log("Has 'admin-login' entry visible:", hasAdminLoginEntry);

if (!hasErrorsSection || !hasAdminLoginEntry) {
  console.error("FAIL: admin-login failure not visible in admin panel");
  await browser.close();
  process.exit(1);
}

console.log("PASS: failed admin login is visible in /admin automation log");
await browser.close();
