/** A bounded, native WebRTC loopback demonstration. No Bonjou session or protocol. */

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CHUNK_BYTES = 16 * 1024;
const HIGH_WATER_BYTES = 64 * 1024;
const LOW_WATER_BYTES = 16 * 1024;

export type DemoTransferPhase = "connecting" | "transferring" | "verifying";

export interface DemoTransferProgress {
  phase: DemoTransferPhase;
  receivedBytes: number;
  totalBytes: number;
}

export interface DemoTransferResult {
  blob: Blob;
  filename: string;
  size: number;
  senderHash: string;
  receiverHash: string;
}

interface DemoTransferOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DemoTransferProgress) => void;
  timeoutMs?: number;
}

/** SCTP uses zero to mean no limit. Keep our own small bound in that case. */
export function demoChunkSize(maxMessageSize?: number): number {
  return Number.isFinite(maxMessageSize) && Number(maxMessageSize) > 0
    ? Math.max(1, Math.min(CHUNK_BYTES, Math.floor(Number(maxMessageSize))))
    : CHUNK_BYTES;
}

/** Validate the received size before allocating a downloadable buffer. */
export function joinDemoChunks(
  chunks: Uint8Array[],
  expectedSize: number,
): Uint8Array {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 0 ||
    expectedSize > MAX_FILE_BYTES
  )
    throw new Error("The demo file exceeds its memory limit.");
  const actual = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (actual !== expectedSize)
    throw new Error("The received file size did not match the offer.");
  const bytes = new Uint8Array(expectedSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function stopped(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The demo was cancelled.", "AbortError");
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(stopped(signal));
  return new Promise((resolve, reject) => {
    const abort = () => reject(stopped(signal));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(stopped(signal));
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function waitForChannel(
  channel: RTCDataChannel,
  signal: AbortSignal,
  open: boolean,
): Promise<void> {
  const ready = () =>
    open
      ? channel.readyState === "open"
      : channel.bufferedAmount <= LOW_WATER_BYTES;
  if (signal.aborted) return Promise.reject(stopped(signal));
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const event = open ? "open" : "bufferedamountlow";
    const cleanup = () => {
      channel.removeEventListener(event, check);
      channel.removeEventListener("close", close);
      channel.removeEventListener("error", close);
      signal.removeEventListener("abort", abort);
    };
    const check = () => {
      if (!ready()) return;
      cleanup();
      resolve();
    };
    const close = () => {
      cleanup();
      reject(
        new Error(
          "The local data channel closed before the file was verified.",
        ),
      );
    };
    const abort = () => {
      cleanup();
      reject(stopped(signal));
    };
    channel.addEventListener(event, check);
    channel.addEventListener("close", close, { once: true });
    channel.addEventListener("error", close, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    // Do not miss a low-buffer or open event between the first check and listen.
    if (channel.readyState === "closed" || channel.readyState === "closing")
      close();
    else check();
  });
}

async function digest(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
  const hash = await abortable(
    crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    signal,
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

interface IceInbox {
  pc: RTCPeerConnection;
  ready: boolean;
  pending: RTCIceCandidateInit[];
  tail: Promise<void>;
}

/**
 * Call only after the visitor approves the metadata offer. Both endpoints live
 * in this page. Signaling is passed in memory, and ICE has no STUN/TURN servers.
 * This tests local browser capability, not LAN reachability or protocol v2.
 */
export async function runLocalDemo(
  file: File,
  options: DemoTransferOptions = {},
): Promise<DemoTransferResult> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Choose a file no larger than 2 MiB for this demo.");
  if (!window.isSecureContext || !crypto.subtle)
    throw new Error(
      "This demo needs a secure page and browser cryptography support.",
    );
  if (typeof RTCPeerConnection === "undefined")
    throw new Error("This browser does not provide WebRTC data channels.");

  const controller = new AbortController();
  const signal = controller.signal;
  const externalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new Error("The local demo timed out. You can retry or open Bonjou."),
      ),
    options.timeoutMs ?? 20_000,
  );

  let sender: RTCPeerConnection | null = null;
  let receiver: RTCPeerConnection | null = null;
  let outgoing: RTCDataChannel | null = null;
  let incoming: RTCDataChannel | null = null;
  let done = false;
  let prepared: DemoTransferResult | null = null;
  let resolveComplete!: (result: DemoTransferResult) => void;
  let rejectComplete!: (error: Error) => void;
  const completed = new Promise<DemoTransferResult>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });
  // A failure can precede the point at which sending awaits completion.
  void completed.catch(() => {});
  const abortComplete = () => rejectComplete(stopped(signal));
  signal.addEventListener("abort", abortComplete, { once: true });
  if (signal.aborted) abortComplete();
  const fail = (error: unknown) => {
    if (!done && !signal.aborted)
      controller.abort(
        error instanceof Error
          ? error
          : new Error("The local transfer could not finish."),
      );
  };
  const progress = (phase: DemoTransferPhase, receivedBytes: number) =>
    options.onProgress?.({ phase, receivedBytes, totalBytes: file.size });

  try {
    signal.throwIfAborted();
    progress("connecting", 0);
    const source = new Uint8Array(await abortable(file.arrayBuffer(), signal));
    if (source.byteLength !== file.size)
      throw new Error("The chosen file could not be read completely.");
    const senderHash = await digest(source, signal);

    sender = new RTCPeerConnection({ iceServers: [] });
    receiver = new RTCPeerConnection({ iceServers: [] });
    const a = sender;
    const b = receiver;
    const toA: IceInbox = {
      pc: a,
      ready: false,
      pending: [],
      tail: Promise.resolve(),
    };
    const toB: IceInbox = {
      pc: b,
      ready: false,
      pending: [],
      tail: Promise.resolve(),
    };
    const addCandidate = (inbox: IceInbox, candidate: RTCIceCandidateInit) => {
      if (done || signal.aborted) return;
      if (!inbox.ready) {
        inbox.pending.push(candidate);
        return;
      }
      inbox.tail = inbox.tail
        .then(async () => {
          if (!done && !signal.aborted)
            await inbox.pc.addIceCandidate(candidate);
        })
        .catch(fail);
    };
    const flush = (inbox: IceInbox) => {
      inbox.ready = true;
      for (const candidate of inbox.pending.splice(0))
        addCandidate(inbox, candidate);
    };
    a.onicecandidate = ({ candidate }) => {
      if (candidate) addCandidate(toB, candidate.toJSON());
    };
    b.onicecandidate = ({ candidate }) => {
      if (candidate) addCandidate(toA, candidate.toJSON());
    };
    for (const pc of [a, b])
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed")
          fail(new Error("The local WebRTC connection could not stay open."));
      };

    let received = 0;
    let offered = false;
    let ended = false;
    const chunks: Uint8Array[] = [];
    let receiveTail = Promise.resolve();
    b.ondatachannel = ({ channel }) => {
      incoming = channel;
      channel.binaryType = "arraybuffer";
      channel.onclose = () =>
        fail(new Error("The receiving channel closed before verification."));
      channel.onerror = () =>
        fail(new Error("The receiving channel reported an error."));
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        receiveTail = receiveTail
          .then(async () => {
            signal.throwIfAborted();
            if (typeof data === "string") {
              const frame = JSON.parse(data) as {
                type?: string;
                name?: string;
                size?: number;
                hash?: string;
              };
              if (frame.type === "offer" && !offered && !ended) {
                if (
                  frame.name !== file.name ||
                  frame.size !== file.size ||
                  frame.hash !== senderHash
                )
                  throw new Error(
                    "The demo offer did not match the chosen file.",
                  );
                offered = true;
                progress("transferring", 0);
                return;
              }
              if (frame.type !== "end" || !offered || ended)
                throw new Error(
                  "The demo received an unexpected control message.",
                );
              ended = true;
              const bytes = joinDemoChunks(chunks, file.size);
              progress("verifying", received);
              const receiverHash = await digest(bytes, signal);
              if (receiverHash !== senderHash)
                throw new Error(
                  "The file hashes did not match. Nothing is available to download.",
                );
              prepared = {
                blob: new Blob([new Uint8Array(bytes).buffer], {
                  type: file.type || "application/octet-stream",
                }),
                filename: file.name,
                size: received,
                senderHash,
                receiverHash,
              };
              // Completion also travels back over the real data channel.
              channel.send(
                JSON.stringify({
                  type: "verified",
                  size: received,
                  hash: receiverHash,
                }),
              );
              return;
            }
            if (!(data instanceof ArrayBuffer) || !offered || ended)
              throw new Error(
                "The demo received file bytes outside the approved transfer.",
              );
            if (received + data.byteLength > file.size)
              throw new Error(
                "The receiving side got more bytes than the offer allowed.",
              );
            chunks.push(new Uint8Array(data));
            received += data.byteLength;
            progress("transferring", received);
          })
          .catch(fail);
      };
    };

    const channel = a.createDataChannel("bonjou-local-demo", { ordered: true });
    outgoing = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = LOW_WATER_BYTES;
    channel.onclose = () =>
      fail(new Error("The sending channel closed before verification."));
    channel.onerror = () =>
      fail(new Error("The sending channel reported an error."));
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      try {
        if (typeof data !== "string")
          throw new Error("The demo verification reply was invalid.");
        const frame = JSON.parse(data) as {
          type?: string;
          size?: number;
          hash?: string;
        };
        if (
          !prepared ||
          frame.type !== "verified" ||
          frame.size !== file.size ||
          frame.hash !== senderHash
        )
          throw new Error(
            "The receiving side did not confirm this file's integrity.",
          );
        done = true;
        resolveComplete(prepared);
      } catch (error) {
        fail(error);
      }
    };

    await abortable(
      a.setLocalDescription(await abortable(a.createOffer(), signal)),
      signal,
    );
    if (!a.localDescription)
      throw new Error("The sending side could not create its offer.");
    await abortable(b.setRemoteDescription(a.localDescription), signal);
    flush(toB);
    await abortable(
      b.setLocalDescription(await abortable(b.createAnswer(), signal)),
      signal,
    );
    if (!b.localDescription)
      throw new Error("The receiving side could not answer.");
    await abortable(a.setRemoteDescription(b.localDescription), signal);
    flush(toA);
    await waitForChannel(channel, signal, true);
    const chunkSize = demoChunkSize(a.sctp?.maxMessageSize);
    channel.send(
      JSON.stringify({
        type: "offer",
        name: file.name,
        size: file.size,
        hash: senderHash,
      }),
    );
    for (let offset = 0; offset < source.byteLength; offset += chunkSize) {
      signal.throwIfAborted();
      if (channel.bufferedAmount + chunkSize > HIGH_WATER_BYTES)
        await waitForChannel(channel, signal, false);
      signal.throwIfAborted();
      channel.send(
        new Uint8Array(source.subarray(offset, offset + chunkSize)).buffer,
      );
    }
    channel.send(JSON.stringify({ type: "end" }));
    return await completed;
  } catch (error) {
    // Native exception messages may contain transport detail. Keep recovery
    // copy useful without printing descriptions, candidates, or addresses.
    if (error instanceof DOMException && error.name !== "AbortError")
      throw new Error(
        "This browser could not complete the local demo. Try again or open Bonjou.",
      );
    throw error;
  } finally {
    done = true;
    clearTimeout(deadline);
    options.signal?.removeEventListener("abort", externalAbort);
    signal.removeEventListener("abort", abortComplete);
    // The receiver channel is assigned by an event callback, outside TS's
    // local control-flow narrowing. Close every resource even if one is gone.
    for (const resource of [
      outgoing,
      incoming as RTCDataChannel | null,
      sender,
      receiver,
    ]) {
      try {
        resource?.close();
      } catch {
        // A browser may already have disposed its transport on page exit.
      }
    }
  }
}
