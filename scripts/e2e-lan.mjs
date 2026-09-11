/** Real-browser LAN-only chat, room isolation, approval, and file smoke test. */

import { strict as assert } from "node:assert";

import { chromium, webkit } from "playwright";
const webkitRun = process.env.PLAYWRIGHT_ENGINE === "webkit";
const browserType = webkitRun ? webkit : chromium;

const APP = new URL("/app", process.env.APP_URL ?? "http://127.0.0.1:4173")
  .href;
const BROWSER_CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

async function contextFor(browser, name) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript((value) => {
    localStorage.setItem("bonjou.name", value);
  }, name);
  const page = await context.newPage();
  const errors = [];
  const payloadRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (/\/t\//.test(new URL(request.url()).pathname)) {
      payloadRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto(APP, { waitUntil: "networkidle" });
  await page
    .getByText("Connected", { exact: true })
    .waitFor({ timeout: 15_000 });
  return { context, page, errors, payloadRequests };
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function openRoom(page) {
  await page.locator(".rail-room-open").click();
  await page.getByRole("button", { name: "Open a room", exact: true }).click();
  const code = page.locator(".room-code code");
  await code.waitFor();
  const value = (await code.textContent()).trim();
  await page.keyboard.press("Escape");
  return value;
}

async function joinRoom(page, code) {
  await page.locator(".rail-room-open").click();
  await page.getByRole("tab", { name: "Join a room", exact: true }).click();
  await page.getByLabel("Room code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page
    .locator(".room-code code")
    .filter({ hasText: code })
    .waitFor({ timeout: 15_000 });
  await page.keyboard.press("Escape");
}

async function main() {
  const browsers = [];
  async function launch() {
    const browser = await browserType.launch({
      headless: true,
      ...(!webkitRun && BROWSER_CHANNEL ? { channel: BROWSER_CHANNEL } : {}),
    });
    browsers.push(browser);
    return browser;
  }
  const browser = await launch();
  const clients = [];
  try {
    const alice = await contextFor(browser, "Alice");
    const bob = await contextFor(await launch(), "Bob");
    clients.push(alice, bob);

    await alice.page
      .getByText("Bob", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });
    await bob.page
      .getByText("Alice", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });

    const aliceComposer = alice.page.locator(".composer textarea");
    assert.equal(
      await alice.page
        .locator(".composer-box")
        .evaluate((node) => getComputedStyle(node).opacity),
      "1",
      "an empty draft should not visually disable a connected composer",
    );
    await aliceComposer.fill("hello from alice");
    await aliceComposer.press("Enter");
    await bob.page.getByText("hello from alice", { exact: true }).waitFor();

    const roomCode = await openRoom(alice.page);
    await joinRoom(bob.page, roomCode);
    await alice.page
      .getByText("Bob", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });
    await bob.page
      .getByText("Alice", { exact: true })
      .first()
      .waitFor({ timeout: 20_000 });

    const charlie = await contextFor(await launch(), "Charlie");
    clients.push(charlie);
    await charlie.page.waitForTimeout(2500);
    assert.equal(
      await charlie.page.getByText("Alice", { exact: true }).count(),
      0,
      "open-lobby user saw a room member",
    );
    assert.equal(
      await charlie.page.getByText("Bob", { exact: true }).count(),
      0,
      "open-lobby user saw a room member",
    );

    await aliceComposer.fill("room-only message");
    await aliceComposer.press("Enter");
    await bob.page.getByText("room-only message", { exact: true }).waitFor();
    assert.equal(
      await charlie.page
        .getByText("room-only message", { exact: true })
        .count(),
      0,
      "room message reached the open lobby",
    );

    const fileBytes = Buffer.from("Bonjou direct file payload\n".repeat(4096));
    await alice.page
      .locator(".composer input[type=file]")
      .first()
      .setInputFiles({
        name: "direct-proof.txt",
        mimeType: "text/plain",
        buffer: fileBytes,
      });
    await bob.page.getByText("direct-proof.txt", { exact: true }).waitFor();
    await bob.page.screenshot({
      path: "/tmp/bonjou-file-approval-desktop.png",
    });
    const downloadPromise = bob.page.waitForEvent("download", {
      timeout: 30_000,
    });
    await bob.page
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "direct-proof.txt");
    assert.deepEqual(await readDownload(download), fileBytes);
    await alice.page
      .getByText("Sent", { exact: true })
      .waitFor({ timeout: 30_000 });

    // Check the real mobile approval Drawer as well as the inline card.
    await bob.page.setViewportSize({ width: 390, height: 844 });
    let mobileDownloads = 0;
    bob.page.on("download", () => {
      mobileDownloads += 1;
    });
    await alice.page
      .locator(".composer input[type=file]")
      .first()
      .setInputFiles({
        name: "mobile-proof.txt",
        mimeType: "text/plain",
        buffer: fileBytes,
      });
    const drawer = bob.page.getByRole("dialog");
    await drawer.getByText("mobile-proof.txt", { exact: true }).waitFor();
    await bob.page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const drawerBox = await drawer.boundingBox();
    assert(
      drawerBox.x >= 0 && drawerBox.x + drawerBox.width <= 391,
      "mobile approval leaves the viewport",
    );
    assert(
      drawerBox.y >= 0 && drawerBox.y + drawerBox.height <= 845,
      "mobile approval is clipped vertically",
    );
    assert.equal(mobileDownloads, 0, "download started before approval");
    await bob.page.screenshot({ path: "/tmp/bonjou-file-approval-mobile.png" });
    const mobileDownloadPromise = bob.page.waitForEvent("download");
    await drawer
      .getByRole("button", { name: "Approve and download", exact: true })
      .click();
    assert.deepEqual(
      await readDownload(await mobileDownloadPromise),
      fileBytes,
    );
    await drawer.waitFor({ state: "hidden" });

    // A declined offer must dismiss the Drawer without creating a download.
    await alice.page
      .locator(".composer input[type=file]")
      .first()
      .setInputFiles({
        name: "decline-proof.txt",
        mimeType: "text/plain",
        buffer: fileBytes,
      });
    await drawer.getByText("decline-proof.txt", { exact: true }).waitFor();
    await drawer.getByRole("button", { name: "Decline", exact: true }).click();
    await drawer.waitFor({ state: "hidden" });
    await alice.page
      .getByText("Declined, nothing was sent", { exact: true })
      .waitFor();
    assert.equal(mobileDownloads, 1, "declined offer created a download");

    await alice.page.screenshot({
      path: "/tmp/bonjou-lan-e2e.png",
      fullPage: true,
    });
    for (const client of clients) {
      assert.deepEqual(
        client.payloadRequests,
        [],
        "browser used an HTTP payload route",
      );
      assert.deepEqual(
        client.errors,
        [],
        `browser errors: ${client.errors.join(" | ")}`,
      );
    }

    console.log(
      `LAN E2E passed: discovery, chat, room ${roomCode}, isolation, desktop/mobile approval, decline, exact bytes`,
    );
  } finally {
    for (const client of clients) await client.context.close();
    await Promise.all(browsers.map((browser) => browser.close()));
  }
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exit(1);
});
