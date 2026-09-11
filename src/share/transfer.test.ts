import { describe, expect, it, vi } from "vitest";

import { ChunkedFrameReader, importAesKey } from "./crypto";
import { downloadPortSink, sendOverChannel } from "./transfer";

describe("direct file transport", () => {
  it("streams authenticated frames without making an HTTP request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const plaintext = new Uint8Array(150_000);
    for (let i = 0; i < plaintext.length; i += 1) plaintext[i] = i % 251;
    const key = await importAesKey(new Uint8Array(32).fill(7));
    const frames: Uint8Array[] = [];

    await sendOverChannel({
      channel: {
        async sendData(bytes) {
          frames.push(bytes.slice());
        },
      },
      source: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(plaintext.subarray(0, 31_000));
          controller.enqueue(plaintext.subarray(31_000, 111_000));
          controller.enqueue(plaintext.subarray(111_000));
          controller.close();
        },
      }),
      streamKey: key,
    });

    const reader = new ChunkedFrameReader(key);
    const opened: Uint8Array[] = [];
    for (const frame of frames) opened.push(await reader.push(frame));
    const result = new Uint8Array(
      opened.reduce((sum, part) => sum + part.length, 0),
    );
    let offset = 0;
    for (const part of opened) {
      result.set(part, offset);
      offset += part.length;
    }

    expect(result).toEqual(plaintext);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("download completion", () => {
  function helper() {
    const port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessageerror: null,
    };
    const sink = downloadPortSink(port as unknown as MessagePort);
    const emit = (data: unknown) => port.onmessage?.({ data });
    emit({ open: true });
    return { port, sink, emit };
  }

  it("waits for the worker to authenticate the completed file", async () => {
    const { port, sink, emit } = helper();
    await sink.ready;
    await sink.write(new Uint8Array([1]));
    const onDone = vi.fn();
    const completed = sink.close().then(onDone);
    await Promise.resolve();
    expect(onDone).not.toHaveBeenCalled();
    expect(port.close).not.toHaveBeenCalled();
    emit({ complete: true });
    await completed;
    expect(onDone).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it("fails a corrupt final frame instead of reporting success", async () => {
    const { sink, emit } = helper();
    const completed = sink.close();
    emit({ error: "chunk failed authentication" });
    await expect(completed).rejects.toThrow("authentication");
    await expect(sink.write(new Uint8Array([1]))).rejects.toThrow(
      "authentication",
    );
  });

  it("cancellation releases a paused write and fails future writes", async () => {
    const { sink, emit } = helper();
    emit({ pause: true });
    const writing = sink.write(new Uint8Array([1]));
    emit({ cancelled: "Cancelled in browser" });
    await expect(writing).rejects.toThrow("Cancelled");
    await expect(sink.finished).rejects.toThrow("Cancelled");
  });
});

describe("upload cancellation", () => {
  it("cancels a source whose read has stalled", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    const abort = new AbortController();
    const sending = sendOverChannel({
      channel: { sendData: vi.fn() },
      source,
      streamKey: await importAesKey(new Uint8Array(32)),
      signal: abort.signal,
    });
    abort.abort(new Error("Stopped"));
    await expect(sending).rejects.toThrow("Stopped");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("stops between frames of a large source chunk", async () => {
    const abort = new AbortController();
    const sendData = vi.fn(async () => abort.abort(new Error("Stopped")));
    await expect(
      sendOverChannel({
        channel: { sendData },
        source: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(500_000));
            c.close();
          },
        }),
        streamKey: await importAesKey(new Uint8Array(32)),
        signal: abort.signal,
      }),
    ).rejects.toThrow("Stopped");
    expect(sendData).toHaveBeenCalledOnce();
  });
});
