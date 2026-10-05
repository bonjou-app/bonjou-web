/** Direct file streaming and download-worker integration. */

import {
  ChunkedFrameWriter,
  STREAM_CHUNK_PLAIN_BYTES,
  framedLength,
  toHex,
} from "./crypto";

function takeExact(queue: Uint8Array[], want: number): Uint8Array {
  const out = new Uint8Array(want);
  let filled = 0;
  while (filled < want) {
    const head = queue[0];
    const need = want - filled;
    if (head.length <= need) {
      out.set(head, filled);
      filled += head.length;
      queue.shift();
    } else {
      out.set(head.subarray(0, need), filled);
      queue[0] = head.subarray(need);
      filled = want;
    }
  }
  return out;
}

export interface ChannelUploadOptions {
  channel: { sendData: (bytes: Uint8Array) => Promise<void> };
  source: ReadableStream<Uint8Array>;
  streamKey: CryptoKey;
  onProgress?: (plaintextBytesSent: number) => void;
  signal?: AbortSignal;
}

/** Seals and sends a stream directly to its approved recipient. */
export async function sendOverChannel(
  options: ChannelUploadOptions,
): Promise<void> {
  const { channel, source, streamKey, onProgress, signal } = options;
  const writer = new ChunkedFrameWriter(streamKey);
  let plaintextSent = 0;

  const seal = async (plaintext: Uint8Array): Promise<void> => {
    signal?.throwIfAborted();
    const frame = await writer.seal(plaintext);
    signal?.throwIfAborted();
    await channel.sendData(frame);
    signal?.throwIfAborted();
    plaintextSent += plaintext.length;
    onProgress?.(plaintextSent);
  };

  const pending: Uint8Array[] = [];
  let pendingBytes = 0;
  const reader = source.getReader();
  const cancel = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (!value || value.length === 0) continue;
      pending.push(value);
      pendingBytes += value.length;
      while (pendingBytes >= STREAM_CHUNK_PLAIN_BYTES) {
        await seal(takeExact(pending, STREAM_CHUNK_PLAIN_BYTES));
        pendingBytes -= STREAM_CHUNK_PLAIN_BYTES;
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  signal?.throwIfAborted();
  if (pendingBytes > 0) await seal(takeExact(pending, pendingBytes));
  onProgress?.(plaintextSent);
}

export function serviceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!serviceWorkerSupported()) {
    throw new Error(
      "this browser cannot stream downloads to disk because service workers are unavailable",
    );
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export interface DirectDownloadOptions {
  transferId: string;
  filename: string;
  plaintextSize: number;
  streamKey: Uint8Array;
}

export interface DownloadSink {
  write(bytes: Uint8Array): Promise<void>;
  readonly finished: Promise<void>;
  close(): Promise<void>;
  abort(reason: string): void;
}

/** Prepares a download fed only by a peer-to-peer data channel. */
export async function startDirectDownload(
  options: DirectDownloadOptions,
): Promise<DownloadSink> {
  const worker = await activeWorker();
  const data = new MessageChannel();

  await requestFromWorker(
    worker,
    {
      type: "bonjou-prepare",
      mode: "p2p",
      transferId: options.transferId,
      filename: options.filename,
      plaintextSize: options.plaintextSize,
      streamKeyHex: toHex(options.streamKey),
    },
    [data.port2],
  );

  const sink = downloadPortSink(data.port1);
  openDownloadFrame(options.transferId);
  await sink.ready;
  return sink;
}

/** The worker acknowledges authenticated plaintext, not just queued ciphertext. */
export function downloadPortSink(
  port: MessagePort,
): DownloadSink & { ready: Promise<void> } {
  let error: Error | null = null;
  let ended = false;
  let settled = false;
  let paused = false;
  let resume: (() => void) | null = null;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveFinished!: () => void;
  let rejectFinished!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const finished = new Promise<void>((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });
  // Either promise can fail before the caller starts awaiting it.
  void ready.catch(() => {});
  void finished.catch(() => {});
  let timer = setTimeout(
    () => fail("The download helper did not start. Try again."),
    10_000,
  );
  const cleanup = () => {
    clearTimeout(timer);
    resume?.();
    resume = null;
    port.close();
  };
  const fail = (reason: string) => {
    if (settled) return;
    error = new Error(reason);
    settled = true;
    rejectReady(error);
    rejectFinished(error);
    cleanup();
  };
  port.onmessage = ({ data }) => {
    if (settled || !data) return;
    if (data.open) {
      clearTimeout(timer);
      resolveReady();
    } else if (data.complete && ended) {
      settled = true;
      resolveFinished();
      cleanup();
    } else if (data.error || data.cancelled) {
      fail(String(data.error || data.cancelled));
    } else if (data.pause) {
      paused = true;
    } else if (data.resume) {
      paused = false;
      resume?.();
      resume = null;
    }
  };
  port.onmessageerror = () => fail("The download helper lost its connection.");
  return {
    ready,
    finished,
    async write(bytes) {
      if (error) throw error;
      if (ended || settled) throw new Error("The download is already closed.");
      if (paused)
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      if (error) throw error;
      if (ended || settled) throw new Error("The download is already closed.");
      const copy = bytes.slice();
      port.postMessage({ bytes: copy.buffer }, [copy.buffer]);
    },
    close() {
      if (!ended && !settled) {
        ended = true;
        timer = setTimeout(
          () => fail("The download helper did not confirm completion."),
          60_000,
        );
        port.postMessage({ done: true });
      }
      return finished;
    },
    abort(reason) {
      if (!settled) port.postMessage({ error: reason });
      fail(reason);
    },
  };
}

async function activeWorker(): Promise<ServiceWorker> {
  const registration = await registerServiceWorker();
  const worker = registration.active;
  if (!worker) {
    throw new Error("the download helper is not ready yet; try again");
  }
  return worker;
}

function openDownloadFrame(transferId: string): void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = `/dl/${transferId}`;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}

function requestFromWorker(
  worker: ServiceWorker,
  message: Record<string, unknown>,
  extraPorts: MessagePort[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () => reject(new Error("the download helper did not respond")),
      5000,
    );
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const data = event.data as { ok?: boolean; error?: string };
      if (data?.ok) resolve();
      else reject(new Error(data?.error ?? "the download helper failed"));
    };
    worker.postMessage(message, [channel.port2, ...extraPorts]);
  });
}

export function cipherSizeFor(fileSize: number): number {
  return framedLength(fileSize);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
