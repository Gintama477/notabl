import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const bugs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (err) => bugs.push("pageerror: " + err.message));

const email = `billing-test-${Date.now()}@example.com`;
await page.goto(BASE + "/signup", { waitUntil: "networkidle" });
await page.getByPlaceholder("Brightview Family Dental").fill("Billing Test Dental");
await page.getByPlaceholder("you@yourpractice.com").fill(email);
await page.getByRole("button", { name: "Analyze My Reviews" }).click();
await page.waitForURL("**/dashboard", { waitUntil: "networkidle" });

await page.getByRole("link", { name: "Billing" }).click();
await page.waitForURL("**/billing", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/billing-01-trialing.png" });
const status1 = await page.textContent("body");
if (!status1.includes("Trialing")) bugs.push("Billing page did not show Trialing status right after signup");

await page.getByRole("button", { name: "Add Payment Method" }).click();
await page.waitForURL("**/billing/demo-checkout", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/billing-02-demo-checkout.png" });

await page.getByRole("button", { name: "Simulate Successful Payment" }).click();
await page.waitForURL("**/billing?checkout=success", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/billing-03-active.png" });
const status2 = await page.textContent("body");
if (!status2.includes("Active")) bugs.push("Billing page did not show Active status after simulated success");

await page.getByRole("button", { name: "Manage Billing" }).click();
await page.waitForURL("**/billing/demo-portal", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/billing-04-demo-portal.png" });

await page.getByRole("button", { name: "Cancel Subscription" }).click();
await page.waitForURL("**/billing?cancelled=1", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/billing-05-cancelled.png" });
const status3 = await page.textContent("body");
if (!status3.includes("Cancelled")) bugs.push("Billing page did not show Cancelled status after simulated cancel");

// verify admin reflects it
await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
await page.getByPlaceholder("Admin key").fill("dev-admin");
await page.getByRole("button", { name: "Enter" }).click();
await page.waitForSelector("text=Notabl Admin", { timeout: 10000 });
await page.screenshot({ path: "/tmp/billing-06-admin.png", fullPage: true });

console.log("BUGS:", bugs.length ? bugs.join("\n") : "none");
await browser.close();
