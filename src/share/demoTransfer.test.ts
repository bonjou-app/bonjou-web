import { describe, expect, it } from "vitest";
import { demoChunkSize, joinDemoChunks } from "./demoTransfer";

describe("local demo receive bounds", () => {
  it("joins view bytes rather than unrelated backing-buffer bytes", () => {
    const backing = Uint8Array.of(9, 1, 2, 8);
    expect(
      joinDemoChunks([backing.subarray(1, 3), Uint8Array.of(3)], 3),
    ).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("rejects a truncated or oversized result before constructing a download", () => {
    expect(() => joinDemoChunks([Uint8Array.of(1, 2)], 3)).toThrow(
      "size did not match",
    );
    expect(() => joinDemoChunks([Uint8Array.of(1, 2)], 1)).toThrow(
      "size did not match",
    );
    expect(() => joinDemoChunks([], 2 * 1024 * 1024 + 1)).toThrow(
      "memory limit",
    );
    expect(() => joinDemoChunks([], -1)).toThrow("memory limit");
  });

  it("respects a smaller negotiated SCTP limit and bounds unlimited peers", () => {
    expect(demoChunkSize(4096)).toBe(4096);
    expect(demoChunkSize(128 * 1024)).toBe(16 * 1024);
    expect(demoChunkSize(0)).toBe(16 * 1024);
    expect(demoChunkSize(Infinity)).toBe(16 * 1024);
    expect(demoChunkSize()).toBe(16 * 1024);
  });
});
