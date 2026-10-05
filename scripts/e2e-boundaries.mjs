/**
 * Native homepage boundaries and browser integration against a final build.
 * Successful transfers use unmodified WebRTC. Two explicitly labelled faults
 * corrupt a payload chunk or hold a genuine offer until the production deadline.
 * No production timeout, ICE setting, or protocol code is changed by this script.
 * The app artwork case requires the normal coordinator and real peer discovery.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const ENGINE = process.env.PLAYWRIGHT_ENGINE ?? "chromium";
assert(["chromium", "webkit"].includes(ENGINE), "Unknown PLAYWRIGHT_ENGINE");
const OUTPUT =
  process.env.BOUNDARIES_SCREENSHOTS ?? join(tmpdir(), "bonjou-boundaries");
const errors = [];
const checked = [];
const browsers = [];
const kinds = ["notes", "studio", "project", "nearby", "received"];
const lab = (page) => page.getByTestId("handoff-lab");
const action = (page, name) =>
  lab(page).getByRole("button", { name, exact: true });

async function launch() {
  const browser = await (ENGINE === "webkit" ? webkit : chromium).launch({
    ...(ENGINE === "webkit"
      ? {}
      : { channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" }),
  });
  browsers.push(browser);
  return browser;
}

async function client(browser, name = "") {
  const context = await browser.newContext({
    acceptDownloads: true,
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript((name) => {
    if (name) localStorage.setItem("bonjou.name", name);
    const probe = {
      pcs: [],
      channels: [],
      configurations: [],
      createdURLs: [],
      revokedURLs: [],
      reads: 0,
    };
    window.__boundaries = probe;
    const nativeRTC = window.RTCPeerConnection;
    if (nativeRTC) {
      window.RTCPeerConnection = new Proxy(nativeRTC, {
        construct(target, args) {
          const pc = Reflect.construct(target, args, target);
          probe.pcs.push(pc);
          probe.configurations.push(args[0]);
          const create = pc.createDataChannel.bind(pc);
          pc.createDataChannel = (...args) => {
            const channel = create(...args);
            probe.channels.push(channel);
            return channel;
          };
          pc.addEventListener("datachannel", ({ channel }) =>
            probe.channels.push(channel),
          );
          return pc;
        },
      });
    }
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (...args) {
      if (this instanceof File) probe.reads += 1;
      return read.apply(this, args);
    };
    const createURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = createURL(blob);
      probe.createdURLs.push(url);
      return url;
    };
    const revokeURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      probe.revokedURLs.push(url);
      revokeURL(url);
    };
  }, name);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) =>
    errors.push(`${page.url()}: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`${page.url()}: ${message.text()}`);
  });
  return { context, page };
}

async function runCase(browser, label, run, name = "") {
  const { context, page } = await client(browser, name);
  try {
    await page.goto(BASE);
    await phase(page, "ready");
    await run(page, context);
    checked.push(label);
  } catch (error) {
    await page
      .screenshot({
        path: join(OUTPUT, `${ENGINE}-${label}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
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
async function resources(page) {
  return page.evaluate(() => ({
    pcs: window.__boundaries.pcs.length,
    reads: window.__boundaries.reads,
    urls: [...window.__boundaries.createdURLs],
  }));
}
async function closed(page) {
  await page.waitForFunction(
    () =>
      window.__boundaries.pcs.every((pc) => pc.signalingState === "closed") &&
      window.__boundaries.channels.every(
        (channel) => channel.readyState === "closed",
      ),
  );
}
async function reset(page) {
  await action(page, "Reset local WebRTC demo").click();
  await phase(page, "ready");
  await closed(page);
  assert.equal(await page.getByTestId("lab-download").count(), 0);
}
function bytes(length) {
  const buffer = Buffer.alloc(length);
  for (let index = 0; index < length; index++)
    buffer[index] = (index * 73 + 11) & 255;
  return buffer;
}
async function start(page, filename, payload) {
  await lab(page)
    .getByLabel("Choose a local file for the demo, up to 2 MiB")
    .setInputFiles({
      name: filename,
      mimeType: "application/octet-stream",
      buffer: payload,
    });
  const before = await resources(page);
  await action(page, "Offer this file").click();
  await phase(page, "offered");
  assert.deepEqual(
    await resources(page),
    before,
    "Offering metadata must not read the file or open a peer",
  );
  await action(page, "Approve file").click();
  return before.pcs;
}
async function verify(page, countBefore, filename, payload) {
  await phase(page, "received");
  await page.getByTestId("lab-download").waitFor();
  await closed(page);
  assert.equal(
    (await resources(page)).pcs,
    countBefore + 2,
    "Approval opens two native endpoints",
  );
  assert.equal(await lab(page).getAttribute("data-integrity"), "verified");
  assert(
    await page.evaluate(() =>
      window.__boundaries.configurations.every(
        (config) => config.iceServers?.length === 0,
      ),
    ),
    "The local demo must not add external ICE servers",
  );
  if (payload) {
    const hash = createHash("sha256").update(payload).digest("hex");
    assert.equal(
      (await page.getByTestId("lab-sender-hash").textContent()).trim(),
      hash,
    );
    assert.equal(
      (await page.getByTestId("lab-receiver-hash").textContent()).trim(),
      hash,
    );
    assert.equal(
      Number(await lab(page).getAttribute("data-received-bytes")),
      payload.length,
    );
    assert.equal(
      await page.getByTestId("lab-progress").getAttribute("aria-valuenow"),
      "100",
    );
    const pending = page.waitForEvent("download");
    await page.getByTestId("lab-download").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
    assert.deepEqual(
      await readFile(await download.path()),
      payload,
      "Native download must contain the exact selected bytes",
    );
  }
}
async function failed(page, message) {
  await phase(page, "failed");
  await closed(page);
  assert.match(await lab(page).getByRole("alert").textContent(), message);
  assert.equal(await page.getByTestId("lab-download").count(), 0);
  assert.equal(await lab(page).getAttribute("data-integrity"), "unverified");
  assert(await action(page, "Retry transfer").isEnabled());
}
async function installOfferGate(page) {
  await page.evaluate(() => {
    const original = RTCPeerConnection.prototype.createOffer;
    window.__boundaries.restoreGate = () => {
      RTCPeerConnection.prototype.createOffer = original;
    };
    RTCPeerConnection.prototype.createOffer = function (...args) {
      return original.apply(this, args).then(
        (offer) =>
          new Promise((resolve) => {
            window.__boundaries.releaseGate = () => resolve(offer);
          }),
      );
    };
  });
}
async function waitGate(page, countBefore) {
  await page.waitForFunction(
    (before) =>
      window.__boundaries.pcs.length === before + 2 &&
      typeof window.__boundaries.releaseGate === "function",
    countBefore,
  );
  await phase(page, "connecting");
}
async function releaseGate(page) {
  await page.evaluate(() => {
    window.__boundaries.restoreGate();
    window.__boundaries.releaseGate();
  });
}
async function decodeArtwork(page, locator, kind) {
  await locator.scrollIntoViewIfNeeded();
  const image = await locator.evaluate(async (image) => {
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: new URL(image.currentSrc).pathname,
      alt: image.getAttribute("alt"),
      hidden: image.getAttribute("aria-hidden"),
      reservedWidth: image.getAttribute("width"),
      reservedHeight: image.getAttribute("height"),
    };
  });
  // A width-descriptor srcset makes naturalWidth density-corrected. The
  // independent variant check below verifies each file's raw pixel dimensions.
  assert(
    image.width > 0 && image.height === image.width,
    `${kind}: artwork failed to decode`,
  );
  assert.match(
    image.source,
    new RegExp(`/images/bonjou/${kind}-(256|512)\\.webp$`),
  );
  assert.equal(image.alt, "");
  assert.equal(
    image.hidden,
    "true",
    "Decorative artwork must not replace status or file labels",
  );
  assert(
    Number(image.reservedWidth) > 0 && Number(image.reservedHeight) > 0,
    "Image dimensions reserve real space before decoding",
  );
  assert.equal(
    image.reservedWidth,
    image.reservedHeight,
    "Image space is reserved before decoding",
  );
}
async function openAppAndReturn(page, urls, countBefore) {
  await page
    .locator(".masthead")
    .getByRole("link", { name: "Open Bonjou", exact: true })
    .click();
  await page.getByLabel("Your display name").waitFor();
  assert.equal(
    await lab(page).count(),
    0,
    "Opening the real app unmounts the local demo",
  );
  await closed(page);
  await page.waitForFunction(
    (urls) =>
      urls.every((url) => window.__boundaries.revokedURLs.includes(url)),
    urls,
  );
  assert.equal(
    (await resources(page)).pcs,
    countBefore,
    "App onboarding must not restart the abandoned demo",
  );
  await page.goBack();
  await phase(page, "ready");
  assert.equal(await lab(page).getAttribute("data-integrity"), "unverified");
  assert.equal(await lab(page).getAttribute("data-received-bytes"), "0");
  assert.equal(
    await page.getByTestId("lab-download").count(),
    0,
    "Returning home starts a fresh local demo",
  );
  assert.equal((await resources(page)).pcs, countBefore);
}

await mkdir(OUTPUT, { recursive: true });
const browser = await launch();
try {
  await runCase(browser, "native-limits-and-recovery", async (page) => {
    for (const [filename, payload] of [
      ["empty-boundary.txt", Buffer.alloc(0)],
      ["limit-boundary.bin", bytes(2 * 1024 * 1024)],
    ]) {
      const before = await start(page, filename, payload);
      await verify(page, before, filename, payload);
      await reset(page);
    }
    const payload = bytes(8193);
    const filename = "recovery-boundary.bin";
    // TEST-ONLY CORRUPTION: mutate one native payload chunk, preserving its size.
    await page.evaluate(() => {
      const original = RTCDataChannel.prototype.send;
      window.__boundaries.restoreSend = () => {
        RTCDataChannel.prototype.send = original;
      };
      RTCDataChannel.prototype.send = function (data) {
        if (data instanceof ArrayBuffer && !window.__boundaries.corrupted) {
          const changed = data.slice(0);
          new Uint8Array(changed)[0] ^= 1;
          window.__boundaries.corrupted = true;
          return original.call(this, changed);
        }
        return original.call(this, data);
      };
    });
    await start(page, filename, payload);
    await failed(page, /hashes did not match/);
    assert(await page.evaluate(() => window.__boundaries.corrupted));
    await page.evaluate(() => window.__boundaries.restoreSend());
    let beforeRetry = (await resources(page)).pcs;
    await action(page, "Retry transfer").click();
    await verify(page, beforeRetry, filename, payload);
    await reset(page);

    // TEST-ONLY STALL: hold a real SDP offer. Wait for the unchanged 20 s
    // production timer, rather than replacing timers or shortening the deadline.
    await installOfferGate(page);
    const began = Date.now();
    const before = await start(page, filename, payload);
    await waitGate(page, before);
    await failed(page, /timed out/);
    assert(
      Date.now() - began >= 19_000,
      "A genuine production deadline must elapse",
    );
    await releaseGate(page);
    beforeRetry = (await resources(page)).pcs;
    await action(page, "Retry transfer").click();
    await verify(page, beforeRetry, filename, payload);
  });

  await runCase(browser, "active-demo-navigation-cleanup", async (page) => {
    await action(page, "Dot study").click();
    await page.locator(".lab-poster").waitFor();
    await installOfferGate(page);
    await action(page, "Offer this file").click();
    await phase(page, "offered");
    await action(page, "Approve file").click();
    await waitGate(page, 0);
    const before = await resources(page);
    assert(
      before.urls.length > 0,
      "The owned image preview has a Blob URL to dispose",
    );
    await openAppAndReturn(page, before.urls, before.pcs);
    await releaseGate(page);
    await closed(page);
  });

  await runCase(browser, "received-demo-navigation-cleanup", async (page) => {
    await action(page, "Dot study").click();
    await action(page, "Offer this file").click();
    await phase(page, "offered");
    await action(page, "Approve file").click();
    await verify(page, 0);
    const before = await resources(page);
    assert(
      before.urls.length >= 2,
      "The preview and verified download have separate Blob URLs",
    );
    await openAppAndReturn(page, before.urls, before.pcs);
  });

  await runCase(
    browser,
    "artwork-theme-menu-and-install",
    async (page, context) => {
      for (const [tab, kind] of [
        ["After class", "notes"],
        ["In the studio", "studio"],
        ["At the shared desk", "project"],
      ]) {
        await page
          .locator("#stories")
          .getByRole("tab", { name: tab, exact: true })
          .click();
        await decodeArtwork(
          page,
          page.locator(`#stories img[data-bonjou-art="${kind}"]`),
          kind,
        );
      }
      await decodeArtwork(
        page,
        page.locator('.consent-interlude img[data-bonjou-art="notes"]'),
        "notes",
      );
      // Decode both served sizes, including the variant a 1x viewport may not choose.
      const variants = await page.evaluate(async (kinds) => {
        const result = [];
        for (const kind of kinds)
          for (const edge of [256, 512]) {
            const image = new Image();
            image.src = `/images/bonjou/${kind}-${edge}.webp`;
            await image.decode();
            result.push([kind, edge, image.naturalWidth, image.naturalHeight]);
          }
        return result;
      }, kinds);
      for (const [kind, edge, width, height] of variants) {
        assert.equal(width, edge, `${kind}-${edge}: served artwork dimensions`);
        assert.equal(height, edge);
      }
      const waitTheme = (theme) =>
        page.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme,
        );
      await waitTheme("light");
      await page.emulateMedia({ colorScheme: "dark" });
      await waitTheme("dark");
      await page.emulateMedia({ colorScheme: "light" });
      await waitTheme("light");
      await page
        .locator(".masthead")
        .getByRole("button", { name: "Switch to dark", exact: true })
        .click();
      await waitTheme("dark");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("bonjou.theme")),
        "dark",
      );
      await page.reload();
      await phase(page, "ready");
      await waitTheme("dark");
      await page
        .locator(".masthead")
        .getByRole("button", { name: "Switch to light", exact: true })
        .click();
      await waitTheme("light");
      await page.emulateMedia({ colorScheme: "dark" });
      await waitTheme("light");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("bonjou.theme")),
        "light",
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      const navigation = page.getByRole("dialog", { name: "Explore Bonjou" });
      await navigation.waitFor();
      await page.setViewportSize({ width: 1024, height: 900 });
      await navigation.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => getComputedStyle(document.body).pointerEvents !== "none",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      assert.equal(
        await navigation.count(),
        0,
        "Returning to mobile must not reopen a dismissed navigation drawer",
      );
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await navigation
        .getByRole("link", { name: "Your setup", exact: true })
        .click();
      await navigation.waitFor({ state: "hidden" });
      assert.equal(new URL(page.url()).hash, "#connection");

      if (ENGINE === "chromium") {
        // Real clipboard read/write permissions are supported by Chromium here.
        // WebKit's Playwright permission API does not support this grant.
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const section = page.locator("#install");
        for (const platform of ["macOS", "Linux", "Windows"]) {
          await section
            .getByRole("tab", { name: platform, exact: true })
            .click();
          const terminal = section.locator(".install-main > .terminal");
          const expected = (
            await terminal.locator(".terminal-body code").allTextContents()
          ).join("\n");
          await terminal
            .getByRole("button", { name: "Copy", exact: true })
            .click();
          assert(
            (await page.evaluate(() => navigator.clipboard.readText())) ===
              expected,
            `${platform}: copy excludes the visual shell prompt`,
          );
        }
        await section.getByRole("tab", { name: "Linux", exact: true }).click();
        await section
          .getByRole("button", { name: "Other ways to install", exact: true })
          .click();
        const recipe = section
          .locator(".recipe")
          .filter({ hasText: "Debian · Ubuntu" });
        const expected = (
          await recipe.locator(".terminal-body code").allTextContents()
        ).join("\n");
        assert.equal(expected.split("\n").length, 2);
        await recipe.getByRole("button", { name: "Copy", exact: true }).click();
        assert(
          (await page.evaluate(() => navigator.clipboard.readText())) ===
            expected,
          "Multiline copying retains the real newline",
        );
      }
    },
  );

  await runCase(
    browser,
    "app-empty-artwork",
    async (page) => {
      await page
        .locator(".masthead")
        .getByRole("link", { name: "Open Bonjou", exact: true })
        .click();
      await page
        .getByText("Connected", { exact: true })
        .waitFor({ timeout: 30_000 });
      await decodeArtwork(
        page,
        page.locator('.thread img[data-bonjou-art="nearby"]'),
        "nearby",
      );
      await page.locator(".chip").filter({ hasText: "Received files" }).click();
      await decodeArtwork(
        page,
        page.locator('.thread img[data-bonjou-art="received"]'),
        "received",
      );
      // A second genuine browser process establishes an empty private thread.
      const peerBrowser = await launch();
      const peer = await client(peerBrowser, "Boundary artwork Bob");
      try {
        await peer.page.goto(`${BASE}/app`);
        await peer.page
          .getByText("Connected", { exact: true })
          .waitFor({ timeout: 30_000 });
        const chip = page
          .locator(".chip")
          .filter({ hasText: "Boundary artwork Bob" });
        await chip.waitFor({ timeout: 30_000 });
        await chip.click();
        await decodeArtwork(
          page,
          page.locator('.thread img[data-bonjou-art="notes"]'),
          "notes",
        );
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await decodeArtwork(
            page,
            page.locator('.thread img[data-bonjou-art="notes"]'),
            "notes",
          );
        }
      } finally {
        await peer.context.close();
        await peerBrowser.close();
      }
    },
    "Boundary artwork Alice",
  );

  assert.deepEqual(
    errors,
    [],
    "Unexpected browser errors, including later contexts",
  );
  console.log(
    `Boundaries passed (${ENGINE}): ${checked.join(", ")}. Native 0-byte/2 MiB downloads and hash verification; corrupt receiver/deadline failures with clean retry; demo unmount closes PCs/channels and revokes preview/download URLs; ten artwork variants decode plus story/consent/nearby/received/private usage; system/manual/persisted themes; navigation resize; ${ENGINE === "chromium" ? "real primary/multiline install clipboard round-trip" : "install clipboard skipped: WebKit permission grant unsupported"}. Faults are test-only; deadline uses the unchanged production timer. Physical devices are not covered.`,
  );
} finally {
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
