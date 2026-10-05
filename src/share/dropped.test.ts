import { describe, expect, it } from "vitest";

import { fromDataTransfer } from "./dropped";

function fileEntry(name: string, file?: File) {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(resolve: (file: File) => void, reject: (error: unknown) => void) {
      if (file) resolve(file);
      else reject(new Error("permission denied"));
    },
  };
}

function directoryEntry(
  name: string,
  batches: unknown[][],
  failAfter?: number,
) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let index = 0;
      return {
        readEntries(
          resolve: (entries: unknown[]) => void,
          reject: (error: unknown) => void,
        ) {
          if (index === failAfter) reject(new Error("directory unreadable"));
          else resolve(batches[index++] ?? []);
        },
      };
    },
  };
}

function transferFor(entries: unknown[]): DataTransfer {
  return {
    items: entries.map((entry) => ({
      kind: "file",
      webkitGetAsEntry: () => entry,
    })),
    files: [],
  } as unknown as DataTransfer;
}

describe("folder drops", () => {
  it("captures entries before the drop expires and preserves nested paths across batches", async () => {
    const first = new File(["first"], "first.txt");
    const second = new File(["second"], "second.txt");
    const transfer = transferFor([
      directoryEntry("notes", [
        [fileEntry("first.txt", first)],
        [directoryEntry("drafts", [[fileEntry("second.txt", second)]])],
      ]),
    ]);
    const pending = fromDataTransfer(transfer);
    Object.assign(transfer, { items: [], files: [] });
    const payload = await pending;
    expect(payload.asFolder).toBe(true);
    expect(payload.files.map((file) => file.webkitRelativePath)).toEqual([
      "notes/first.txt",
      "notes/drafts/second.txt",
    ]);
  });

  it("refuses an incomplete folder when any file cannot be read", async () => {
    const transfer = transferFor([
      directoryEntry("notes", [
        [
          fileEntry("readable.txt", new File(["safe"], "readable.txt")),
          fileEntry("private.txt"),
        ],
      ]),
    ]);
    await expect(fromDataTransfer(transfer)).rejects.toThrow(
      'Could not read "notes/private.txt". Nothing was offered.',
    );
  });

  it("refuses an incomplete folder when reading a later batch fails", async () => {
    const transfer = transferFor([
      directoryEntry(
        "notes",
        [[fileEntry("readable.txt", new File(["safe"], "readable.txt"))]],
        1,
      ),
    ]);
    await expect(fromDataTransfer(transfer)).rejects.toThrow(
      'Could not read folder "notes". Nothing was offered.',
    );
  });
});
