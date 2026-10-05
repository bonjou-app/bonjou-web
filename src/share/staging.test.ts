import { describe, expect, it, vi } from "vitest";

import { stageBatches, submitStage } from "./staging";
import { entriesFor, zipSize } from "./zip";

const nextId = () => {
  let id = 0;
  return () => String(id++);
};

describe("local file staging", () => {
  it("builds removable loose files without opening their payloads", () => {
    const files = [
      new File(["first"], "first.txt", { type: "text/plain" }),
      new File(["second"], "second.png", { type: "image/png" }),
    ];
    const readers = files.flatMap((file) => [
      vi.spyOn(file, "arrayBuffer"),
      vi.spyOn(file, "stream"),
      vi.spyOn(file, "slice"),
    ]);
    const staged = stageBatches(files, false, nextId());
    expect(
      staged.map(({ name, size, folder }) => ({ name, size, folder })),
    ).toEqual([
      { name: "first.txt", size: 5, folder: false },
      { name: "second.png", size: 6, folder: false },
    ]);
    expect(staged[0].files[0]).toBe(files[0]);
    expect(staged[1].files[0]).toBe(files[1]);
    readers.forEach((reader) => expect(reader).not.toHaveBeenCalled());
  });

  it("keeps folder paths together and reports the actual archive size without reading bytes", () => {
    const files = [new File(["notes"], "plan.txt"), new File([], "empty.txt")];
    Object.defineProperty(files[0], "webkitRelativePath", {
      value: "weekend/notes/plan.txt",
    });
    Object.defineProperty(files[1], "webkitRelativePath", {
      value: "weekend/empty.txt",
    });
    const readers = files.flatMap((file) => [
      vi.spyOn(file, "arrayBuffer"),
      vi.spyOn(file, "stream"),
      vi.spyOn(file, "slice"),
    ]);
    const staged = stageBatches(files, true, nextId());
    files.pop();
    expect(staged).toHaveLength(1);
    expect(staged[0].name).toBe("weekend.zip");
    expect(staged[0].folder).toBe(true);
    expect(staged[0].files.map((file) => file.webkitRelativePath)).toEqual([
      "weekend/notes/plan.txt",
      "weekend/empty.txt",
    ]);
    expect(staged[0].size).toBe(zipSize(entriesFor(staged[0].files)));
    readers.forEach((reader) => expect(reader).not.toHaveBeenCalled());
  });

  it("holds one destination snapshot while awaited offers and conversation selection change", async () => {
    const audience = ["bob"];
    const batches = stageBatches(
      [new File(["a"], "a.txt"), new File(["b"], "b.txt")],
      false,
      nextId(),
    );
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received: string[][] = [];
    const pending = submitStage(batches, audience, async (targets) => {
      received.push([...targets]);
      targets[0] = "mutated by callback";
      if (received.length === 1) await gate;
    });
    audience[0] = "charlie";
    release!();
    expect(await pending).toEqual({ submitted: ["0", "1"] });
    expect(received).toEqual([["bob"], ["bob"]]);
  });

  it("preserves the failed and unattempted batches after a rejected metadata offer", async () => {
    const batches = stageBatches(
      [
        new File(["a"], "a.txt"),
        new File(["b"], "b.txt"),
        new File(["c"], "c.txt"),
      ],
      false,
      nextId(),
    );
    const attempted: string[] = [];
    const result = await submitStage(
      batches,
      ["bob"],
      async (_targets, files) => {
        const name = files[0].name;
        attempted.push(name);
        files.pop();
        if (name === "b.txt") throw new Error("Connection closed.");
      },
    );
    expect(result).toEqual({ submitted: ["0"], error: "Connection closed." });
    expect(attempted).toEqual(["a.txt", "b.txt"]);
    expect(
      batches
        .filter((batch) => !result.submitted.includes(batch.id))
        .map((batch) => batch.files[0].name),
    ).toEqual(["b.txt", "c.txt"]);
  });

  it("does not submit anything until a destination exists", async () => {
    const submit = vi.fn();
    const batches = stageBatches([new File(["a"], "a.txt")], false, nextId());
    expect(await submitStage(batches, [], submit)).toEqual({ submitted: [] });
    expect(submit).not.toHaveBeenCalled();
  });
});
