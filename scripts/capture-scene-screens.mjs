/** Capture real local conversations for the Blender screen textures. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const base = process.env.APP_URL ?? "http://127.0.0.1:4173";
const out = new URL("../assets/nearby-scene/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browsers = [];
async function person(name, viewport) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  browsers.push(browser);
  const context = await browser.newContext({
    viewport,
    acceptDownloads: true,
    reducedMotion: "reduce",
  });
  await context.addInitScript((name) => {
    localStorage.setItem("bonjou.name", name);
    localStorage.setItem("bonjou.theme", "light");
  }, name);
  const page = await context.newPage();
  await page.goto(`${base}/app`);
  await page.getByText("Connected", { exact: true }).waitFor();
  return page;
}
try {
  const maya = await person("Maya", { width: 1200, height: 750 });
  const sam = await person("Sam", { width: 390, height: 844 });
  await maya.locator(".chip").filter({ hasText: "Sam" }).click();
  await sam.locator(".chip").filter({ hasText: "Maya" }).click();
  await maya.locator("textarea").fill("Same place next Saturday?");
  await maya.locator("textarea").press("Enter");
  await sam.getByText("Same place next Saturday?", { exact: true }).waitFor();
  await sam.locator("textarea").fill("Absolutely. Send me the plan?");
  await sam.locator("textarea").press("Enter");
  await maya
    .getByText("Absolutely. Send me the plan?", { exact: true })
    .waitFor();
  await maya
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles({
      name: "Saturday plans.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Coffee at 10. A walk by the sea.\n"),
    });
  const download = sam.waitForEvent("download");
  await sam
    .getByRole("button", { name: "Approve and download", exact: true })
    .click();
  const received = await download;
  await received.path();
  await maya.getByText("Sent", { exact: true }).waitFor();
  await sam.getByRole("dialog").waitFor({ state: "hidden" });
  await maya.evaluate(() => document.fonts.ready);
  await sam.evaluate(() => document.fonts.ready);
  await maya.screenshot({ path: `${out}laptop-screen.png` });
  await sam.screenshot({ path: `${out}phone-screen.png` });
  console.log(out);
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
}
