import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { ChunkedFrameWriter, importAesKey } from "../src/share/crypto";

const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function worker(size, filename = "test.txt") {
  const listeners = {};
  const scope = {
    location: { origin: "https://bonjou.test" },
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
  };
  const context = {
    self: scope,
    crypto,
    ReadableStream,
    TransformStream,
    Response,
    ByteLengthQueuingStrategy,
    Uint8Array,
    DataView,
    URL,
    TextEncoder,
    Date,
    Map,
    console,
  };
  runInNewContext(source, context);
  const signals = [];
  const dataPort = {
    postMessage: (value) => signals.push(value),
    close: vi.fn(),
    onmessage: null,
  };
  listeners.message({
    data: {
      type: "bonjou-prepare",
      mode: "p2p",
      transferId: "0123456789abcdef",
      filename,
      plaintextSize: size,
      streamKeyHex: "07".repeat(32),
    },
    ports: [{ postMessage: vi.fn() }, dataPort],
  });
  return {
    response: () => context.handleDownload("0123456789abcdef"),
    signals,
    send: (data) => dataPort.onmessage({ data }),
  };
}

async function sealed(bytes) {
  const writer = new ChunkedFrameWriter(
    await importAesKey(new Uint8Array(32).fill(7)),
  );
  return writer.seal(bytes);
}

describe("authenticated download worker", () => {
  it.each([0, 5, 64_000])(
    "confirms %s plaintext bytes only after consuming the stream",
    async (size) => {
      const w = worker(size);
      const response = await w.response();
      const reading = response.arrayBuffer();
      const plain = new Uint8Array(size).fill(3);
      if (size) w.send({ bytes: await sealed(plain) });
      expect(w.signals).not.toContainEqual({ complete: true });
      w.send({ done: true });
      expect(new Uint8Array(await reading)).toEqual(plain);
      expect(w.signals).toContainEqual({ complete: true });
    },
  );

  it.each(["corrupt", "truncated", "wrong size"])(
    "rejects a %s file without success",
    async (fault) => {
      const w = worker(fault === "wrong size" ? 6 : 5);
      const response = await w.response();
      const reading = response.arrayBuffer();
      void reading.catch(() => {});
      let bytes = await sealed(new Uint8Array(5));
      if (fault === "corrupt") bytes[bytes.length - 1] ^= 1;
      if (fault === "truncated") bytes = bytes.slice(0, -1);
      w.send({ bytes });
      w.send({ done: true });
      await expect(reading).rejects.toThrow();
      expect(w.signals.some((signal) => signal.error)).toBe(true);
      expect(w.signals).not.toContainEqual({ complete: true });
    },
  );

  it("preserves Unicode filenames in a valid download header", async () => {
    const w = worker(0, "資料📁.txt");
    const response = await w.response();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''%E8%B3%87%E6%96%99%F0%9F%93%81.txt",
    );
    w.send({ done: true });
    await response.arrayBuffer();
    expect(w.signals).toContainEqual({ complete: true });
  });

  it("reports browser cancellation", async () => {
    const w = worker(5);
    const response = await w.response();
    await response.body.cancel("User cancelled");
    expect(w.signals.some((signal) => signal.error === "User cancelled")).toBe(
      true,
    );
    expect(w.signals).not.toContainEqual({ complete: true });
  });
});
