/** Chrome UI checks against a running app and coordinator. */
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
const webkitRun = process.env.PLAYWRIGHT_ENGINE === "webkit";
const browserType = webkitRun ? webkit : chromium;

const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const OUTPUT = process.env.UI_SCREENSHOTS ?? join(tmpdir(), "bonjou-ui-check");
const errors = [];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function fits(page, label) {
  await settle(page);
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    size.document <= size.viewport + 1,
    `${label}: horizontal overflow ${JSON.stringify(size)}`,
  );
  for (const dialog of await page.getByRole("dialog").all()) {
    if (!(await dialog.isVisible())) continue;
    const box = await dialog.boundingBox();
    assert(
      box.x >= -1 && box.x + box.width <= size.viewport + 1,
      `${label}: dialog leaves viewport`,
    );
  }
}

async function screenshot(page, name) {
  await settle(page);
  await page.screenshot({ path: join(OUTPUT, `${name}.png`) });
}

async function context(browser, width, theme) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    (value) => localStorage.setItem("bonjou.theme", value),
    theme,
  );
  const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return { ctx, page };
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const browser = await browserType.launch({
    ...(webkitRun
      ? {}
      : { channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" }),
    headless: true,
  });
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        const { ctx, page } = await context(browser, width, theme);
        try {
          await page.goto(`${BASE}/`);
          await page.getByRole("heading", { level: 1 }).waitFor();
          await fits(page, `landing ${theme} ${width}`);
          assert.equal(
            await page
              .getByText("Coordinator offline", { exact: true })
              .count(),
            0,
          );
          if (width <= 760) {
            await page
              .getByRole("button", { name: "Open navigation", exact: true })
              .click();
            await fits(page, `navigation ${theme} ${width}`);
            await page
              .getByRole("dialog")
              .getByRole("link", { name: "For the terminal", exact: true })
              .click();
            await page.getByRole("dialog").waitFor({ state: "hidden" });
          }
          for (const platform of ["macOS", "Linux", "Windows"]) {
            await page
              .getByRole("tab", { name: platform, exact: true })
              .click();
            await fits(page, `install ${platform} ${theme} ${width}`);
          }
          await page
            .getByRole("button", {
              name: "Does the web app need internet?",
              exact: true,
            })
            .click();
          await fits(page, `FAQ ${theme} ${width}`);
          await page.evaluate(() => scrollTo(0, 0));
          if (width === 390 || width === 1440)
            await screenshot(page, `landing-${theme}-${width}`);
          // Check the rendered font, not just the CSS font-family declaration.
          if (width === 1440 && !webkitRun) {
            const cdp = await ctx.newCDPSession(page);
            await cdp.send("DOM.enable");
            await cdp.send("CSS.enable");
            const { root } = await cdp.send("DOM.getDocument");
            const { nodeId } = await cdp.send("DOM.querySelector", {
              nodeId: root.nodeId,
              selector: ".hero-line > span",
            });
            const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
              nodeId,
            });
            assert(
              fonts.some(
                (font) =>
                  font.isCustomFont &&
                  font.postScriptName.startsWith("Satoshi"),
              ),
              "Satoshi did not render",
            );
          }
        } finally {
          await ctx.close();
        }
      }
    }

    for (const theme of ["light", "dark"]) {
      const { ctx, page } = await context(browser, 1440, theme);
      try {
        await page.goto(`${BASE}/app`);
        await page
          .getByRole("heading", { name: "First, say hello." })
          .waitFor();
        assert(
          await page
            .getByRole("button", { name: "Start sharing", exact: true })
            .isDisabled(),
        );
        await screenshot(page, `onboarding-${theme}`);
        for (const slot of [
          "card-header",
          "card-content",
          "card-footer",
          "field",
          "field-label",
        ]) {
          assert.equal(
            await page.locator(`.gate-body [data-slot="${slot}"]`).count(),
            1,
            `onboarding uses shadcn ${slot}`,
          );
        }
        assert.equal(
          await page.locator('.gate-body svg[viewBox="0 0 256 256"]').count(),
          2,
          "onboarding uses Phosphor icons",
        );
        await page.getByLabel("Your display name").fill("UI check");
        await page
          .getByRole("button", { name: "Start sharing", exact: true })
          .click();
        await page
          .getByText("Connected", { exact: true })
          .waitFor({ timeout: 15000 });
        assert.equal(
          await page
            .getByRole("button", { name: "Back to the list" })
            .isVisible(),
          false,
        );
        await screenshot(page, `workspace-${theme}`);
        assert.equal(
          await page.locator('.composer [data-slot="input-group"]').count(),
          0,
          "an empty network has invitation controls instead of a disabled composer",
        );
        assert.equal(
          await page.locator('.thread [data-slot="empty"]').count(),
          1,
          "conversation uses shadcn Empty",
        );

        await page
          .getByRole("button", { name: "Open settings", exact: true })
          .click();
        await fits(page, `settings ${theme}`);
        await page.getByLabel("Name others see").fill("UI check renamed");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page
          .getByRole("switch", { name: "Compact rows", exact: true })
          .click();
        await screenshot(page, `settings-${theme}`);
        await page.keyboard.press("Escape");
        await page.getByText("UI check renamed", { exact: true }).waitFor();

        await page
          .getByRole("button", {
            name: "Open the command palette",
            exact: true,
          })
          .click();
        await page.getByPlaceholder("Type a command or a name").fill("room");
        await screenshot(page, `palette-${theme}`);
        await page
          .getByRole("option", { name: "Open or join a room", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "A room for your group", exact: true })
          .waitFor();
        await page
          .getByRole("tab", { name: "Join a room", exact: true })
          .click();
        assert(
          await page
            .getByRole("button", { name: "Join", exact: true })
            .isDisabled(),
        );
        await page.getByLabel("Room code").fill("ABC-123");
        assert(
          await page
            .getByRole("button", { name: "Join", exact: true })
            .isEnabled(),
        );
        await page
          .getByRole("tab", { name: "Create a room", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Open a room", exact: true })
          .click();
        await page.locator(".room-code code").waitFor();
        await fits(page, `room ${theme}`);
        await screenshot(page, `room-${theme}`);
        await page.keyboard.press("Escape");

        for (const width of [320, 390, 768]) {
          await page.setViewportSize({ width, height: 844 });
          await fits(page, `people ${theme} ${width}`);
          await page.locator(".chip.is-group").first().click();
          assert(
            await page
              .getByRole("button", { name: "Back to the list" })
              .isVisible(),
          );
          await fits(page, `thread ${theme} ${width}`);
          assert.equal(
            await page.locator(".composer").count(),
            0,
            "no recipients means no composer",
          );
          if (width === 390) await screenshot(page, `thread-mobile-${theme}`);
          await page.getByRole("button", { name: "Back to the list" }).click();
          await page
            .getByRole("button", { name: "Open settings", exact: true })
            .click();
          await fits(page, `mobile settings ${theme} ${width}`);
          if (width === 390) await screenshot(page, `settings-mobile-${theme}`);
          await page.keyboard.press("Escape");
          await page.locator(".rail-room-open").click();
          await fits(page, `mobile room ${theme} ${width}`);
          if (width === 390) await screenshot(page, `room-mobile-${theme}`);
          await page.keyboard.press("Escape");
        }
      } finally {
        await ctx.close();
      }
    }
    assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
    console.log(
      `UI passed: light/dark, 320–1440px, real Satoshi font, navigation, onboarding, settings, palette, rooms, mobile navigation. Screenshots: ${OUTPUT}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
