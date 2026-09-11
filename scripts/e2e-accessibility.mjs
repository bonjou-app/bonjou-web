/** WCAG checks on the actual landing, workspace, and library overlays. */
import { strict as assert } from "node:assert";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.APP_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checked = [];
async function check(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    [],
    label,
  );
  checked.push(label);
}
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (theme) => localStorage.setItem("bonjou.theme", theme),
      theme,
    );
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await check(page, `landing ${theme}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await check(page, `mobile landing ${theme}`);
    await page
      .getByRole("button", { name: "Start sharing", exact: true })
      .click();
    await page.getByLabel("Your display name").waitFor();
    await check(page, `onboarding ${theme}`);
    await page.getByLabel("Your display name").fill("Accessibility check");
    await page
      .getByRole("button", { name: "Start sharing", exact: true })
      .click();
    await page.getByText("Connected", { exact: true }).waitFor();
    await page.setViewportSize({ width: 1280, height: 900 });
    await check(page, `workspace ${theme}`);
    for (const [button, label] of [
      ["Open settings", "settings"],
      ["Open the command palette", "palette"],
      ["This session's transfers", "history"],
    ]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await check(page, `${label} ${theme}`);
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await page.locator(".rail-room-open").click();
    await page
      .getByRole("button", { name: "Open a room", exact: true })
      .click();
    await page.locator(".room-code code").waitFor();
    await check(page, `room ${theme}`);
    await context.close();
  }
  console.log(
    `Accessibility passed: ${checked.join(", ")}. No WCAG A/AA violations detected by axe.`,
  );
} finally {
  await browser.close();
}
