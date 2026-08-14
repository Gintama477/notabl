import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  // 1. Sign up a fresh test account so we have a session (feedback page requires nothing but let's check both paths)
  const email = `verify-${Date.now()}@example.com`;

  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  const inputs = await page.$$("form input");
  // Order per app/signup/page.tsx: businessName, website, city, state, reviewProfileLinks, email
  await inputs[0].fill("Verify Test Dental");
  const emailInput = await page.$('input[type="email"]');
  await emailInput.fill(email);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
  console.log("After signup, URL:", page.url());

  // 2. Go to feedback page and fill out the new 8-question form
  await page.goto(`${BASE}/feedback`, { waitUntil: "networkidle" });
  const bodyText = await page.textContent("body");
  const requiredQuestions = [
    "immediately clear",
    "most useful",
    "confusing",
    "save your practice time",
    "use this weekly",
    "pay $49",
    "reasonable",
    "change before you would pay",
  ];
  for (const q of requiredQuestions) {
    if (!bodyText.toLowerCase().includes(q.toLowerCase())) {
      console.log(`MISSING QUESTION TEXT: "${q}"`);
    }
  }

  // Fill radios (first "yes" option for each radio group) and text fields
  const radioGroups = await page.$$eval("input[type=radio]", (els) =>
    [...new Set(els.map((e) => e.name))]
  );
  for (const name of radioGroups) {
    const opts = await page.$$(`input[type=radio][name="${name}"]`);
    if (opts.length) await opts[0].click();
  }
  const textareas = await page.$$("textarea");
  let i = 0;
  for (const ta of textareas) {
    i++;
    await ta.fill(`Test answer ${i} for verification.`);
  }

  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log("After feedback submit, URL:", page.url());
  const afterSubmitText = await page.textContent("body");
  console.log("Contains thank you/success text:", /thank|received|submitted/i.test(afterSubmitText));

  // 3. Log into admin and verify the feedback shows with new field labels, no crash
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const needsLogin = await page.$('input[name="key"]');
  if (needsLogin) {
    await page.fill('input[name="key"]', "dev-admin");
    await page.click('form button');
    await page.waitForTimeout(1500);
  }
  console.log("Admin page URL:", page.url());
  const adminText = await page.textContent("body");
  console.log("Admin page contains 'Would Pay $49/mo':", adminText.includes("Would Pay $49/mo"));
  console.log("Admin page contains 'Sample Report Views':", adminText.includes("Sample Report Views"));
  console.log("Admin page contains test answer text:", adminText.includes("Test answer 1 for verification."));
  console.log("Admin page contains stale 'NPS':", adminText.includes("NPS"));

  console.log("\nConsole/page errors:", consoleErrors.length ? consoleErrors : "none");

  await browser.close();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
