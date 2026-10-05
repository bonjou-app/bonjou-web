/**
 * Homepage-only checks. No coordinator is needed or contacted.
 * Native WebRTC is used for successful transfers; narrowly labelled API faults
 * make cancellation, unsupported browsers and retry deterministic. The demo
 * proves a same-page loopback, not LAN reachability or protocol v2.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const ENGINE = process.env.PLAYWRIGHT_ENGINE ?? "chromium";
assert(["chromium", "webkit"].includes(ENGINE), "Unknown PLAYWRIGHT_ENGINE");
const OUTPUT =
  process.env.EXPERIENCE_SCREENSHOTS ?? join(tmpdir(), "bonjou-experience");
const browser = await (ENGINE === "webkit" ? webkit : chromium).launch({
  ...(ENGINE === "webkit"
    ? {}
    : { channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" }),
});
const errors = [];
const checked = [];
const widths = [320, 390, 768, 1024, 1440];
const filename = `nearby-${"long-file-name-".repeat(7)}handoff.bin`;
const payload = Buffer.from(
  Array.from({ length: 196_731 }, (_, index) => (index * 29 + 17) % 256),
);
const expectedHash = createHash("sha256").update(payload).digest("hex");
const oversizedPayload = Buffer.alloc(2 * 1024 * 1024 + 1, 17);
const scenarios = [
  [
    "In the studio",
    "image",
    "A fresh idea.",
    "Try a design handoff",
    "dot-study.svg",
  ],
  [
    "At the shared desk",
    "sheet",
    "The next version.",
    "Try the project file",
    "colour-sheet.csv",
  ],
  [
    "After class",
    "notes",
    "The good notes.",
    "Try passing the notes",
    "field-notes.txt",
  ],
];

async function client(theme, unsupportedRTC = false) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ theme, unsupportedRTC }) => {
      localStorage.setItem("bonjou.theme", theme);
      const probe = {
        sockets: [],
        locks: [],
        pcs: [],
        channels: [],
        configurations: [],
        reads: 0,
        revoked: [],
        nativeRTC: window.RTCPeerConnection,
      };
      window.__experience = probe;
      if (window.WebSocket) {
        window.WebSocket = new Proxy(window.WebSocket, {
          construct(target, args) {
            probe.sockets.push(String(args[0]));
            return Reflect.construct(target, args, target);
          },
        });
      }
      if (navigator.locks?.request) {
        const request = navigator.locks.request.bind(navigator.locks);
        Object.defineProperty(navigator.locks, "request", {
          configurable: true,
          value: (...args) => {
            probe.locks.push(String(args[0]));
            return request(...args);
          },
        });
      }
      if (window.RTCPeerConnection) {
        window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
          construct(target, args) {
            const pc = Reflect.construct(target, args, target);
            probe.pcs.push(pc);
            probe.configurations.push(args[0]);
            const create = pc.createDataChannel.bind(pc);
            pc.createDataChannel = (...arguments_) => {
              const channel = create(...arguments_);
              probe.channels.push(channel);
              return channel;
            };
            pc.addEventListener("datachannel", ({ channel }) =>
              probe.channels.push(channel),
            );
            return pc;
          },
        });
        probe.observedRTC = window.RTCPeerConnection;
      }
      if (unsupportedRTC) window.RTCPeerConnection = undefined;
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function (...args) {
        if (this instanceof File) probe.reads += 1;
        return read.apply(this, args);
      };
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        probe.revoked.push(url);
        revoke(url);
      };
    },
    { theme, unsupportedRTC },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(BASE);
  await phase(page, "ready");
  await settle(page);
  await steps(page, 1, 0);
  return { page, context };
}

const lab = (page) => page.getByTestId("handoff-lab");
const action = (page, name) =>
  lab(page).getByRole("button", { name, exact: true });
const filePicker = (page) =>
  lab(page).getByLabel("Choose a local file for the demo, up to 2 MiB");
async function steps(page, current, complete) {
  const items = lab(page)
    .getByRole("list", { name: "Handoff steps" })
    .getByRole("listitem");
  const result = await items.evaluateAll((items) =>
    items.map((item) => ({
      current: item.getAttribute("aria-current") === "step",
      complete: item.dataset.state === "complete",
    })),
  );
  assert.equal(result.length, 3, "The handoff exposes three task steps");
  assert.deepEqual(
    result.map((step) => step.current),
    [1, 2, 3].map((step) => step === current),
    "The current task step follows the actual handoff state",
  );
  assert.deepEqual(
    result.map((step) => step.complete),
    [1, 2, 3].map((step) => step <= complete),
    "Receive is completed only after native transfer and byte verification",
  );
}
async function phase(page, value) {
  await page.waitForFunction(
    (value) =>
      document.querySelector('[data-testid="handoff-lab"]')?.dataset.phase ===
      value,
    value,
    { timeout: 30_000 },
  );
}
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}
async function resources(page) {
  return page.evaluate(() => ({
    sockets: window.__experience.sockets,
    locks: window.__experience.locks,
    pcs: window.__experience.pcs.length,
    reads: window.__experience.reads,
    configurations: window.__experience.configurations,
  }));
}
async function quiet(page, label) {
  const result = await resources(page);
  assert.deepEqual(result.sockets, [], `${label}: a WebSocket was opened`);
  assert.deepEqual(result.locks, [], `${label}: a session lock was requested`);
  return result;
}
async function closed(page) {
  await page.waitForFunction(
    () =>
      window.__experience.pcs.every((pc) => pc.signalingState === "closed") &&
      window.__experience.channels.every(
        (channel) => channel.readyState === "closed",
      ),
  );
}
async function focus(page, locator, label) {
  await page.waitForFunction(
    (selector) => document.activeElement?.matches(selector),
    await locator.evaluate((element) => {
      const id = `experience-focus-${Math.random().toString(36).slice(2)}`;
      element.dataset.experienceFocus = id;
      return `[data-experience-focus="${id}"]`;
    }),
  );
  assert(
    await locator.evaluate((element) => element === document.activeElement),
    label,
  );
}
async function upload(page) {
  await filePicker(page).setInputFiles({
    name: filename,
    mimeType: "application/octet-stream",
    buffer: payload,
  });
  assert.equal(await lab(page).getAttribute("data-sample"), "custom");
  assert.equal(await page.getByTestId("lab-filename").textContent(), filename);
}
async function selection(page) {
  return lab(page).evaluate((element) => ({
    sample: element.dataset.sample,
    phase: element.dataset.phase,
    integrity: element.dataset.integrity,
    received: element.dataset.receivedBytes,
    total: element.dataset.totalBytes,
    filename: element.querySelector('[data-testid="lab-filename"]')
      ?.textContent,
    senderHash: element.querySelector('[data-testid="lab-sender-hash"]')
      ?.textContent,
    receiverHash: element.querySelector('[data-testid="lab-receiver-hash"]')
      ?.textContent,
    download: element
      .querySelector('[data-testid="lab-download"]')
      ?.getAttribute("href"),
  }));
}
async function rejectOversized(page, label) {
  const before = await selection(page);
  const beforeResources = await quiet(page, `${label}: before invalid file`);
  await filePicker(page).setInputFiles({
    name: "too-large.bin",
    mimeType: "application/octet-stream",
    buffer: oversizedPayload,
  });
  const alert = lab(page).getByRole("alert");
  await alert.waitFor();
  assert.match(await alert.textContent(), /Choose a file up to 2 MiB/);
  assert.deepEqual(
    await selection(page),
    before,
    `${label}: an invalid choice must preserve the current file and receipt`,
  );
  assert.deepEqual(
    await quiet(page, `${label}: invalid file rejected`),
    beforeResources,
    "Rejecting a file must not read it or start another transfer",
  );
  if (before.download) {
    assert.equal(
      await page.evaluate(
        (url) => window.__experience.revoked.includes(url),
        before.download,
      ),
      false,
      "Rejecting another file must not revoke the verified download",
    );
    const pending = page.waitForEvent("download");
    await page.getByTestId("lab-download").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
    assert.deepEqual(
      await readFile(await download.path()),
      payload,
      "The original verified bytes remain downloadable after an invalid choice",
    );
  }
}
async function installOfferGate(page) {
  await page.evaluate(() => {
    const original = RTCPeerConnection.prototype.createOffer;
    delete window.__experience.releaseGate;
    window.__experience.restoreGate = () => {
      RTCPeerConnection.prototype.createOffer = original;
    };
    RTCPeerConnection.prototype.createOffer = function (...args) {
      return original.apply(this, args).then(
        (offer) =>
          new Promise((resolve) => {
            window.__experience.releaseGate = () => resolve(offer);
          }),
      );
    };
  });
}
async function waitOfferGate(page, countBefore) {
  await page.waitForFunction(
    (before) =>
      window.__experience.pcs.length === before + 2 &&
      typeof window.__experience.releaseGate === "function",
    countBefore,
  );
  await phase(page, "connecting");
  await steps(page, 3, 2);
  assert.equal(await page.getByTestId("lab-download").count(), 0);
  assert.equal(await lab(page).getAttribute("data-integrity"), "unverified");
}
async function releaseOfferGate(page) {
  await page.evaluate(() => {
    window.__experience.restoreGate();
    window.__experience.releaseGate();
  });
}
async function busySelectionControls(page) {
  const before = await selection(page);
  const samples = lab(page)
    .getByRole("group", { name: "Choose an original sample file" })
    .getByRole("button");
  assert.equal(await samples.count(), 3);
  for (const sample of await samples.all())
    assert(await sample.isDisabled(), "Sample choices disable during transfer");
  assert(await filePicker(page).isDisabled(), "Custom file selection disables");
  const stories = page.locator("#stories");
  for (const [tab, , , name] of scenarios) {
    await stories.getByRole("tab", { name: tab, exact: true }).click();
    const button = stories.getByRole("button", { name, exact: true });
    assert(await button.isDisabled(), `${tab}: sample handoff disables`);
    const reason = stories.locator("#stories-demo-busy");
    assert(
      await reason.isVisible(),
      `${tab}: the disabled action is explained`,
    );
    assert.equal(
      await button.getAttribute("aria-describedby"),
      await reason.getAttribute("id"),
    );
  }
  assert.deepEqual(
    await selection(page),
    before,
    "Browsing story tabs must not replace or interrupt an active transfer",
  );
  await steps(page, 3, 2);
}
async function selectionControlsEnabled(page) {
  for (const sample of await lab(page)
    .getByRole("group", { name: "Choose an original sample file" })
    .getByRole("button")
    .all())
    assert(await sample.isEnabled(), "Sample selection returns after transfer");
  assert(
    await filePicker(page).isEnabled(),
    "Custom picker returns after transfer",
  );
  assert(
    await page
      .locator("#stories")
      .getByRole("button", { name: "Try passing the notes", exact: true })
      .isEnabled(),
    "Scenario Try returns after the handoff ends",
  );
  assert.equal(await page.locator("#stories-demo-busy").count(), 0);
}
async function offer(page) {
  const button = action(page, "Offer this file");
  await button.focus();
  await page.keyboard.press("Enter");
  await phase(page, "offered");
  await steps(page, 2, 1);
  await focus(
    page,
    action(page, "Approve file"),
    "Offer hands focus to approval",
  );
  assert.equal(await lab(page).getAttribute("data-integrity"), "unverified");
  assert.equal(await page.getByTestId("lab-download").count(), 0);
}
async function verify(page, countBefore, exactPayload = false) {
  await phase(page, "received");
  await steps(page, undefined, 3);
  await page.getByTestId("lab-download").waitFor();
  await closed(page);
  assert.equal(
    (await quiet(page, "approved loopback")).pcs,
    countBefore + 2,
    "Approval creates exactly two native peer connections",
  );
  assert.equal(await lab(page).getAttribute("data-integrity"), "verified");
  const sent = (await page.getByTestId("lab-sender-hash").textContent()).trim();
  const received = (
    await page.getByTestId("lab-receiver-hash").textContent()
  ).trim();
  assert.match(sent, /^[0-9a-f]{64}$/);
  assert.equal(received, sent);
  assert.equal(
    await lab(page).getAttribute("data-received-bytes"),
    await lab(page).getAttribute("data-total-bytes"),
  );
  assert.equal(
    await page.getByTestId("lab-progress").getAttribute("aria-valuenow"),
    "100",
  );
  if (exactPayload) {
    assert.equal(
      sent,
      expectedHash,
      "Displayed SHA-256 matches independently generated bytes",
    );
    assert.equal(
      Number(await lab(page).getAttribute("data-received-bytes")),
      payload.length,
    );
    const pending = page.waitForEvent("download");
    await page.getByTestId("lab-download").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
    assert.deepEqual(
      await readFile(await download.path()),
      payload,
      "Download is byte-for-byte identical",
    );
  }
}
async function reset(page) {
  const oldURL = await page
    .getByTestId("lab-download")
    .getAttribute("href")
    .catch(() => null);
  await action(page, "Reset local WebRTC demo").click();
  await phase(page, "ready");
  await steps(page, 1, 0);
  await closed(page);
  assert.equal(await lab(page).getAttribute("data-received-bytes"), "0");
  assert.equal(await lab(page).getAttribute("data-integrity"), "unverified");
  assert.equal(await page.getByTestId("lab-download").count(), 0);
  if (oldURL)
    await page.waitForFunction(
      (url) => window.__experience.revoked.includes(url),
      oldURL,
    );
  await focus(
    page,
    action(page, "Offer this file"),
    "Reset restores useful focus",
  );
}
async function fits(page, label) {
  await settle(page);
  const result = await page.evaluate(() => {
    const width = innerWidth;
    const selectors =
      '[data-testid="handoff-lab"], .lab-window, .lab-file-details, #stories, .story-copy, #connection, .explorer-map, .explorer-rail, .explorer-capabilities';
    const failures = [...document.querySelectorAll(selectors)]
      .filter((element) => {
        if (!element.getClientRects().length) return false;
        const box = element.getBoundingClientRect();
        return (
          box.left < -1 ||
          box.right > width + 1 ||
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map((element) => element.className);
    return { width, document: document.documentElement.scrollWidth, failures };
  });
  assert(
    result.document <= result.width + 1,
    `${label}: document overflow ${JSON.stringify(result)}`,
  );
  assert.deepEqual(
    result.failures,
    [],
    `${label}: new section content is clipped`,
  );
  for (const selector of [
    '[data-testid="handoff-lab"] [data-slot="button"]',
    '#stories [role="tab"]',
    '#connection [data-slot="button"]',
    '#connection [data-slot="tabs-trigger"]',
    '#connection [data-slot="toggle-group-item"]',
  ]) {
    for (const button of await page.locator(selector).all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      assert(
        box && box.height >= 43 && box.width >= 43,
        `${label}: small action ${await button.textContent()}`,
      );
    }
  }
}
async function accessible(page, label) {
  await settle(page);
  const result = await new AxeBuilder({ page })
    .include('[data-testid="handoff-lab"]')
    .include("#stories")
    .include("#connection")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target, failureSummary }) => ({
        target,
        failureSummary,
      })),
    })),
    [],
    label,
  );
  checked.push(label);
}

async function explorer(page) {
  const section = page.locator("#connection");
  for (const client of ["browser", "cli"]) {
    await section
      .getByRole("tab", {
        name: client === "browser" ? "Browser" : "CLI",
        exact: true,
      })
      .click();
    for (const [network, label] of [
      ["local", "Same Wi-Fi / Ethernet"],
      ["guest", "Guest Wi-Fi"],
      ["separate", "Different networks"],
    ]) {
      await section.getByRole("radio", { name: label, exact: true }).click();
      for (const online of [true, false]) {
        const toggle = section.getByRole("switch", {
          name: "Internet available in this setup",
        });
        if ((await toggle.getAttribute("aria-checked")) !== String(online))
          await toggle.click();
        const expected =
          network === "separate"
            ? "blocked"
            : client === "browser" && !online
              ? "offline"
              : network === "guest"
                ? "uncertain"
                : "local";
        assert.equal(await section.getAttribute("data-client"), client);
        assert.equal(await section.getAttribute("data-network"), network);
        assert.equal(await section.getAttribute("data-online"), String(online));
        assert.equal(
          await section.locator(".explorer-outcome").getAttribute("data-state"),
          expected,
          `${client}/${network}/${online}`,
        );
        if (network === "separate")
          assert.match(
            await section.locator(".explorer-outcome").textContent(),
            /cannot bridge networks/,
          );
        if (network === "guest" && expected === "uncertain")
          assert.match(
            await section.locator(".explorer-outcome").textContent(),
            /If device isolation is enabled/,
          );
        if (client === "cli" && network === "local" && !online)
          assert.match(
            await section.locator(".explorer-outcome").textContent(),
            /without an internet connection/,
          );
      }
    }
  }
  const before = await quiet(page, "explorer choices");
  await section
    .getByRole("button", { name: "Check browser support", exact: true })
    .click();
  await section
    .getByRole("heading", { name: "What this browser provides" })
    .waitFor();
  assert.equal(await section.locator(".explorer-capabilities dt").count(), 5);
  assert.match(
    await section.locator(".explorer-capabilities").textContent(),
    /Local SHA-256 and AES-GCM round-trip passed/,
  );
  assert.match(
    await section.locator(".explorer-capabilities").textContent(),
    /registration and downloads are not tested/,
  );
  assert.deepEqual(
    await quiet(page, "browser capability check"),
    before,
    "Capability check must create no socket, lock, peer or file read",
  );
}
async function stories(page) {
  const section = page.locator("#stories");
  for (const [tab, sample, title, button, filename] of scenarios) {
    await section.getByRole("tab", { name: tab, exact: true }).click();
    assert.match(
      await section.getByRole("tabpanel").textContent(),
      new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.equal(
      await section.locator(".demo-file-copy strong").textContent(),
      filename,
      "The illustrated file names the sample the story action will load",
    );
    await section.getByRole("button", { name: button, exact: true }).click();
    await phase(page, "ready");
    await page.waitForFunction(
      (sample) =>
        document.querySelector('[data-testid="handoff-lab"]')?.dataset
          .sample === sample,
      sample,
    );
    assert.equal(await lab(page).getAttribute("data-sample"), sample);
    assert.equal(
      await page.getByTestId("lab-filename").textContent(),
      filename,
      "The handoff keeps the same file identity as its selected story",
    );
    await steps(page, 1, 0);
    await focus(
      page,
      action(page, "Offer this file"),
      "Scenario Try action hands focus to Offer",
    );
  }
}

try {
  await mkdir(OUTPUT, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const { page, context } = await client(theme);
    try {
      assert.deepEqual(await quiet(page, "idle homepage"), {
        sockets: [],
        locks: [],
        pcs: 0,
        reads: 0,
        configurations: [],
      });
      await page.setViewportSize({ width: 390, height: 900 });
      await accessible(page, `${theme} ready`);
      await stories(page);
      await explorer(page);
      assert.equal((await quiet(page, "pre-approval interactions")).pcs, 0);
      assert.equal((await resources(page)).reads, 0);
      await accessible(page, `${theme} capability results`);
      await rejectOversized(page, `${theme} ready sample`);

      await upload(page);
      await offer(page);
      await accessible(page, `${theme} metadata offer`);
      assert.equal((await quiet(page, "metadata offer")).pcs, 0);
      assert.equal((await resources(page)).reads, 0);
      await action(page, "Decline").click();
      await phase(page, "declined");
      await steps(page, 1, 0);
      assert.equal((await quiet(page, "declined offer")).pcs, 0);
      assert.equal((await resources(page)).reads, 0);
      await focus(
        page,
        action(page, "Offer this file"),
        "Decline returns to Offer",
      );

      // Hold a genuine native offer long enough to exercise selection controls
      // before releasing it into an ordinary successful WebRTC transfer.
      await installOfferGate(page);
      await offer(page);
      await action(page, "Approve file").click();
      await waitOfferGate(page, 0);
      await busySelectionControls(page);
      await releaseOfferGate(page);
      await verify(page, 0, true);
      await selectionControlsEnabled(page);
      assert.equal(await lab(page).getAttribute("data-sample"), "custom");
      assert.equal(
        await page.getByTestId("lab-filename").textContent(),
        filename,
      );
      await rejectOversized(page, `${theme} verified receipt`);
      const approved = await resources(page);
      assert.equal(approved.reads, 1, "The file is read only after approval");
      assert(
        approved.configurations.every(
          (configuration) => configuration.iceServers?.length === 0,
        ),
        "Loopback must have no STUN/TURN servers",
      );
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await fits(page, `${theme} received ${width}px`);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await accessible(page, `${theme} verified receipt`);
      await reset(page);

      // Two genuine PCs are created before holding their offer result. This
      // explicit API gate makes a user cancellation reproducible on fast CPUs.
      await installOfferGate(page);
      const beforeCancel = (await resources(page)).pcs;
      await offer(page);
      await action(page, "Approve file").click();
      await waitOfferGate(page, beforeCancel);
      assert(await filePicker(page).isDisabled());
      await action(page, "Cancel transfer").click();
      await phase(page, "cancelled");
      await steps(page, 1, 0);
      await releaseOfferGate(page);
      await closed(page);
      await selectionControlsEnabled(page);
      assert.equal(await page.getByTestId("lab-download").count(), 0);
      assert.equal(
        await lab(page).getAttribute("data-integrity"),
        "unverified",
      );
      await focus(
        page,
        action(page, "Offer this file"),
        "Cancellation returns to Offer",
      );

      // Fail one native binary send, then retry the same chosen file through
      // real, fresh peer connections. Other frames and sends stay native.
      await page.evaluate(() => {
        const original = RTCDataChannel.prototype.send;
        window.__experience.restoreSend = () => {
          RTCDataChannel.prototype.send = original;
        };
        RTCDataChannel.prototype.send = function (data) {
          if (data instanceof ArrayBuffer && !window.__experience.sendFailed) {
            window.__experience.sendFailed = true;
            throw new Error("Injected binary-send failure");
          }
          return original.call(this, data);
        };
      });
      await offer(page);
      await action(page, "Approve file").click();
      await phase(page, "failed");
      await steps(page, 3, 2);
      await closed(page);
      assert(await page.evaluate(() => window.__experience.sendFailed));
      assert.equal(await page.getByTestId("lab-download").count(), 0);
      assert.equal(
        await lab(page).getAttribute("data-integrity"),
        "unverified",
      );
      await focus(
        page,
        action(page, "Retry transfer"),
        "Failure focuses retry",
      );
      await page.evaluate(() => window.__experience.restoreSend());
      const beforeRetry = (await resources(page)).pcs;
      await action(page, "Retry transfer").click();
      await verify(page, beforeRetry, true);
      await reset(page);
      await quiet(page, "all homepage flows");
    } catch (error) {
      await page
        .screenshot({
          path: join(OUTPUT, `${ENGINE}-${theme}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }

  const unsupported = await client("light", true);
  try {
    await offer(unsupported.page);
    await action(unsupported.page, "Approve file").click();
    await phase(unsupported.page, "failed");
    assert.match(
      await lab(unsupported.page).getByRole("alert").textContent(),
      /does not provide WebRTC/,
    );
    assert.equal((await quiet(unsupported.page, "unsupported RTC")).pcs, 0);
    assert.equal((await resources(unsupported.page)).reads, 0);
    await focus(
      unsupported.page,
      action(unsupported.page, "Retry transfer"),
      "Unsupported browser keeps a recovery action",
    );
    await unsupported.page.evaluate(() => {
      window.RTCPeerConnection = window.__experience.observedRTC;
    });
    await action(unsupported.page, "Retry transfer").click();
    await verify(unsupported.page, 0);
  } finally {
    await unsupported.context.close();
  }
  assert.deepEqual(errors, [], "Unexpected browser errors");
  console.log(
    `Experience passed (${ENGINE}): idle/offer/decline do not read files or open peers; approval creates two native PCs; independent SHA-256 and exact downloaded bytes; oversized choices retain samples and usable verified downloads; busy sample/file/scenario controls prevent interruption; task steps follow native handoff state; cancellation, URL cleanup, send-failure retry, unsupported-API recovery; 3 scenario actions preserve file identity; all 12 setup combinations; local browser support check without sockets; light/dark ${widths.join("/")}px fit; ${checked.length} scoped axe scans. Explicit transport gates/faults are test-only; successful transfer and retry use native WebRTC.`,
  );
} finally {
  await browser.close();
}
