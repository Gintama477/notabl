import { chromium } from "playwright";

const pages = [
  { url: "http://localhost:3000/", file: "/tmp/shot-landing.png" },
  { url: "http://localhost:3000/sample-report", file: "/tmp/shot-sample-report.png" },
  { url: "http://localhost:3000/pricing", file: "/tmp/shot-pricing.png" },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const p of pages) {
  await page.goto(p.url, { waitUntil: "networkidle" });
  await page.screenshot({ path: p.file, fullPage: true });
  console.log("Saved", p.file);
}

await browser.close();
