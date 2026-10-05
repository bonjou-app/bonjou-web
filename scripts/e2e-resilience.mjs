/** Real-browser transfer isolation, direct-link failure, and room reconnect regressions. */
import { strict as assert } from "node:assert";
import { chromium } from "playwright";

const BASE = new URL(process.env.APP_URL ?? "http://127.0.0.1:4173").origin;
const TIMEOUT = 30_000;
const browsers = [];
const errors = [];
const payloadRequests = [];

// These hooks observe native browser objects and inject faults at their APIs.
// They never access React state, replace protocol handlers, or alter ICE policy.
function installBrowserHarness(name) {
  localStorage.setItem("bonjou.name", name);
  localStorage.setItem("bonjou.theme", "light");
  const harness = {
    sockets: [],
    connections: [],
    gates: {},
    payloadBytes: 0,
    holdNextJoin: false,
    observeScope: false,
    scopes: [],
  };
  window.__bonjouResilience = harness;

  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args);
      if (!/\/ws$/.test(new URL(String(args[0]), location.href).pathname))
        return;
      const record = {
        socket: this,
        sent: [],
        received: [],
        holdJoin: harness.holdNextJoin,
        heldJoin: null,
      };
      harness.holdNextJoin = false;
      harness.sockets.push(record);
      this.__resilienceRecord = record;
      this.addEventListener("message", ({ data }) => {
        const frame = JSON.parse(String(data));
        // Record routing and scope only, not encrypted signaling contents.
        record.received.push({
          type: frame.type,
          code: frame.code,
          peerId: frame.peer_id,
          peers: frame.peers?.map(({ id }) => id),
        });
      });
    }
    send(data) {
      const record = this.__resilienceRecord;
      if (record && typeof data === "string") {
        const frame = JSON.parse(data);
        record.sent.push({ type: frame.type, code: frame.code });
        if (frame.type === "join" && record.holdJoin) {
          record.heldJoin = data;
          return;
        }
      }
      return super.send(data);
    }
  };
  harness.releaseJoin = () => {
    const record = harness.sockets.at(-1);
    if (!record?.heldJoin) throw new Error("No reconnect join is held.");
    record.holdJoin = false;
    const frame = record.heldJoin;
    record.heldJoin = null;
    NativeSocket.prototype.send.call(record.socket, frame);
  };

  const NativeConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends NativeConnection {
    constructor(...args) {
      super(...args);
      const record = { connection: this, channels: [] };
      this.__resilienceRecord = record;
      harness.connections.push(record);
      this.addEventListener("datachannel", ({ channel }) => {
        record.channels.push(channel);
      });
    }
    createDataChannel(...args) {
      const channel = super.createDataChannel(...args);
      this.__resilienceRecord.channels.push(channel);
      return channel;
    }
  };
  const nativeSend = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (data) {
    const result = nativeSend.call(this, data);
    if (this.label.startsWith("bonjou-file:"))
      harness.payloadBytes += data.byteLength ?? data.size ?? 0;
    return result;
  };

  // Let several authenticated chunks pass, then hold the source. Explicit
  // release makes overlap and mid-transfer interruption deterministic.
  harness.gateFile = (filename) => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    harness.gates[filename] = {
      promise,
      release,
      blocked: false,
      delivered: 0,
    };
  };
  const nativeStream = File.prototype.stream;
  File.prototype.stream = function () {
    const gate = harness.gates[this.name];
    if (!gate) return nativeStream.call(this);
    const reader = nativeStream.call(this).getReader();
    let pending = new Uint8Array(0);
    let cancelled = false;
    return new ReadableStream(
      {
        async pull(controller) {
          if (gate.delivered >= 256 * 1024) {
            gate.blocked = true;
            await gate.promise;
          }
          if (cancelled) return;
          if (!pending.length) {
            const next = await reader.read();
            if (cancelled) return;
            if (next.done) {
              controller.close();
              return;
            }
            pending = next.value;
          }
          const chunk = pending.subarray(0, 64 * 1024);
          pending = pending.subarray(chunk.length);
          gate.delivered += chunk.length;
          controller.enqueue(chunk);
        },
        cancel(reason) {
          cancelled = true;
          gate.release();
          return reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
  };

  const recordScope = () => {
    if (!harness.observeScope) return;
    harness.scopes.push({
      path: location.pathname,
      people: [...document.querySelectorAll(".chip-name")].map(
        (node) => node.textContent,
      ),
    });
  };
  const replaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    const result = replaceState(...args);
    recordScope();
    return result;
  };
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(recordScope).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

async function client(name) {
  // Separate Chrome processes preserve default mDNS/host ICE networking.
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });
  browsers.push(browser);
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 850 },
  });
  await context.addInitScript(installBrowserHarness, name);
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("request", (request) => {
    if (/^\/t\//.test(new URL(request.url()).pathname))
      payloadRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.goto(`${BASE}/app`);
  await page.getByText("Connected", { exact: true }).waitFor();
  return page;
}

const chip = (page, name) => page.locator(".chip").filter({ hasText: name });
const card = (page, name) => page.locator(".card").filter({ hasText: name });
async function select(page, name) {
  await chip(page, name).click();
}
async function offer(page, files) {
  await page.locator(".composer input[type=file]").first().setInputFiles(files);
  await page.getByRole("button", { name: /^Offer files to / }).click();
}
function downloadFor(page, name) {
  const pending = page.waitForEvent("download", {
    predicate: (download) => download.suggestedFilename() === name,
    timeout: 60_000,
  });
  void pending.catch(() => {});
  return pending;
}
async function readDownload(download) {
  const stream = await download.createReadStream();
  assert(stream, `Download failed: ${await download.failure()}`);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function fixture(name, size, seed) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buffer[i] = (i * 31 + (i >>> 11) + seed) & 255;
  return { name, mimeType: "application/octet-stream", buffer };
}
async function assertPartialProgress(page, name) {
  await page.waitForFunction((filename) => {
    const node = [...document.querySelectorAll(".card")].find(
      (item) => item.querySelector(".card-name")?.textContent === filename,
    );
    const progress = Number(
      node
        ?.querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow"),
    );
    return progress > 0 && progress < 100;
  }, name);
}
async function openRoom(page) {
  await page.locator(".rail-room-open").click();
  await page.getByRole("button", { name: "Open a room", exact: true }).click();
  await page.locator(".room-code code").waitFor();
  const code = (await page.locator(".room-code code").textContent()).trim();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  return code;
}
async function joinRoom(page, code) {
  await page.locator(".rail-room-open").click();
  await page.getByRole("tab", { name: "Join a room", exact: true }).click();
  await page.getByLabel("Room code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.locator(".room-code code").filter({ hasText: code }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

try {
  const alice = await client("Resilience Alice");
  const bob = await client("Resilience Bob");
  const carol = await client("Resilience Carol");
  await select(alice, "Resilience Bob");
  await select(carol, "Resilience Bob");

  const first = fixture("parallel-alice.bin", 2 * 1024 * 1024 + 17, 11);
  const queued = fixture("queued-alice.bin", 173_219, 79);
  const second = fixture("parallel-carol.bin", 2 * 1024 * 1024 + 103, 151);
  await alice.evaluate(
    (name) => window.__bonjouResilience.gateFile(name),
    first.name,
  );
  await carol.evaluate(
    (name) => window.__bonjouResilience.gateFile(name),
    second.name,
  );
  await Promise.all([offer(alice, [first, queued]), offer(carol, [second])]);
  for (const file of [first, queued, second]) {
    await card(bob, file.name)
      .getByRole("button", { name: "Approve", exact: true })
      .waitFor();
  }
  assert.equal(
    await bob.locator('iframe[src^="/dl/"]').count(),
    0,
    "Offers started a download before approval",
  );
  assert.equal(
    await alice.evaluate(() => window.__bonjouResilience.payloadBytes),
    0,
  );
  assert.equal(
    await carol.evaluate(() => window.__bonjouResilience.payloadBytes),
    0,
  );
  const downloads = [first, queued, second].map((file) =>
    downloadFor(bob, file.name),
  );
  for (const file of [first, queued, second]) {
    await card(bob, file.name)
      .getByRole("button", { name: "Approve", exact: true })
      .click();
  }
  await Promise.all([
    alice.waitForFunction(
      (name) => window.__bonjouResilience.gates[name].blocked,
      first.name,
    ),
    carol.waitForFunction(
      (name) => window.__bonjouResilience.gates[name].blocked,
      second.name,
    ),
    assertPartialProgress(bob, first.name),
    assertPartialProgress(bob, second.name),
  ]);
  assert.match(
    await card(alice, first.name).getAttribute("class"),
    /\bis-sending\b/,
  );
  assert.match(
    await card(carol, second.name).getAttribute("class"),
    /\bis-sending\b/,
  );
  assert.match(
    await card(alice, queued.name).getAttribute("class"),
    /\bis-offered\b/,
    "Same-peer transfer did not remain queued",
  );
  assert.equal(
    await bob.locator(".card.is-receiving").count(),
    2,
    "Transfers did not overlap at the receiver",
  );
  await Promise.all([
    alice.evaluate(
      (name) => window.__bonjouResilience.gates[name].release(),
      first.name,
    ),
    carol.evaluate(
      (name) => window.__bonjouResilience.gates[name].release(),
      second.name,
    ),
  ]);
  for (const [index, file] of [first, queued, second].entries()) {
    assert.deepEqual(
      await readDownload(await downloads[index]),
      file.buffer,
      `${file.name} bytes changed or crossed streams`,
    );
    await card(bob, file.name)
      .filter({
        has: bob.getByText("Transfer complete. Check your downloads.", {
          exact: true,
        }),
      })
      .waitFor();
  }
  await card(alice, first.name).getByText("Sent", { exact: true }).waitFor();
  await card(alice, queued.name).getByText("Sent", { exact: true }).waitFor();
  await card(carol, second.name).getByText("Sent", { exact: true }).waitFor();

  // Close a real RTCPeerConnection only after authenticated payload has moved.
  const interrupted = fixture("interrupted.bin", 2 * 1024 * 1024, 223);
  await alice.evaluate(
    (name) => window.__bonjouResilience.gateFile(name),
    interrupted.name,
  );
  await offer(alice, interrupted);
  await card(bob, interrupted.name)
    .getByRole("button", { name: "Approve", exact: true })
    .waitFor();
  const partialDownload = downloadFor(bob, interrupted.name);
  await card(bob, interrupted.name)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await alice.waitForFunction(
    (name) => window.__bonjouResilience.gates[name].blocked,
    interrupted.name,
  );
  await assertPartialProgress(bob, interrupted.name);
  await assertPartialProgress(alice, interrupted.name);
  await select(alice, "Everyone here");
  const closed = await alice.evaluate(() => {
    const harness = window.__bonjouResilience;
    if (harness.sockets.at(-1).socket.readyState !== WebSocket.OPEN)
      throw new Error(
        "Coordinator socket failed before direct-link injection.",
      );
    const active = harness.connections.filter((record) =>
      record.channels.some(
        (channel) =>
          channel.label.startsWith("bonjou-file:") &&
          channel.readyState === "open",
      ),
    );
    for (const record of active) record.connection.close();
    return active.length;
  });
  assert.equal(
    closed,
    1,
    "Fault must close exactly the active payload's peer connection",
  );
  await Promise.all([
    card(alice, interrupted.name)
      .and(alice.locator(".is-failed"))
      .waitFor({ timeout: 10_000 }),
    card(bob, interrupted.name)
      .and(bob.locator(".is-failed"))
      .waitFor({ timeout: 10_000 }),
  ]);
  await card(alice, interrupted.name)
    .getByText("Failed", { exact: true })
    .waitFor();
  await card(bob, interrupted.name)
    .getByText(/The transfer did not finish/)
    .waitFor();
  assert(
    await (await partialDownload).failure(),
    "Interrupted transfer was reported as a successful download",
  );
  assert.equal(
    await alice.evaluate(
      () => window.__bonjouResilience.sockets.at(-1).socket.readyState,
    ),
    1,
    "Direct loss also closed coordinator socket",
  );

  const code = await openRoom(alice);
  await joinRoom(bob, code);
  await chip(alice, "Resilience Bob").waitFor();
  await chip(bob, "Resilience Alice").waitFor();
  await chip(carol, "Resilience Alice").waitFor({ state: "hidden" });
  await chip(carol, "Resilience Bob").waitFor({ state: "hidden" });
  const outsiderId = await carol.evaluate(
    () =>
      window.__bonjouResilience.sockets
        .at(-1)
        .received.find((frame) => frame.type === "joined")?.peerId,
  );
  assert(outsiderId, "Outsider has no real coordinator peer id");

  // Delay only the reconnect join. The native hello response and lobby roster
  // still arrive, proving the app must suppress that temporary lobby scope.
  const before = await alice.evaluate(() => {
    const harness = window.__bonjouResilience;
    const baseline = {
      sockets: harness.sockets.length,
      connections: harness.connections.length,
    };
    harness.scopes = [];
    harness.observeScope = true;
    harness.holdNextJoin = true;
    harness.sockets.at(-1).socket.close(4001, "Resilience reconnect");
    return baseline;
  });
  await alice.waitForFunction(
    ({ socketCount, outsider }) => {
      const harness = window.__bonjouResilience;
      const current = harness.sockets.at(-1);
      return (
        harness.sockets.length > socketCount &&
        current.heldJoin &&
        current.received.some(
          (frame) => frame.type === "joined" && !frame.code,
        ) &&
        current.received.some(
          (frame) => frame.type === "roster" && frame.peers?.includes(outsider),
        )
      );
    },
    { socketCount: before.sockets, outsider: outsiderId },
  );
  assert.equal(
    new URL(alice.url()).pathname,
    `/r/${code}`,
    "Reconnect hello replaced confirmed room URL with lobby",
  );
  assert.equal(await alice.locator(".rail-room-copy code").textContent(), code);
  assert.equal(
    await chip(alice, "Resilience Carol").count(),
    0,
    "Reconnect published a lobby peer before room confirmation",
  );
  assert.equal(
    await alice.evaluate(() => window.__bonjouResilience.connections.length),
    before.connections,
    "Reconnect began a peer negotiation in temporary lobby scope",
  );
  const heldIntent = await alice.evaluate(() =>
    window.__bonjouResilience.sockets
      .at(-1)
      .sent.filter((frame) => frame.type === "join"),
  );
  assert.deepEqual(
    heldIntent,
    [{ type: "join", code }],
    "Reconnect did not rejoin the confirmed room exactly once",
  );
  await alice.evaluate(() => window.__bonjouResilience.releaseJoin());
  await chip(alice, "Resilience Bob").waitFor();
  await chip(bob, "Resilience Alice").waitFor();
  await select(alice, "Resilience Bob");
  await select(bob, "Resilience Alice");
  const message = "Still inside the confirmed room after reconnect.";
  await alice.locator(".composer textarea").fill(message);
  await alice.locator(".composer textarea").press("Enter");
  await bob.getByText(message, { exact: true }).waitFor();
  assert.equal(await carol.getByText(message, { exact: true }).count(), 0);
  assert.equal(await chip(carol, "Resilience Alice").count(), 0);
  assert.equal(await chip(alice, "Resilience Carol").count(), 0);
  const scopes = await alice.evaluate(() => {
    window.__bonjouResilience.observeScope = false;
    return window.__bonjouResilience.scopes;
  });
  assert(scopes.length > 0, "No reconnect scope changes were observed");
  assert(
    scopes.every((scope) => scope.path === `/r/${code}`),
    "A reconnect temporarily exposed the lobby URL",
  );
  assert(
    scopes.every((scope) => !scope.people.includes("Resilience Carol")),
    "A reconnect temporarily exposed an outside-room person",
  );
  assert.deepEqual(
    payloadRequests,
    [],
    "A transfer attempted a coordinator payload endpoint",
  );
  assert.deepEqual(
    errors,
    [],
    "Resilience flows produced an unhandled browser error",
  );
  console.log(
    "Resilience passed: simultaneous exact-byte downloads, same-peer transfer queue, direct mid-transfer loss on both peers, confirmed room reconnect without temporary lobby exposure.",
  );
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
}
