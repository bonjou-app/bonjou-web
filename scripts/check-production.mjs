/** Check the coordinator recorded in the deployed browser build, not a local substitute. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const app = new URL(process.env.APP_URL ?? "https://bonjou.vercel.app");
assert.ok(["https:", "http:"].includes(app.protocol), "APP_URL must use HTTP(S)");
assert.equal(app.username + app.password, "", "Do not put credentials in APP_URL");
const origin = app.origin;
const response = await fetch(`${origin}/coordinator-config.json`, {
  signal: AbortSignal.timeout(10_000),
  cache: "no-store",
});
assert.equal(response.status, 200, "Deployed coordinator configuration must be accessible");
const config = await response.json();
assert.equal(config.version, 1, "Unexpected coordinator configuration version");
if (process.env.EXPECT_APP_REVISION)
  assert.equal(config.revision, process.env.EXPECT_APP_REVISION.toLowerCase(),
    "Production alias is not serving the expected source revision");
const coordinator = new URL(config.coordinator);
assert.ok(["https:", "http:"].includes(coordinator.protocol), "Coordinator must use HTTP(S)");
assert.equal(coordinator.username + coordinator.password + coordinator.search + coordinator.hash, "");
if (app.protocol === "https:") assert.equal(coordinator.protocol, "https:", "HTTPS app needs a secure coordinator");
console.log(`Checking deployed app ${origin}`);
if (config.revision) console.log(`Checking shipped revision ${config.revision}`);
console.log(`Checking shipped coordinator ${coordinator.href}`);
// Allow a bounded readiness interval during hosting startup or maintenance.
// Retry health only; protocol failures below still fail without retries.
const readyUntil = Date.now() + 90_000;
let readinessError;
while (true) {
  try {
    const health = await fetch(`${config.coordinator.replace(/\/+$/, "")}/healthz`, {
      signal: AbortSignal.timeout(Math.min(10_000, Math.max(1, readyUntil - Date.now()))),
      cache: "no-store",
    });
    assert.equal(health.status, 200, "Coordinator health must return HTTP 200");
    const body = await health.json();
    assert.equal(body.status, "ok", "Coordinator health must report ready");
    break;
  } catch (error) {
    readinessError = error;
    if (Date.now() >= readyUntil)
      throw new Error("Deployed coordinator did not become healthy within 90 seconds", { cause: readinessError });
    console.log("Waiting for the deployed coordinator to start…");
    await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, readyUntil - Date.now())));
  }
}
const status = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./smoke-coordinator.mjs", import.meta.url))], {
    env: { ...process.env, COORDINATOR: config.coordinator, APP_ORIGIN: origin },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
if (status !== 0) process.exit(status);
console.log("Deployed coordinator verification passed (room creation, joining, candidates, encrypted signaling, and no payload endpoint)");
