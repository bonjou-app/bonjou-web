/**
 * Mixed Chromium/WebKit clients against an explicitly selected local preview.
 * Native discovery, signaling, approval, encrypted transfer, and downloads run
 * without ICE/mDNS overrides. File-read counters only observe native methods.
 * The final Chromium process closure is the sole deliberate departure fault.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { chromium, webkit } from "playwright";

assert(
  process.env.APP_URL,
  "Set APP_URL to the preview's bare HTTP(S) origin.",
);
const appUrl = new URL(process.env.APP_URL);
assert(
  ["http:", "https:"].includes(appUrl.protocol) &&
    appUrl.pathname === "/" &&
    !appUrl.search &&
    !appUrl.hash &&
    !appUrl.username &&
    !appUrl.password,
  "APP_URL must be a bare HTTP(S) origin, without /app or credentials.",
);
const BASE = appUrl.origin;
const TIMEOUT = 35_000;
const browsers = [];
const clients = [];
const errors = [];
let phase = "launch";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture(name, length, seed) {
  const buffer = Buffer.alloc(length);
  for (let index = 0; index < length; index++)
    buffer[index] = (index * 37 + seed) % 251;
  return { name, mimeType: "application/octet-stream", buffer };
}

async function client(engine, name) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium"
      ? { channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" }
      : {}),
  });
  browsers.push(browser);
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 850 },
  });
  await context.addInitScript((name) => {
    localStorage.setItem("bonjou.name", name);
    localStorage.setItem("bonjou.theme", "light");
    window.__crossBrowserFileReads = 0;
    for (const method of ["stream", "slice", "arrayBuffer", "text"]) {
      const native = Blob.prototype[method];
      if (typeof native !== "function") continue;
      Blob.prototype[method] = function (...args) {
        if (this instanceof File) window.__crossBrowserFileReads += 1;
        return native.apply(this, args);
      };
    }
    for (const method of [
      "readAsArrayBuffer",
      "readAsText",
      "readAsDataURL",
      "readAsBinaryString",
    ]) {
      const native = FileReader.prototype[method];
      if (typeof native !== "function") continue;
      FileReader.prototype[method] = function (file, ...args) {
        if (file instanceof File) window.__crossBrowserFileReads += 1;
        return native.call(this, file, ...args);
      };
    }
  }, name);
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const record = {
    engine,
    name,
    browser,
    page,
    downloads: [],
    frames: [],
    httpWrites: [],
  };
  clients.push(record);
  page.on("pageerror", (error) => errors.push(`${engine}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${engine}: ${message.text()}`);
  });
  page.on("download", (download) => record.downloads.push(download));
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      record.httpWrites.push(`${request.method()} ${request.url()}`);
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      try {
        record.frames.push(JSON.parse(String(payload)));
      } catch {
        errors.push(`${engine}: non-JSON coordinator frame`);
      }
    });
  });
  await page.goto(`${BASE}/app`);
  const capabilities = await page.evaluate(() => ({
    secureContext: isSecureContext,
    webRTC: typeof RTCPeerConnection === "function",
    webSocket: typeof WebSocket === "function",
    cryptography: Boolean(globalThis.crypto?.subtle),
    streamingDownload: "serviceWorker" in navigator,
    fileStream: typeof File.prototype.stream === "function",
  }));
  assert.deepEqual(
    Object.entries(capabilities)
      .filter(([, available]) => !available)
      .map(([feature]) => feature),
    [],
    `${engine}: required browser APIs unavailable`,
  );
  await page.getByText("Connected", { exact: true }).waitFor();
  return record;
}

function peer(page, name) {
  return page.locator(".chip:not(.is-group)").filter({ hasText: name });
}

function card(page, name) {
  return page.locator(".card").filter({ hasText: name });
}

async function select(client, recipient) {
  await peer(client.page, recipient.name).click();
  await client.page
    .locator(".thread-title h2")
    .filter({ hasText: recipient.name })
    .waitFor();
  assert.equal(
    await client.page.locator(".thread-title h2").innerText(),
    recipient.name,
    `${client.engine}: wrong private recipient selected`,
  );
}

async function sendMessage(sender, receiver, message) {
  await sender.page.locator(".composer textarea").fill(message);
  await sender.page
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await receiver.page
    .locator(".bubble")
    .getByText(message, { exact: true })
    .waitFor();
  await sender.page.waitForFunction(
    () => document.querySelector(".composer textarea")?.value === "",
  );
}

async function fileReads(client) {
  return client.page.evaluate(() => window.__crossBrowserFileReads);
}

async function resetReads(client) {
  await client.page.evaluate(() => {
    window.__crossBrowserFileReads = 0;
  });
}

async function downloadFrames(client) {
  return client.page
    .locator('iframe[src^="/dl/"]')
    .evaluateAll((frames) => frames.map((frame) => frame.getAttribute("src")));
}

async function offer(sender, receiver, file) {
  await resetReads(sender);
  const downloads = receiver.downloads.length;
  const previousFrames = new Set(await downloadFrames(receiver));
  await sender.page
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(file);
  await sender.page
    .locator(".staging-name")
    .filter({ hasText: file.name })
    .waitFor();
  assert.equal(
    await fileReads(sender),
    0,
    `${sender.engine}: staging read file bytes`,
  );
  assert.equal(
    await card(receiver.page, file.name).count(),
    0,
    `${sender.engine}: selection offered metadata without explicit Offer`,
  );
  assert.match(
    await sender.page.locator(".staging-caption").innerText(),
    new RegExp(receiver.name),
    `${sender.engine}: offer audience is not visible`,
  );
  await sender.page.getByRole("button", { name: /^Offer files to / }).click();
  await card(receiver.page, file.name)
    .and(receiver.page.locator(".is-asking"))
    .waitFor();
  await card(sender.page, file.name)
    .getByText("Waiting for approval", { exact: true })
    .waitFor();
  // A brief observation window catches eager asynchronous reads/downloads;
  // approval has not been invoked, and native transport keeps running.
  await receiver.page.waitForTimeout(200);
  assert.equal(
    await fileReads(sender),
    0,
    `${sender.engine}: offer read bytes before approval`,
  );
  assert.equal(
    receiver.downloads.length,
    downloads,
    `${receiver.engine}: download before approval`,
  );
  assert(
    (await downloadFrames(receiver)).every((src) => previousFrames.has(src)),
    `${receiver.engine}: download helper opened before approval`,
  );
  return downloads;
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  assert(stream, `Download failed: ${await download.failure()}`);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function approvedTransfer(sender, receiver, file) {
  const before = await offer(sender, receiver, file);
  const pendingDownload = receiver.page.waitForEvent("download", {
    predicate: (download) => download.suggestedFilename() === file.name,
  });
  await card(receiver.page, file.name)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  const download = await pendingDownload;
  const actual = await readDownload(download);
  assert.equal(
    await download.failure(),
    null,
    `${receiver.engine}: approved download failed`,
  );
  assert.equal(download.suggestedFilename(), file.name);
  assert.equal(
    actual.length,
    file.buffer.length,
    "Received size differs from source fixture",
  );
  // Both hashes are computed outside the application from independent source
  // fixture and actual browser-download bytes; no UI checksum is trusted.
  assert.equal(
    sha256(actual),
    sha256(file.buffer),
    "Independent SHA-256 mismatch",
  );
  assert.deepEqual(
    actual,
    file.buffer,
    `${sender.engine} to ${receiver.engine}: bytes differ`,
  );
  await card(sender.page, file.name)
    .getByText("Sent", { exact: true })
    .waitFor();
  await card(receiver.page, file.name)
    .getByText("Transfer complete. Check your downloads.", { exact: true })
    .waitFor();
  assert.equal(
    receiver.downloads.length,
    before + 1,
    "Approval did not produce exactly one download",
  );
  assert(
    (await fileReads(sender)) > 0,
    "Approved transfer did not exercise native source reads",
  );
}

async function decline(sender, receiver, file) {
  const before = await offer(sender, receiver, file);
  await card(receiver.page, file.name)
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await card(sender.page, file.name)
    .getByText("Declined, nothing was sent", { exact: true })
    .waitFor();
  await card(receiver.page, file.name)
    .getByText("Declined, nothing was sent", { exact: true })
    .waitFor();
  assert.equal(
    await fileReads(sender),
    0,
    `${sender.engine}: declined file was read`,
  );
  assert.equal(
    receiver.downloads.length,
    before,
    `${receiver.engine}: declined offer downloaded`,
  );
}

function assertCoordinatorBoundary(client) {
  assert(
    client.frames.some(({ type }) => type === "hello"),
    `${client.engine}: no hello observed`,
  );
  assert(
    client.frames.some(({ type }) => type === "signal"),
    `${client.engine}: no signaling observed`,
  );
  for (const frame of client.frames) {
    assert(
      ["hello", "signal"].includes(frame.type),
      `${client.engine}: application frame sent to coordinator (${frame.type})`,
    );
    const allowed =
      frame.type === "hello" ? ["type", "pubkey"] : ["type", "to", "payload"];
    assert.deepEqual(
      Object.keys(frame).sort(),
      allowed.sort(),
      `${client.engine}: coordinator frame fields`,
    );
  }
  assert.deepEqual(
    client.httpWrites,
    [],
    `${client.engine}: HTTP application payload write`,
  );
}

try {
  const chrome = await client("chromium", "Cross Chromium");
  const safari = await client("webkit", "Cross WebKit");
  phase = "mixed native discovery";
  await peer(chrome.page, safari.name).waitFor();
  await peer(safari.page, chrome.name).waitFor();
  for (const client of clients)
    assert.equal(
      await client.page.locator(".rail-count").innerText(),
      "1 reachable",
      "Suite requires exactly two isolated clients",
    );
  await select(chrome, safari);
  await select(safari, chrome);

  phase = "bidirectional chat";
  await sendMessage(chrome, safari, "Chromium to WebKit: hello, 資料 📁.");
  await sendMessage(safari, chrome, "WebKit to Chromium: a direct reply.");

  phase = "matching security fingerprints";
  for (const client of clients)
    await client.page
      .getByRole("button", { name: "Verify security fingerprint", exact: true })
      .click();
  for (const client of clients)
    await client.page.locator(".fingerprint span").first().waitFor();
  const fingerprint = await chrome.page
    .locator(".fingerprint span")
    .allTextContents();
  assert.equal(fingerprint.length, 8, "Fingerprint must have eight byte pairs");
  assert(
    fingerprint.every((pair) => /^[0-9a-f]{2}$/i.test(pair)),
    "Invalid fingerprint pairs",
  );
  assert.deepEqual(
    await safari.page.locator(".fingerprint span").allTextContents(),
    fingerprint,
    "Mixed peers have different fingerprints",
  );
  for (const client of clients) {
    await client.page
      .getByRole("button", { name: "They match", exact: true })
      .click();
    await client.page.getByRole("dialog").waitFor({ state: "hidden" });
    await client.page
      .locator(".thread-title")
      .getByText("Verified", { exact: true })
      .waitFor();
  }

  phase = "Chromium to WebKit approved file";
  await approvedTransfer(
    chrome,
    safari,
    fixture("chromium-to-webkit-資料.bin", 768 * 1024 + 17, 11),
  );
  phase = "WebKit to Chromium approved file";
  await approvedTransfer(
    safari,
    chrome,
    fixture("webkit-to-chromium-📁.bin", 1024 * 1024 + 29, 73),
  );

  phase = "bidirectional decline without reads or downloads";
  await decline(
    chrome,
    safari,
    fixture("declined-in-webkit.bin", 32 * 1024 + 5, 19),
  );
  await decline(
    safari,
    chrome,
    fixture("declined-in-chromium.bin", 48 * 1024 + 7, 41),
  );
  for (const client of clients) assertCoordinatorBoundary(client);

  phase = "native Chromium departure and retained WebKit private stage";
  const retained = fixture("private-stage-must-stay-local.bin", 4096, 97);
  const draft = "Private draft for Cross Chromium — keep it here.";
  await resetReads(safari);
  await safari.page.locator(".composer textarea").fill(draft);
  await safari.page
    .locator(".composer input[type=file]")
    .first()
    .setInputFiles(retained);
  await safari.page
    .locator(".staging-name")
    .filter({ hasText: retained.name })
    .waitFor();
  const downloads = safari.downloads.length;
  assert.equal(await fileReads(safari), 0);
  await chrome.browser.close();
  await safari.page
    .getByRole("button", { name: "Choose another recipient", exact: true })
    .waitFor();
  assert.equal(
    await safari.page.locator(".thread-title h2").innerText(),
    chrome.name,
    "Departure silently changed the private audience",
  );
  assert.equal(
    await safari.page.locator(".composer textarea").inputValue(),
    draft,
    "Departure lost the private draft",
  );
  assert.deepEqual(
    await safari.page.locator(".staging-name").allTextContents(),
    [retained.name],
    "Departure lost staged file handles",
  );
  assert.equal(
    await safari.page
      .getByRole("button", { name: /^Offer files to / })
      .isDisabled(),
    true,
    "Departed recipient still accepts file offers",
  );
  assert.equal(
    await safari.page
      .getByRole("button", { name: "Send message", exact: true })
      .isDisabled(),
    true,
    "Departed recipient still accepts messages",
  );
  assert.equal(
    await fileReads(safari),
    0,
    "Departure read local prepared bytes",
  );
  assert.equal(
    safari.downloads.length,
    downloads,
    "Departure created a download",
  );
  assertCoordinatorBoundary(safari);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
  console.log(
    "Mixed-browser passed: native Chromium↔WebKit discovery and bidirectional chat, matching confirmed fingerprints, staged metadata without file reads/downloads, approvals and independent SHA-256/exact download bytes in both directions, declines in both directions, signaling-only coordinator frames/no HTTP payload writes, native Chromium departure preserves WebKit private draft/stage with disabled targets. No ICE/mDNS overrides.",
  );
} catch (error) {
  console.error(`Mixed-browser failure during: ${phase}`);
  throw error;
} finally {
  await Promise.all(
    browsers
      .filter((browser) => browser.isConnected())
      .map((browser) => browser.close()),
  );
}
