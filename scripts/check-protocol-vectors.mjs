import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = JSON.parse(
  await readFile(new URL("../src/share/vectors/protocol-source.json", import.meta.url), "utf8"),
);
const fixture = await readFile(
  new URL("../src/share/vectors/protocol-v2.json", import.meta.url),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  if (!/^[A-Za-z0-9-]+\/bonjou-cli$/.test(source.repository)
      || !/^[a-f0-9]{40}$/.test(source.revision)
      || !/^[a-f0-9]{64}$/.test(source.sha256)
      || source.path !== "internal/network/testdata/protocol-v2.json") {
    throw new Error("invalid protocol source metadata");
  }
  if (digest(fixture) !== source.sha256) {
    throw new Error("browser vectors differ from the recorded checksum");
  }

  let canonical;
  if (process.argv[2]) {
    canonical = await readFile(resolve(process.argv[2], source.path));
  } else {
    const url = `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${source.path}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`canonical vectors returned HTTP ${response.status}`);
    canonical = Buffer.from(await response.arrayBuffer());
  }
  if (!fixture.equals(canonical)) {
    throw new Error("browser vectors differ from the canonical Go vectors");
  }
  console.log(`Protocol vectors match ${source.repository}@${source.revision.slice(0, 12)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
