/**
 * Populated UI regressions against a running app and coordinator.
 *
 * Separate Chrome processes retain default local-network discovery. The
 * 640x450 CSS viewport checks the reflow available at 200% zoom on a
 * 1280x900 desktop; it does not simulate browser chrome or physical devices.
 * Document visibility and a single failed chat send are explicit fault
 * injections. All other messages, offers, and downloads use real WebRTC.
 */
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createRtcDiagnostics } from "./rtc-diagnostics.mjs";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const OUTPUT =
  process.env.POLISH_SCREENSHOTS ?? join(tmpdir(), "bonjou-polish");
const browsers = [];
const errors = [];
const checked = [];
const diagnostics = createRtcDiagnostics({ output: OUTPUT, suite: "polish" });

async function client(name, theme) {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
  browsers.push(browser);
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  await diagnostics.observeContext(
    context,
    `${theme}-client-${browsers.length}`,
  );
  await context.addInitScript(
    ({ name, theme, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem("bonjou.name", name);
      localStorage.setItem("bonjou.theme", theme);
    },
    { name, theme, origin: new URL(BASE).origin },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${BASE}/app`);
  await page.getByText("Connected", { exact: true }).waitFor();
  return page;
}

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

function peer(page, name) {
  return page.locator(".chip").filter({ hasText: name });
}

async function select(page, name) {
  await peer(page, name).click();
  await page.locator(".thread-title h2").filter({ hasText: name }).waitFor();
}

async function send(page, text) {
  const draft = page.locator(".composer textarea");
  await draft.fill(text);
  await draft.press("Enter");
  await page.locator(".bubble").getByText(text, { exact: true }).waitFor();
}

async function unread(page, name, count) {
  // This must work while the workspace is hidden by the marketing page too.
  await page.waitForFunction(
    ({ name, count }) => {
      const chip = [...document.querySelectorAll(".workspace .chip")].find(
        (element) => element.querySelector(".chip-name")?.textContent === name,
      );
      const badge = chip?.querySelector(".is-unread");
      return count === 0
        ? !badge
        : badge?.getAttribute("aria-label") === `${count} new`;
    },
    { name, count },
  );
}

async function fits(page, label, { composer = true } = {}) {
  await settle(page);
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `${label}: horizontal overflow ${JSON.stringify(dimensions)}`,
  );
  for (const dialog of await page.getByRole("dialog").all()) {
    if (!(await dialog.isVisible())) continue;
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert(
      box &&
        box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      `${label}: dialog leaves the viewport`,
    );
    const details = dialog.locator(".offer-details");
    if (await details.count()) {
      const size = await details.evaluate((element) => ({
        content: element.scrollWidth,
        available: element.clientWidth,
      }));
      assert(
        size.content <= size.available + 1,
        `${label}: offer details overflow horizontally ${JSON.stringify(size)}`,
      );
      const footer = dialog.locator(".offer-actions");
      for (const action of await footer.getByRole("button").all()) {
        const actionBox = await action.boundingBox();
        assert(
          actionBox &&
            actionBox.x >= box.x - 1 &&
            actionBox.y >= box.y - 1 &&
            actionBox.x + actionBox.width <= box.x + box.width + 1 &&
            actionBox.y + actionBox.height <= box.y + box.height + 1,
          `${label}: approval action is clipped inside the drawer`,
        );
        assert(
          actionBox.width >= 43 && actionBox.height >= 43,
          `${label}: approval action is smaller than 44px`,
        );
      }
    }
  }
  if (composer) {
    const box = await page.locator(".composer").boundingBox();
    const viewport = page.viewportSize();
    assert(
      box &&
        box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      `${label}: populated composer is clipped`,
    );
    const sendBox = await page
      .getByRole("button", { name: "Send message", exact: true })
      .boundingBox();
    assert(
      sendBox && sendBox.width >= 43 && sendBox.height >= 43,
      `${label}: send control is smaller than 44px`,
    );
  }
}

async function accessible(page, label) {
  await settle(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
    [],
    label,
  );
  checked.push(label);
}

async function touchControl(control, label) {
  const box = await control.boundingBox();
  assert(
    box && box.width >= 43.5 && box.height >= 43.5,
    `${label}: control is smaller than 44px ${JSON.stringify(box)}`,
  );
}

async function dialogControls(dialog, label) {
  if (label === "Open settings") {
    await touchControl(dialog.getByLabel("Name others see"), "Settings name");
    await touchControl(
      dialog.getByRole("button", { name: "Save", exact: true }),
      "Settings Save",
    );
  }
  if (label === "Verify security fingerprint") {
    for (const name of ["Not now", "They match"])
      await touchControl(
        dialog.getByRole("button", { name, exact: true }),
        `Verify ${name}`,
      );
  }
  if (label === "Room dialog") {
    for (const tab of await dialog.getByRole("tab").all())
      await touchControl(tab, `Room ${await tab.textContent()}`);
    // The populated room state belongs to room workflows. Check its copy
    // controls if present without creating a room or changing this scope.
    for (const name of ["Copy code", "Copy link"]) {
      const copy = dialog.getByRole("button", { name, exact: true });
      if (await copy.count()) await touchControl(copy, `Room ${name}`);
    }
  }
}

async function focusRoundTrip(page, label, selector) {
  const trigger = selector
    ? page.locator(selector)
    : page.getByRole("button", { name: label, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForFunction(() =>
    document.activeElement?.closest('[role="dialog"]'),
  );
  await settle(page);
  await dialogControls(dialog, label);
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    assert(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      `${label}: keyboard focus escaped the dialog`,
    );
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    ({ label, selector }) =>
      selector
        ? document.activeElement?.matches(selector)
        : document.activeElement?.getAttribute("aria-label") === label,
    { label, selector },
    { timeout: 5000 },
  );
}

async function roomInputRecovery(page, theme) {
  const trigger = page.locator(".rail-room-open");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("tab", { name: "Join a room", exact: true }).click();
  const input = dialog.getByRole("textbox", { name: "Room code", exact: true });
  const malformed = "@@@-@@@";
  await input.fill(malformed);
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  const error = dialog.getByRole("alert");
  await error.getByText(/That room was not found/).waitFor();
  assert.equal(await input.inputValue(), malformed, "room error lost input");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  const descriptions = await input.evaluate((element) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => ({ id, text: document.getElementById(id)?.textContent })),
  );
  const errorId = await error.getAttribute("id");
  assert(
    errorId && descriptions.some(({ id, text }) => id === errorId && text),
    "room error is not associated with the input",
  );
  assert(
    descriptions.some(({ text }) => /six letters or numbers/i.test(text ?? "")),
    "room input has no associated format hint",
  );
  assert.equal(
    await dialog.getByRole("button", { name: "Join", exact: true }).isEnabled(),
    true,
    "room error left retry disabled",
  );
  for (const [width, height] of [
    [320, 744],
    [640, 450],
  ]) {
    await page.setViewportSize({ width, height });
    await fits(page, `${theme} room error ${width}px`, { composer: false });
    await dialogControls(dialog, "Room dialog");
    await touchControl(input, "Room code input");
    await touchControl(
      dialog.getByRole("button", { name: "Join", exact: true }),
      "Room Join",
    );
    await input.focus();
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press("Tab");
      assert(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
        `room error ${width}px: keyboard focus escaped the dialog`,
      );
    }
    await accessible(page, `${theme} associated room error ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.matches(".rail-room-open"),
    undefined,
    { timeout: 5000 },
  );
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function checkTheme(theme) {
  const aliceName = `${theme}-Alicia-${"W".repeat(44)}`;
  const bobName = `${theme}-Bastien-${"M".repeat(43)}`;
  const alice = await client(aliceName, theme);
  const bob = await client(bobName, theme);
  await peer(alice, bobName).waitFor({ timeout: 20000 });
  await peer(bob, aliceName).waitFor({ timeout: 20000 });
  await select(alice, bobName);
  await select(bob, aliceName);

  const longMessage = `${theme}: a deliberately long message\n${"W".repeat(3000)}\n${"A line that stays readable when the conversation is narrow. ".repeat(20)}`;
  await send(alice, longMessage);
  await bob
    .locator(".bubble")
    .getByText(longMessage, { exact: true })
    .waitFor();
  for (const [width, height, label] of [
    [1440, 900, "desktop"],
    [390, 844, "390px"],
    [320, 744, "320px"],
    [640, 450, "200% desktop reflow equivalent"],
  ]) {
    await bob.setViewportSize({ width, height });
    await fits(bob, `${theme} ${label}`);
    await accessible(bob, `${theme} populated thread ${label}`);
    await bob.screenshot({
      path: join(OUTPUT, `thread-${theme}-${width}.png`),
    });
  }

  await bob.setViewportSize({ width: 1440, height: 900 });
  for (const label of [
    "Open settings",
    "Verify security fingerprint",
    "This session's transfers",
    "Open the command palette",
  ])
    await focusRoundTrip(bob, label);
  await focusRoundTrip(bob, "Room dialog", ".rail-room-open");
  await roomInputRecovery(bob, theme);

  // Closing a surface opened from the palette must not restore focus to
  // the palette's unmounted option or leave focus on the document body.
  await bob
    .getByRole("button", { name: "Open the command palette", exact: true })
    .focus();
  await bob.keyboard.press("Enter");
  await bob.getByPlaceholder("Type a command or a name").fill("Open settings");
  await bob
    .getByRole("option", { name: "Open settings", exact: true })
    .waitFor();
  await bob.keyboard.press("Enter");
  await bob.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await bob.waitForFunction(() =>
    document.activeElement?.closest('[role="dialog"]'),
  );
  await bob.keyboard.press("Escape");
  await bob.getByRole("dialog").waitFor({ state: "hidden" });
  await bob.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Open the command palette",
    undefined,
    { timeout: 5000 },
  );

  const filename = `${theme}-${"quarterly-notes-".repeat(11)}final.txt`;
  const payload = Buffer.from(
    "A deferred offer stays on the sender until approval.\n".repeat(1024),
  );
  let downloads = 0;
  bob.on("download", () => downloads++);
  await alice.locator(".composer input[type=file]").first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: payload,
  });
  await alice.getByRole("button", { name: /^Offer files to / }).click();
  await bob
    .locator(".card-name")
    .getByText(filename, { exact: true })
    .waitFor();
  await accessible(bob, `${theme} desktop pending offer`);
  await fits(bob, `${theme} desktop pending offer`);
  assert.equal(
    downloads,
    0,
    "desktop offer started a download before approval",
  );
  await bob.setViewportSize({ width: 320, height: 744 });
  const drawer = bob.getByRole("dialog");
  await drawer.getByText(filename, { exact: true }).waitFor();
  await fits(bob, `${theme} 320px approval`, { composer: false });
  await accessible(bob, `${theme} 320px approval`);
  await bob.screenshot({ path: join(OUTPUT, `approval-${theme}-320.png`) });
  assert.equal(downloads, 0, "mobile offer started a download before approval");
  await drawer
    .getByRole("button", { name: "Decide later", exact: true })
    .click();
  await drawer.waitFor({ state: "hidden" });
  await bob
    .getByRole("button", { name: "Back to the list", exact: true })
    .click();
  const review = bob.getByRole("button", { name: /^Review 1 pending file/ });
  await review.waitFor();
  await fits(bob, `${theme} deferred offer on people list`, {
    composer: false,
  });
  assert.equal(downloads, 0, "deferring the offer started a download");
  await review.click();
  await drawer.getByText(filename, { exact: true }).waitFor();
  await fits(bob, `${theme} reopened approval`, { composer: false });
  const downloaded = bob.waitForEvent("download");
  await drawer
    .getByRole("button", { name: "Approve and download", exact: true })
    .click();
  const download = await downloaded;
  assert.equal(
    download.suggestedFilename(),
    filename,
    "long safe filename lost its extension or was truncated",
  );
  assert.deepEqual(await readDownload(download), payload);
  await drawer.waitFor({ state: "hidden" });
  assert.equal(downloads, 1, "one approved offer must create one download");
  await alice.getByText("Sent", { exact: true }).waitFor();

  // Several offers can wait without blocking navigation or starting a
  // download. Review proceeds in order and each decision affects one offer.
  const firstPending = `${theme}-first-pending.txt`;
  const secondPending = `${theme}-second-pending.txt`;
  const secondBytes = Buffer.from(
    "Only the second offer is approved.\n".repeat(256),
  );
  await alice
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles({
      name: firstPending,
      mimeType: "text/plain",
      buffer: Buffer.from("This offer is declined."),
    });
  await alice.getByRole("button", { name: /^Offer files to / }).click();
  await drawer.getByText(firstPending, { exact: true }).waitFor();
  await alice.locator(".composer input[type=file]").first().setInputFiles({
    name: secondPending,
    mimeType: "text/plain",
    buffer: secondBytes,
  });
  await alice.getByRole("button", { name: /^Offer files to / }).click();
  await bob
    .locator(".card-name")
    .getByText(secondPending, { exact: true })
    .waitFor({ state: "attached" });
  await bob.waitForFunction(
    () =>
      document.querySelector(".pending-review button")?.textContent ===
      "Review 2 pending files",
  );
  await drawer
    .getByRole("button", { name: "Decide later", exact: true })
    .click();
  await drawer.waitFor({ state: "hidden" });
  const reviewTwo = bob.getByRole("button", {
    name: "Review 2 pending files",
    exact: true,
  });
  await reviewTwo.waitFor();
  await bob.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector(".pending-review button"),
  );
  assert.equal(downloads, 1, "deferring two offers created a download");
  await reviewTwo.click();
  await drawer.getByText(firstPending, { exact: true }).waitFor();
  await fits(bob, `${theme} multiple-offer review`, { composer: false });
  await drawer.getByRole("button", { name: "Decline", exact: true }).click();
  await drawer.getByText(secondPending, { exact: true }).waitFor();
  await bob.waitForFunction(
    () =>
      document.querySelector(".pending-review button")?.textContent ===
      "Review 1 pending file",
  );
  assert.equal(downloads, 1, "declining one of two offers created a download");
  const secondDownloaded = bob.waitForEvent("download");
  await drawer
    .getByRole("button", { name: "Approve and download", exact: true })
    .click();
  const secondDownload = await secondDownloaded;
  assert.equal(secondDownload.suggestedFilename(), secondPending);
  assert.deepEqual(await readDownload(secondDownload), secondBytes);
  await drawer.waitFor({ state: "hidden" });
  await bob.locator(".pending-review").waitFor({ state: "detached" });
  await bob.waitForFunction(() => {
    const active = document.activeElement;
    return (
      active instanceof HTMLElement &&
      active !== document.body &&
      document.querySelector(".workspace")?.contains(active) &&
      active.getClientRects().length > 0 &&
      !active.closest('[role="dialog"]')
    );
  });
  assert.equal(
    downloads,
    2,
    "two decisions must produce only the one approved download",
  );
  await alice
    .locator(".card")
    .filter({ hasText: secondPending })
    .getByText("Sent", { exact: true })
    .waitFor();
  await bob
    .locator(".chip.is-group")
    .filter({ hasText: "Everyone here" })
    .click();
  await unread(bob, aliceName, 0);
  await bob
    .getByRole("button", { name: "Back to the list", exact: true })
    .click();

  // Mobile list and a marketing round-trip must not clear a conversation
  // nobody is reading. Reading Everyone clears its constituent peer counts.
  await unread(bob, aliceName, 0);
  await send(alice, `${theme}: unread while the people list is open`);
  await unread(bob, aliceName, 1);
  await bob.getByRole("link", { name: "Bonjou home", exact: true }).click();
  await bob.getByRole("heading", { level: 1 }).waitFor();
  await send(alice, `${theme}: unread while the marketing page is open`);
  await unread(bob, aliceName, 2);
  await bob.getByRole("button", { name: "Start sharing", exact: true }).click();
  await peer(bob, aliceName).waitFor();
  await unread(bob, aliceName, 2);
  await bob
    .locator(".chip.is-group")
    .filter({ hasText: "Everyone here" })
    .click();
  await unread(bob, aliceName, 0);
  const visibleMessage = `${theme}: a visible conversation is read`;
  await send(alice, visibleMessage);
  await bob
    .locator(".bubble")
    .getByText(visibleMessage, { exact: true })
    .waitFor();
  await settle(bob);
  assert.equal(
    await peer(bob, aliceName).locator(".is-unread").count(),
    0,
    "visible Everyone view left a constituent peer unread",
  );

  // Headless background focus varies by host. Inject the observable
  // visibility property and event, while allowing the real connection to run.
  await bob.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await send(alice, `${theme}: unread while document visibility is hidden`);
  await unread(bob, aliceName, 1);
  await bob.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await unread(bob, aliceName, 0);

  // Force exactly one outgoing chat control message to fail. The live peer
  // stays connected so the failure exercises Composer's recovery path.
  const failedDraft = `${theme}: keep this draft after a failed delivery`;
  await alice.evaluate((message) => {
    const original = RTCDataChannel.prototype.send;
    window.__bonjouRestoreChatSend = () => {
      RTCDataChannel.prototype.send = original;
    };
    window.__bonjouChatFaults = 0;
    RTCDataChannel.prototype.send = function (data) {
      let parsed;
      if (typeof data === "string") {
        try {
          parsed = JSON.parse(data);
        } catch {
          /* Binary payload or opaque data. */
        }
      }
      if (parsed?.t === "envelope" && parsed.envelope?.message === message) {
        window.__bonjouChatFaults++;
        throw new Error("Injected chat delivery failure");
      }
      return original.call(this, data);
    };
  }, failedDraft);
  await alice.locator(".composer textarea").fill(failedDraft);
  await alice
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await alice
    .getByText("That message could not be sent. Your draft is still here.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await alice.locator(".composer textarea").inputValue(),
    failedDraft,
  );
  assert.equal(await alice.evaluate(() => window.__bonjouChatFaults), 1);
  assert.equal(
    await bob
      .locator(".bubble")
      .getByText(failedDraft, { exact: true })
      .count(),
    0,
  );
  await select(alice, "Everyone here");
  assert.equal(
    await alice.locator("#composer-error").count(),
    0,
    "private chat failure must not appear beneath another conversation's draft",
  );
  await select(alice, bobName);
  assert.equal(
    await alice.locator(".composer textarea").inputValue(),
    failedDraft,
  );
  await alice
    .getByText("That message could not be sent. Your draft is still here.", {
      exact: true,
    })
    .waitFor();
  await alice.evaluate(() => window.__bonjouRestoreChatSend());
  await alice
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await bob
    .locator(".bubble")
    .getByText(failedDraft, { exact: true })
    .waitFor();
  await alice.waitForFunction(
    () => document.querySelector(".composer textarea")?.value === "",
  );
  assert.equal(
    await alice
      .locator(".bubble")
      .getByText(failedDraft, { exact: true })
      .count(),
    1,
  );
  assert.equal(
    await bob
      .locator(".bubble")
      .getByText(failedDraft, { exact: true })
      .count(),
    1,
  );
}

try {
  await mkdir(OUTPUT, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const firstBrowser = browsers.length;
    try {
      await checkTheme(theme);
    } catch (error) {
      await diagnostics.captureFailure(error);
      throw error;
    } finally {
      await Promise.all(
        browsers.slice(firstBrowser).map((browser) => browser.close()),
      );
    }
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
  console.log(
    `Polish passed: populated light/dark 320/390/1440px and 200% desktop reflow equivalent, long names/messages/filenames, ${checked.length} axe scans, keyboard focus traps and returns including rooms, associated room errors/format hints/retained input, 44px room/Verify/name controls, offer-details/footer bounds, deferred and multiple approvals/navigation/exact downloads, unread visibility, injected failed-chat draft recovery. Screenshots: ${OUTPUT}`,
  );
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
}
