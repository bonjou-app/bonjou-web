/** Run discovery-sharing browser suites sequentially against an existing preview. */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:4173").origin;
const output =
  process.env.E2E_REPORT_DIR ?? join(tmpdir(), `bonjou-e2e-${Date.now()}`);
const checks = [
  ...["ui", "motion", "lan", "experience"].map((suite) => [suite, "chromium"]),
  ...["workflows", "accessibility", "polish", "resilience", "staging"].map(
    (suite) => [suite, "chromium"],
  ),
  ...["ui", "motion", "lan", "experience"].map((suite) => [suite, "webkit"]),
  ["cross-browser", "mixed"],
  ["boundaries", "chromium"],
  ["boundaries", "webkit"],
  ["smoke", "coordinator"],
];
const only = process.argv
  .find((argument) => argument.startsWith("--only="))
  ?.slice(7)
  .split(",");
let results = [];
const currentRun = [];
await mkdir(output, { recursive: true });
try {
  const previous = JSON.parse(
    await readFile(join(output, "results.json"), "utf8"),
  );
  if (previous.origin !== origin)
    throw new Error("Evidence directory belongs to another preview origin.");
  results = previous.results;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(`Sequential end-to-end checks: ${origin}; evidence: ${output}`);
for (const [suite, engine] of checks) {
  const name = `${suite}-${engine}`;
  if (only && !only.includes(name)) continue;
  const started = new Date().toISOString();
  const start = performance.now();
  const env = {
    ...process.env,
    APP_URL: suite === "lan" ? `${origin}/app` : origin,
    COORDINATOR: process.env.COORDINATOR ?? "http://127.0.0.1:46330",
    PLAYWRIGHT_ENGINE: engine === "webkit" ? "webkit" : "chromium",
    UI_SCREENSHOTS: join(output, name),
    POLISH_SCREENSHOTS: join(output, name),
    EXPERIENCE_SCREENSHOTS: join(output, name),
    BOUNDARIES_SCREENSHOTS: join(output, name),
    LAN_SCREENSHOTS: join(output, name),
  };
  const script =
    suite === "smoke"
      ? "scripts/smoke-coordinator.mjs"
      : `scripts/e2e-${suite}.mjs`;
  console.log(`Checking ${name}`);
  let log = "";
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        log += text;
        process.stdout.write(text);
      });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const logFile = `${name}-${results.filter((result) => result.name === name).length + 1}.log`;
  await writeFile(join(output, logFile), log);
  const result = {
    name,
    logFile,
    started,
    durationSeconds: Number(((performance.now() - start) / 1000).toFixed(2)),
    ...status,
  };
  results.push(result);
  currentRun.push(result);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ origin, results }, null, 2) + "\n",
  );
  if (status.code !== 0) {
    console.error(
      `Failed ${name}. Remaining checks were not run. Evidence: ${output}`,
    );
    process.exitCode = 1;
    break;
  }
}
if (currentRun.length && currentRun.every((result) => result.code === 0))
  console.log(
    `Passed ${currentRun.length} sequential checks. Evidence: ${output}`,
  );
if (!currentRun.length)
  throw new Error("No matching end-to-end checks were selected.");
