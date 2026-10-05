/** Real clients: local staging, explicit metadata offers and approved downloads. */
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { createRtcDiagnostics } from "./rtc-diagnostics.mjs";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const browsers = [];
const errors = [];
const diagnostics = createRtcDiagnostics({
  output: join(process.env.E2E_REPORT_DIR ?? tmpdir(), "staging-chromium"),
  suite: "staging",
});
const directory = await mkdtemp(join(tmpdir(), "bonjou-staging-"));
const pasteKey = process.platform === "darwin" ? "Meta+V" : "Control+V";

async function client(name) {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
  browsers.push(browser);
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 850 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await diagnostics.observeContext(context, `client-${browsers.length}`);
  await context.addInitScript((name) => {
    localStorage.setItem("bonjou.name", name);
    localStorage.setItem("bonjou.theme", "light");
    window.__stagedFileReads = 0;
    for (const method of ["stream", "slice", "arrayBuffer"]) {
      const native = Blob.prototype[method];
      Blob.prototype[method] = function (...args) {
        if (this instanceof File) window.__stagedFileReads += 1;
        return native.apply(this, args);
      };
    }
  }, name);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/app`);
  await page.getByText("Connected", { exact: true }).waitFor();
  return page;
}
async function select(page, name) {
  await page.locator(".chip").filter({ hasText: name }).click();
}
async function contents(download) {
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
}
async function noPayloadRead(page) {
  assert.equal(await page.evaluate(() => window.__stagedFileReads), 0);
}
async function stagedCount(page, count) {
  await page
    .locator(".staging-head [role=status]")
    .filter({
      hasText: new RegExp(`^${count} ${count === 1 ? "file" : "files"} staged`),
    })
    .waitFor();
}
async function accessibleTray(page) {
  const audit = await new AxeBuilder({ page })
    .include(".staging-tray")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(audit.violations, []);
}
async function approve(page, filename) {
  const card = page.locator(".card.is-asking").filter({ hasText: filename });
  await card.waitFor();
  const downloaded = page.waitForEvent("download");
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  return downloaded;
}

try {
  const sender = await client("Staging Alice");
  const retained = {
    name: "keep.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Only explicit offers lead to an approved download."),
  };
  const removed = {
    name: "remove.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("This selection is removed before it is offered."),
  };
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles([retained, removed]);
  await stagedCount(sender, 2);
  assert.equal(
    await sender.getByRole("button", { name: /^Offer files to/ }).isDisabled(),
    true,
  );
  await noPayloadRead(sender);
  await accessibleTray(sender);
  await sender
    .getByRole("button", { name: "Remove remove.txt", exact: true })
    .click();
  await stagedCount(sender, 1);
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
  ]);
  assert.equal(
    await sender
      .getByRole("button", { name: "Remove keep.txt", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
    "removing a row repairs keyboard focus",
  );
  await sender
    .getByRole("button", { name: "Undo file removal", exact: true })
    .click();
  await stagedCount(sender, 2);
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
    "remove.txt",
  ]);
  assert.equal(
    await sender
      .getByRole("button", { name: "Remove remove.txt", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
    "Undo returns focus to the restored row",
  );
  await sender
    .getByRole("button", { name: "Clear files", exact: true })
    .click();
  await sender.locator(".staging-tray").waitFor({ state: "hidden" });
  await sender
    .getByRole("button", { name: "Undo clearing staged files", exact: true })
    .click();
  await stagedCount(sender, 2);
  await noPayloadRead(sender);
  await sender
    .getByRole("button", { name: "Remove remove.txt", exact: true })
    .click();
  await stagedCount(sender, 1);
  // New selection expires the one-action Undo instead of reviving stale handles.
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(removed);
  await stagedCount(sender, 2);
  assert.equal(
    await sender
      .getByRole("button", { name: "Undo file removal", exact: true })
      .count(),
    0,
  );
  await sender
    .getByRole("button", { name: "Remove remove.txt", exact: true })
    .click();
  await stagedCount(sender, 1);
  await noPayloadRead(sender);

  // Native text paste still edits the draft instead of treating text as a file.
  await sender.locator("textarea").fill("Draft:");
  await sender.evaluate(() => navigator.clipboard.writeText(" ordinary paste"));
  await sender.locator("textarea").press(pasteKey);
  assert.equal(
    await sender.locator("textarea").inputValue(),
    "Draft: ordinary paste",
  );
  await sender.locator("textarea").fill("");

  const bob = await client("Staging Bob");
  const charlie = await client("Staging Charlie");
  await select(bob, "Staging Alice");
  await select(charlie, "Staging Alice");
  await sender.locator(".chip").filter({ hasText: "Everyone here" }).click();
  assert.match(
    await sender.locator(".staging-caption").innerText(),
    /2 people:/,
  );
  assert.match(
    await sender.locator(".staging-caption").innerText(),
    /Staging Bob/,
  );
  assert.match(
    await sender.locator(".staging-caption").innerText(),
    /Staging Charlie/,
  );
  for (const [recipient, page] of [
    ["Staging Bob", bob],
    ["Staging Charlie", charlie],
  ]) {
    await select(sender, recipient);
    await sender.locator("textarea").fill(`Connected to ${recipient}`);
    await sender
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .getByText(`Connected to ${recipient}`, { exact: true })
      .waitFor();
    assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
      "keep.txt",
    ]);
    assert.equal(
      await page.locator(".card-name").count(),
      0,
      "choosing a destination must not offer staged files",
    );
  }
  await select(sender, "Staging Bob");
  await sender.getByRole("link", { name: "Bonjou home" }).click();
  await sender
    .getByRole("link", { name: "Start sharing", exact: true })
    .click();
  assert.deepEqual(
    await sender.locator(".staging-name").allTextContents(),
    ["keep.txt"],
    "local stage survives the home round trip",
  );
  await sender.getByRole("button", { name: /Received files/ }).click();
  assert.equal(await sender.locator(".composer").isVisible(), false);
  await select(sender, "Staging Bob");
  assert.deepEqual(
    await sender.locator(".staging-name").allTextContents(),
    ["keep.txt"],
    "local stage survives Received files",
  );

  // A genuine metadata send failure retains the local selection for retry.
  await sender.evaluate(() => {
    window.__nativeStageSend = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (...args) {
      if (this.label === "bonjou-control") {
        RTCDataChannel.prototype.send = window.__nativeStageSend;
        throw new Error("Injected file offer failure.");
      }
      return window.__nativeStageSend.apply(this, args);
    };
  });
  await sender
    .getByRole("button", {
      name: "Offer files to Staging Bob (1 file)",
      exact: true,
    })
    .click();
  await sender
    .getByRole("alert")
    .filter({ hasText: "Unoffered files are still staged." })
    .waitFor();
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
  ]);
  assert.equal(await bob.locator(".card.is-asking").count(), 0);
  await noPayloadRead(sender);

  await sender
    .getByRole("button", {
      name: "Offer files to Staging Bob (1 file)",
      exact: true,
    })
    .click();
  await bob
    .locator(".card.is-asking")
    .getByText("keep.txt", { exact: true })
    .waitFor();
  await sender.locator(".staging-tray").waitFor({ state: "hidden" });
  assert.equal(
    await sender.getByRole("button", { name: /^Undo/ }).count(),
    0,
    "offering expires Undo so it cannot restore offered files",
  );
  assert.equal(await charlie.locator(".card-name").count(), 0);
  assert.equal(await bob.locator('iframe[src^="/dl/"]').count(), 0);
  await noPayloadRead(sender);
  const download = await approve(bob, "keep.txt");
  assert.equal(download.suggestedFilename(), "keep.txt");
  assert.deepEqual(await contents(download), retained.buffer);
  assert((await sender.evaluate(() => window.__stagedFileReads)) > 0);

  // Clearing during an asynchronous directory read invalidates that operation.
  await sender.evaluate(() => {
    window.__stagedFileReads = 0;
  });
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(retained);
  await stagedCount(sender, 1);
  await sender.evaluate(() => {
    const file = new File(["late"], "late.txt", { type: "text/plain" });
    const entry = {
      isFile: true,
      isDirectory: false,
      name: file.name,
      file(resolve) {
        window.__releaseStageDrop = () => resolve(file);
      },
    };
    const transfer = new DataTransfer();
    transfer.items.add(file);
    // Chrome returns fresh DataTransferItem wrappers on every lookup.
    // Inject the delayed entry at the prototype so the drop handler sees it.
    const nativeEntry = DataTransferItem.prototype.webkitGetAsEntry;
    DataTransferItem.prototype.webkitGetAsEntry = function () {
      return this.getAsFile()?.name === file.name
        ? entry
        : nativeEntry.call(this);
    };
    try {
      document.querySelector(".composer-box").dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    } finally {
      DataTransferItem.prototype.webkitGetAsEntry = nativeEntry;
    }
  });
  await sender
    .locator(".staging-head [role=status]")
    .filter({ hasText: "Reading your selection…" })
    .waitFor();
  await sender
    .getByRole("button", { name: "Clear files", exact: true })
    .click();
  await sender
    .getByRole("button", { name: "Undo clearing staged files", exact: true })
    .click();
  await stagedCount(sender, 1);
  await sender.evaluate(async () => {
    window.__releaseStageDrop();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await sender
    .getByText("Staged files restored. Nothing was offered.", { exact: true })
    .waitFor();
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
  ]);
  assert.equal(await bob.getByText("late.txt", { exact: true }).count(), 0);
  await noPayloadRead(sender);
  await sender
    .getByRole("button", { name: "Clear files", exact: true })
    .click();
  await sender.locator(".staging-tray").waitFor({ state: "hidden" });

  // A real clipboard image paste stages a File without touching the text draft.
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaHD4DwADBAHAqetaQwAAAABJRU5ErkJggg==";
  const clipboardBytes = await sender.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([bytes], { type: "image/png" }),
      }),
    ]);
    const image = (await navigator.clipboard.read())[0];
    return Array.from(
      new Uint8Array(await (await image.getType("image/png")).arrayBuffer()),
    );
  }, png);
  await sender.locator("textarea").fill("Keep this text draft");
  await sender.locator("textarea").press(pasteKey);
  await stagedCount(sender, 1);
  assert.equal(
    await sender.locator("textarea").inputValue(),
    "Keep this text draft",
  );
  assert.match(await sender.locator(".staging-detail").innerText(), /^Image ·/);
  const imageName = await sender.locator(".staging-name").innerText();
  await sender
    .getByRole("button", { name: /^Offer files to Staging Bob/ })
    .click();
  const imageDownload = await approve(bob, imageName);
  assert.deepEqual(await contents(imageDownload), Buffer.from(clipboardBytes));

  const folder = join(directory, "weekend");
  await mkdir(join(folder, "notes"), { recursive: true });
  await writeFile(join(folder, "notes", "plan.txt"), "Meet at ten.");
  await writeFile(join(folder, "empty.txt"), "");
  await sender
    .locator(".composer input[webkitdirectory]")
    .setInputFiles(folder);
  await stagedCount(sender, 2);
  assert.equal(await sender.locator(".staging-row").count(), 1);
  assert.match(
    await sender.locator(".staging-detail").innerText(),
    /^Folder · 2 files · ZIP/,
  );
  await sender
    .getByRole("button", { name: "Remove weekend.zip", exact: true })
    .click();
  await sender.locator(".staging-tray").waitFor({ state: "hidden" });
  assert.equal(await bob.getByText("weekend.zip", { exact: true }).count(), 0);
  await sender
    .locator(".composer input[webkitdirectory]")
    .setInputFiles(folder);
  await sender
    .getByRole("button", {
      name: "Offer files to Staging Bob (2 files)",
      exact: true,
    })
    .click();
  const archive = await contents(await approve(bob, "weekend.zip"));
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert(archive.includes(Buffer.from("weekend/notes/plan.txt")));
  assert(archive.includes(Buffer.from("Meet at ten.")));
  assert(archive.includes(Buffer.from("weekend/empty.txt")));

  // A large selection keeps mobile metadata bounded and all names available.
  await sender.locator("textarea").fill("");
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(
      Array.from({ length: 24 }, (_, index) => ({
        name: `${index}-${"handover-".repeat(20)}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(String(index)),
      })),
    );
  await stagedCount(sender, 24);
  await sender.setViewportSize({ width: 390, height: 844 });
  await accessibleTray(sender);
  const layout = await sender.evaluate(() => {
    const scroller = document.querySelector(".staging-scroll");
    return {
      height: scroller.clientHeight,
      scroll: scroller.scrollHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert(layout.height <= 128 && layout.scroll > layout.height);
  assert.equal(layout.overflow, 0);
  // A short window and a long draft must still expose every preparation action.
  await sender.locator("textarea").fill("A longer local draft\n".repeat(12));
  for (const [width, height] of [
    [320, 640],
    [390, 450],
    [640, 450],
  ]) {
    await sender.setViewportSize({ width, height });
    for (const control of [
      sender.getByRole("button", { name: /^Offer files to Staging Bob/ }),
      sender.locator("textarea"),
      sender.getByRole("button", { name: "Send message", exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert(
        box && box.y >= 0 && box.y + box.height <= height + 1,
        `${width}x${height}: preparation action is clipped`,
      );
      const header = await sender.locator(".thread-head").boundingBox();
      const preparation = await sender.locator(".composer-shell").boundingBox();
      assert(
        header &&
          preparation &&
          header.y >= 0 &&
          preparation.y >= header.y + header.height - 1 &&
          preparation.y + preparation.height <= height + 1,
        `${width}x${height}: preparation overlaps the conversation header`,
      );
    }
    const draftHeight = await sender
      .locator("textarea")
      .evaluate((el) => el.getBoundingClientRect().height);
    assert(draftHeight <= Math.min(168, height * 0.22) + 1);
  }
  await accessibleTray(sender);
  await sender
    .getByRole("button", { name: "Clear files", exact: true })
    .click();
  await sender.setViewportSize({ width: 1280, height: 850 });
  await sender.locator("textarea").fill("Private draft for Bob");
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(retained);
  await stagedCount(sender, 1);
  const charlieOffers = await charlie.locator(".card-name").count();
  await bob.context().browser().close();
  await sender
    .getByRole("button", { name: "Choose another recipient", exact: true })
    .waitFor();
  assert.match(
    await sender.locator(".thread-title h2").innerText(),
    /Staging Bob/,
  );
  assert.equal(
    await sender.locator("textarea").inputValue(),
    "Private draft for Bob",
  );
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
  ]);
  assert.equal(
    await sender.getByRole("button", { name: /^Offer files to/ }).isDisabled(),
    true,
  );
  assert.equal(
    await sender
      .getByRole("button", { name: "Send message", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await charlie.locator(".card-name").count(),
    charlieOffers,
    "departing private recipient never offers staged files to Everyone",
  );
  for (const [width, height] of [
    [320, 640],
    [390, 450],
  ]) {
    await sender.setViewportSize({ width, height });
    await sender.locator("textarea").fill("Private draft for Bob\n".repeat(12));
    for (const control of [
      sender.getByRole("button", {
        name: "Choose another recipient",
        exact: true,
      }),
      sender.getByRole("button", { name: /^Offer files to/ }),
      sender.locator("textarea"),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert(
        box && box.y >= 0 && box.y + box.height <= height + 1,
        `${width}x${height}: unavailable recipient recovery action is clipped`,
      );
    }
    assert.equal(
      await sender.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
    await accessibleTray(sender);
  }
  await sender.setViewportSize({ width: 1280, height: 850 });
  await sender
    .getByRole("button", { name: "Choose another recipient", exact: true })
    .click();
  const palette = sender.getByRole("dialog");
  await palette.getByRole("combobox").fill("Staging Charlie");
  await palette
    .getByRole("option")
    .filter({ hasText: "Staging Charlie" })
    .click();
  await palette.waitFor({ state: "hidden" });
  assert.equal(
    await sender
      .getByRole("button", { name: /^Offer files to Staging Charlie/ })
      .isDisabled(),
    false,
  );
  assert.deepEqual(await sender.locator(".staging-name").allTextContents(), [
    "keep.txt",
  ]);
  await sender
    .getByRole("button", { name: /^Offer files to Staging Charlie/ })
    .click();
  const privateDownload = await approve(charlie, "keep.txt");
  assert.deepEqual(await contents(privateDownload), retained.buffer);

  // Broadcasting makes the actual audience recognizable before an offer.
  await sender.locator(".chip").filter({ hasText: "Everyone here" }).click();
  await sender
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(removed);
  await stagedCount(sender, 1);
  assert.match(
    await sender.locator(".staging-caption").innerText(),
    /Staging Charlie/,
  );
  assert.doesNotMatch(
    await sender.locator(".staging-caption").innerText(),
    /Staging Bob/,
  );
  await accessibleTray(sender);
  await sender
    .getByRole("button", { name: "Clear files", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "Staging passed: local remove/clear Undo and focus repair without payload reads, Undo expiry, text/image clipboard paste, private-recipient departure retains draft and staged files without broadcasting, explicit recipient recovery, named broadcast audience, home/Received persistence, failed metadata retention and retry, approval and exact bytes, Undo preserves late-drop invalidation, folders, bounded mobile metadata, short-window actions, and axe.",
  );
} catch (error) {
  await diagnostics.captureFailure(error);
  throw error;
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await rm(directory, { recursive: true, force: true });
}
