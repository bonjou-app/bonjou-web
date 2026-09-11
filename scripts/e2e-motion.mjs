/** Verify real animation playback, user controls, and reduced-motion behavior. */
import { strict as assert } from "node:assert";
import { chromium, webkit } from "playwright";

const base = process.env.APP_URL ?? "http://127.0.0.1:4173";
const engine = process.env.PLAYWRIGHT_ENGINE ?? "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  ...(engine === "webkit" ? {} : { channel: "chrome" }),
});
const errors = [];
const phase = (page, value) =>
  page.waitForFunction(
    (value) => document.querySelector(".hero-scene")?.dataset.phase === value,
    value,
  );
const packetState = (page) =>
  page.locator(".demo-packet").evaluate((element) => {
    const animation = element.getAnimations()[0];
    return {
      transform: getComputedStyle(element).transform,
      time: Number(animation?.currentTime ?? 0),
      state: animation?.playState,
    };
  });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Pause demo", exact: true }).waitFor();
  await phase(page, "offered");
  await phase(page, "accepted");
  await phase(page, "sending");
  const before = await packetState(page);
  await page.waitForTimeout(200);
  const moving = await packetState(page);
  assert.notEqual(
    moving.transform,
    before.transform,
    "the packet must actually move",
  );
  await page.getByRole("button", { name: "Pause demo", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".demo-packet").getAnimations()[0]?.playState ===
      "paused",
  );
  const paused = await packetState(page);
  await page.waitForTimeout(200);
  assert.equal(
    (await packetState(page)).time,
    paused.time,
    "pause must freeze the playhead",
  );
  await page.getByRole("button", { name: "Resume demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Replay demo", exact: true })
    .waitFor();
  await phase(page, "received");
  await page.getByRole("button", { name: "Replay demo", exact: true }).click();
  await phase(page, "offered");
  // Keyboard controls must work and maintain focus through the label changes.
  await page.getByRole("button", { name: "Pause demo", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page
      .getByRole("button", { name: "Resume demo", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  // An offscreen demo must pause rather than consume work below the viewport.
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  await page.waitForFunction(
    () => document.querySelector(".hero-scene").dataset.playback === "paused",
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "Resume demo", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Reset demo", exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".demo-packet")
      .evaluate((e) => e.getAnimations().length),
    0,
    "a preference change cancels in-flight movement",
  );
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await phase(page, "ready");
  await page
    .getByRole("button", { name: "Show demo result", exact: true })
    .click();
  await phase(page, "received");
  assert.equal(
    await page
      .locator(".demo-packet")
      .evaluate((e) => e.getAnimations().length),
    0,
  );

  // Verify Satoshi's headline fits at the smallest supported viewport, without
  // relying on document overflow (the entrance mask could hide clipped text).
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  assert(
    await page
      .locator(".hero-line > span")
      .evaluateAll((elements) =>
        elements.every((e) => e.scrollWidth <= e.clientWidth + 1),
      ),
    "headline clips at 320px",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Show demo result", exact: true })
    .waitFor();
  await phase(page, "ready");
  assert.equal(
    await page
      .locator(".demo-packet")
      .evaluate((e) => e.getAnimations().length),
    0,
    "reduced motion does not autoplay",
  );
  await context.close();

  // Pointer movement adds depth only on a fine pointer and without reduced motion.
  const pointerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  const pointerPage = await pointerContext.newPage();
  await pointerPage.goto(base);
  await pointerPage
    .getByRole("button", { name: "Replay demo", exact: true })
    .waitFor();
  const box = await pointerPage.locator(".scene-perspective").boundingBox();
  await pointerPage.mouse.move(
    box.x + box.width * 0.8,
    box.y + box.height * 0.3,
  );
  assert.notEqual(
    await pointerPage
      .locator(".scene-frame")
      .evaluate((e) => e.style.transform),
    "",
  );
  await pointerPage.mouse.move(5, 5);
  assert.equal(
    await pointerPage
      .locator(".scene-frame")
      .evaluate((e) => e.style.transform),
    "",
  );
  await pointerContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 650 },
    reducedMotion: "no-preference",
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(base);
  await mobile.locator(".hero-scene").waitFor();
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.waitForTimeout(350);
  assert.equal(
    await mobile.locator(".hero-scene").getAttribute("data-playback"),
    "idle",
    "a partly visible mobile scene must wait before autoplay",
  );
  await mobile
    .locator(".hero-scene")
    .evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  await mobile
    .getByRole("button", { name: "Pause demo", exact: true })
    .waitFor();
  await mobileContext.close();
  assert.deepEqual(errors, []);
  console.log(
    `Motion passed (${engine}): real movement, approval sequence, pause/resume/replay, keyboard focus, offscreen pause, live preference change, static alternative, 320px headline, pointer tilt.`,
  );
} finally {
  await browser.close();
}
