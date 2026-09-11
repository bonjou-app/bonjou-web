/** Real-browser regression coverage for session, navigation and download workflows. */
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const browsers = [],
  errors = [];
const files = await mkdtemp(join(tmpdir(), "bonjou-workflows-"));
async function client(name) {
  // Separate processes model actual browsers and preserve default mDNS ICE.
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
  await context.addInitScript((name) => {
    localStorage.setItem("bonjou.name", name);
    localStorage.setItem("bonjou.theme", "light");
  }, name);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/app`);
  await page.getByText("Connected", { exact: true }).waitFor();
  return { page, context };
}
async function bytes(download) {
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
}
async function select(page, name) {
  await page.locator(".chip").filter({ hasText: name }).click();
}
async function closeDialog(page) {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function offer(alice, bob, file) {
  await alice.locator(".composer input[type=file]").first().setInputFiles(file);
  await bob.getByText(file.name, { exact: true }).waitFor();
  const received = bob.waitForEvent("download");
  await bob.getByRole("button", { name: "Approve", exact: true }).click();
  return received;
}
try {
  const { page: alice, context: aliceContext } = await client("Alice");
  const { page: bob } = await client("Bob");
  await alice
    .getByRole("searchbox", { name: "Search people" })
    .fill("nobody matches");
  await alice.getByText("Nobody here matches that.", { exact: true }).waitFor();
  await alice.getByRole("searchbox", { name: "Search people" }).fill("");
  await alice.keyboard.press("Control+k");
  await alice.getByPlaceholder("Type a command or a name").fill("Bob");
  await alice.getByRole("option", { name: "Bob", exact: true }).click();
  await select(bob, "Alice");
  await alice.locator("textarea").fill("A draft for Bob");
  await select(alice, "Everyone here");
  assert.equal(await alice.locator("textarea").inputValue(), "");
  await alice.locator("textarea").fill("A different group draft");
  await select(alice, "Bob");
  assert.equal(await alice.locator("textarea").inputValue(), "A draft for Bob");
  await alice.getByRole("link", { name: "Bonjou home" }).click();
  await alice.getByRole("heading", { name: /Right here/ }).waitFor();
  assert.equal(await alice.locator(".workspace").isVisible(), false);
  await alice
    .getByRole("button", { name: "Start sharing", exact: true })
    .click();
  assert.equal(await alice.locator("textarea").inputValue(), "A draft for Bob");
  await alice
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await alice.getByLabel("Name others see").fill("Alicia");
  await alice.getByRole("button", { name: "Save", exact: true }).click();
  await closeDialog(alice);
  await bob.locator(".chip").filter({ hasText: "Alicia" }).waitFor();
  assert.equal(
    await alice.locator("textarea").inputValue(),
    "A draft for Bob",
    "renaming must not recreate the peer connection",
  );
  await alice
    .getByRole("button", { name: "Verify security fingerprint" })
    .click();
  await bob
    .getByRole("button", { name: "Verify security fingerprint" })
    .click();
  assert.deepEqual(
    await alice.locator(".fingerprint span").allTextContents(),
    await bob.locator(".fingerprint span").allTextContents(),
  );
  assert.equal(await alice.locator(".fingerprint span").count(), 8);
  await alice.getByRole("button", { name: "They match" }).click();
  await bob.getByRole("button", { name: "They match" }).click();
  await alice
    .getByRole("button", { name: "Verify security fingerprint" })
    .waitFor();
  await alice.locator("textarea").fill("");

  // A transfer larger than the receive window exercises end-to-end credit flow.
  const large = Buffer.alloc(10 * 1024 * 1024, 73);
  const download = await offer(alice, bob, {
    name: "資料📁.txt",
    mimeType: "text/plain",
    buffer: large,
  });
  assert.equal(download.suggestedFilename(), "資料📁.txt");
  assert.deepEqual(await bytes(download), large);
  await alice.getByText("Sent", { exact: true }).waitFor();
  const empty = await offer(alice, bob, {
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(0),
  });
  assert.equal((await bytes(empty)).length, 0);
  await bob.getByRole("button", { name: /Received files/ }).click();
  await bob.getByText("empty.txt", { exact: true }).waitFor();
  await select(bob, "Alicia");

  const directory = join(files, "weekend");
  await mkdir(join(directory, "notes"), { recursive: true });
  await writeFile(join(directory, "notes", "plan.txt"), "Meet at ten.");
  await writeFile(join(directory, "empty.txt"), "");
  await alice
    .locator(".composer input[webkitdirectory]")
    .setInputFiles(directory);
  await bob.getByText("weekend.zip", { exact: true }).waitFor();
  await bob.getByRole("button", { name: "This session's transfers" }).click();
  await bob
    .getByRole("dialog")
    .getByText("Awaiting your approval", { exact: true })
    .waitFor();
  await closeDialog(bob);
  const zipped = bob.waitForEvent("download");
  await bob.getByRole("button", { name: "Approve", exact: true }).click();
  const zip = await bytes(await zipped);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert(zip.includes(Buffer.from("notes/plan.txt")));
  assert(zip.includes(Buffer.from("Meet at ten.")));

  await alice.locator(".rail-room-open").click();
  await alice.getByRole("tab", { name: "Join a room", exact: true }).click();
  await alice.getByLabel("Room code").fill("ZZZ-ZZZ");
  await alice.getByRole("button", { name: "Join", exact: true }).click();
  await alice.getByRole("alert").waitFor();
  assert(
    await alice.getByRole("button", { name: "Join", exact: true }).isEnabled(),
  );
  await alice.getByRole("tab", { name: "Create a room", exact: true }).click();
  await alice.getByRole("button", { name: "Open a room", exact: true }).click();
  await alice.locator(".room-code code").waitFor();
  const currentCode = await alice.locator(".room-code code").textContent();
  await aliceContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  await alice.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal(
    await alice.evaluate(() => navigator.clipboard.readText()),
    currentCode,
  );
  await alice.getByRole("button", { name: "Copy link", exact: true }).click();
  assert.equal(
    await alice.evaluate(() => navigator.clipboard.readText()),
    `${BASE}/r/${currentCode}`,
  );
  await alice.getByRole("button", { name: "Leave room", exact: true }).click();
  await closeDialog(alice);
  await select(alice, "Bob");
  await bob.locator(".chip").filter({ hasText: "Alicia" }).waitFor();

  // A marketing-only tab must not compete for the Web Lock.
  const landing = await aliceContext.newPage();
  await landing.goto(BASE);
  await landing.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(
    await landing.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((e) => e.name.includes("ShareApp")),
    ),
    false,
  );
  await landing
    .getByRole("button", { name: "Start sharing", exact: true })
    .click();
  await landing.getByRole("heading", { name: /Bonjou is running/ }).waitFor();
  await landing.getByRole("button", { name: "Use it in this tab" }).click();
  await landing.getByText("Connected", { exact: true }).waitFor();
  await alice.getByRole("heading", { name: /Bonjou is running/ }).waitFor();
  // A room link must time out and must not silently rejoin on reconnect.
  const stalledBrowser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  browsers.push(stalledBrowser);
  const stalledContext = await stalledBrowser.newContext();
  await stalledContext.addInitScript(() =>
    localStorage.setItem("bonjou.name", "Timeout check"),
  );
  const commands = [];
  await stalledContext.routeWebSocket(/\/ws$/, (socket) => {
    socket.onMessage((raw) => commands.push(JSON.parse(String(raw))));
  });
  const stalled = await stalledContext.newPage();
  await stalled.goto(`${BASE}/r/ABC-234`);
  await stalled
    .getByText(
      "The room did not respond. Check your connection and try again.",
      { exact: true },
    )
    .waitFor({ timeout: 20_000 });
  await stalled.waitForTimeout(800);
  assert.equal(new URL(stalled.url()).pathname, "/app");
  assert.equal(commands.filter((command) => command.type === "join").length, 1);
  assert(commands.filter((command) => command.type === "hello").length >= 2);
  assert.deepEqual(errors, []);
  console.log(
    "Workflows passed: drafts, home round-trip, name update, matching verification, Unicode/10 MB/empty/folder downloads, history, invalid room recovery, room exit, tab handoff, room-link timeout.",
  );
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  await rm(files, { recursive: true, force: true });
}
