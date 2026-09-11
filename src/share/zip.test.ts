import { describe, expect, it, vi } from "vitest";
import { zipSize, zipStream } from "./zip";

describe("folder streaming", () => {
  it("only reads a payload chunk when the consumer requests it", async () => {
    const read = vi.fn(async () => new ArrayBuffer(1024));
    const data = { slice: () => ({ arrayBuffer: read }) } as unknown as Blob;
    const stream = zipStream(
      [{ name: "folder/file.bin", size: 16 * 1024, lastModified: 0, data }],
      1024,
    );
    const reader = stream.getReader();
    await reader.read(); // ZIP header.
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    await reader.read();
    expect(read).toHaveBeenCalledOnce();
    await reader.cancel();
    await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "matches the advertised size with ZIP64=%s",
    async (zip64) => {
      const entries = [
        {
          name: "folder/hello.txt",
          size: 5,
          lastModified: 0,
          data: new Blob(["hello"]),
        },
        {
          name: "folder/empty.txt",
          size: 0,
          lastModified: 0,
          data: new Blob([]),
        },
      ];
      const bytes = await new Response(
        zipStream(entries, 2, zip64),
      ).arrayBuffer();
      expect(bytes.byteLength).toBe(zipSize(entries, zip64));
      expect(new TextDecoder().decode(bytes)).toContain("folder/hello.txt");
    },
  );
});

it("uses ZIP64 when headers push the directory past the ZIP32 offset limit", async () => {
  const read = vi.fn();
  const data = { slice: () => ({ arrayBuffer: read }) } as unknown as Blob;
  const entries = [
    { name: "folder/file.bin", size: 4_294_967_280, lastModified: 0, data },
  ];
  const reader = zipStream(entries).getReader();
  const { value } = await reader.read();
  expect(new DataView(value!.buffer).getUint16(4, true)).toBe(45);
  expect(zipSize(entries)).toBe(zipSize(entries, true));
  expect(read).not.toHaveBeenCalled();
  await reader.cancel();
});
