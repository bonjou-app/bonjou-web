/** Session state for local discovery, direct chat, and direct file transfer. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ENVELOPE_KINDS,
  deriveStreamKey,
  fromHex,
  generateKeyPair,
  importAesKey,
  sessionFingerprint,
  toHex,
  type Envelope,
  type KeyPair,
} from "./crypto";
import {
  CoordinatorClient,
  describe,
  type Candidate,
  type ConnectionStatus,
  type Peer,
} from "./coordinator";
import { useSiblingTabs } from "./tabs";
import {
  cipherSizeFor,
  registerServiceWorker,
  sendOverChannel,
  serviceWorkerSupported,
  startDirectDownload,
  type DownloadSink,
} from "./transfer";
import {
  LinkRegistry,
  isRtcSignalKind,
  rtcSupported,
  type ChannelControl,
} from "./webrtc";
import { entriesFor, folderNameFor, zipSize, zipStream } from "./zip";

export const COORDINATOR_BASE = (
  import.meta.env.VITE_COORDINATOR_URL ??
  import.meta.env.VITE_RELAY_URL ??
  "https://bonjou.80-225-228-65.sslip.io"
).replace(/\/$/, "");

const COORDINATOR_WS = `${COORDINATOR_BASE.replace(/^http/, "ws")}/ws`;
const CONTROL_TIMEOUT_MS = 15_000;
const COMPLETE_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_PAYLOADS = 4;
const MAX_TEXT_LENGTH = 16 * 1024;
const REQUEST_ID = /^[0-9a-f]{16}$/;
const STREAM_ID = /^[0-9a-f]{32}$/;

export type OutgoingState =
  "offered" | "sending" | "done" | "failed" | "declined";
export type IncomingState =
  | "pending"
  | "approved"
  | "receiving"
  | "verifying"
  | "done"
  | "failed"
  | "declined";

export interface OutgoingItem {
  requestId: string;
  peerId: string;
  peerName: string;
  size: number;
  openStream: () => ReadableStream<Uint8Array>;
  label: string;
  streamId: Uint8Array;
  state: OutgoingState;
  sentBytes: number;
  error?: string;
  at: number;
  groupId: string;
  folder?: boolean;
}

export interface IncomingItem {
  requestId: string;
  from: string;
  fromName: string;
  name: string;
  size: number;
  streamId: string;
  state: IncomingState;
  error?: string;
  at: number;
  note?: string;
  receivedBytes?: number;
}

export interface ChatLine {
  id: string;
  peerIds: string[];
  from: string;
  text: string;
  at: number;
  outbound: boolean;
}

export type ThreadEvent =
  | {
      kind: "message";
      id: string;
      at: number;
      peerIds: string[];
      line: ChatLine;
    }
  | {
      kind: "incoming";
      id: string;
      at: number;
      peerIds: string[];
      item: IncomingItem;
    }
  | {
      kind: "outgoing";
      id: string;
      at: number;
      peerIds: string[];
      item: OutgoingItem;
    };

export const EVERYONE = "everyone";

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

const PROGRESS_INTERVAL_MS = 100;

function throttleProgress(
  emit: (bytes: number) => void,
): (bytes: number) => void {
  let lastAt = 0;
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (bytes: number) => {
    latest = bytes;
    const now = Date.now();
    const since = now - lastAt;
    if (since >= PROGRESS_INTERVAL_MS) {
      lastAt = now;
      emit(latest);
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      lastAt = Date.now();
      emit(latest);
    }, PROGRESS_INTERVAL_MS - since);
  };
}

function roomCodeFromLocation(): string {
  const fromPath = /^\/r\/([^/]+)/.exec(window.location.pathname);
  if (fromPath) {
    try {
      return decodeURIComponent(fromPath[1]);
    } catch {
      return fromPath[1];
    }
  }
  return new URLSearchParams(window.location.search).get("r") ?? "";
}

export function sanitizePeerName(raw: string): string {
  const clean = [...raw.trim()]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return [...clean].slice(0, 64).join("") || "Nearby user";
}

function sanitizeFilename(raw: string): string {
  const clean = sanitizePeerName(raw).replace(/[/\\]/g, "_");
  return clean === "Nearby user" ? "download" : clean.slice(0, 200);
}

function envelopeFor(
  kind: string,
  from: string,
  fields: Partial<Envelope>,
): Envelope {
  return {
    kind,
    from,
    from_ip: "",
    to: "",
    name: "",
    size: 0,
    ts: Math.floor(Date.now() / 1000),
    message: "",
    checksum: "",
    hmac: "",
    ...fields,
  };
}

export function useSession(name: string, active: boolean) {
  const nameRef = useRef(name);
  nameRef.current = name;
  const [connectionGeneration, reconnect] = useState(0);
  const [roomPending, setRoomPending] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const roomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identity = useMemo<KeyPair>(() => generateKeyPair(), []);
  const clientRef = useRef<CoordinatorClient | null>(null);
  const linksRef = useRef<LinkRegistry | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [code, setCode] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selfPeerId, setSelfPeerId] = useState("");
  const siblingTabs = useSiblingTabs(selfPeerId);
  const siblingTabsRef = useRef(siblingTabs);
  siblingTabsRef.current = siblingTabs;

  const candidatesRef = useRef(new Map<string, Candidate>());
  const profilesRef = useRef(new Map<string, Peer>());
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [outgoing, setOutgoing] = useState<OutgoingItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingItem[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [notice, setNotice] = useState("");
  const [networkGrouped, setNetworkGrouped] = useState(true);

  const outgoingRef = useRef(new Map<string, OutgoingItem>());
  const incomingRef = useRef(new Map<string, IncomingItem>());
  const busyPeers = useRef(new Set<string>());
  const queued = useRef<string[]>([]);
  const activeSends = useRef(0);
  const beginSend = useRef<(requestId: string) => void>(() => {});
  const sendAborts = useRef(new Map<string, AbortController>());

  const openingReceive = useRef(new Map<string, string>());
  const activeReceive = useRef(
    new Map<
      string,
      {
        peerId: string;
        sink: DownloadSink;
        received: number;
        expected: number;
        ended: boolean;
        finishing: boolean;
        report: (bytes: number) => void;
      }
    >(),
  );
  const transferWaiters = useRef(
    new Map<
      string,
      {
        ready: () => void;
        complete: () => void;
        reject: (err: Error) => void;
      }
    >(),
  );

  const syncOutgoing = () => setOutgoing([...outgoingRef.current.values()]);
  const syncIncoming = () => setIncoming([...incomingRef.current.values()]);

  const patchOutgoing = useCallback(
    (requestId: string, patch: Partial<OutgoingItem>) => {
      const current = outgoingRef.current.get(requestId);
      if (!current) return;
      outgoingRef.current.set(requestId, { ...current, ...patch });
      syncOutgoing();
    },
    [],
  );

  const patchIncoming = useCallback(
    (requestId: string, patch: Partial<IncomingItem>) => {
      const current = incomingRef.current.get(requestId);
      if (!current) return;
      incomingRef.current.set(requestId, { ...current, ...patch });
      syncIncoming();
    },
    [],
  );

  const publishPeers = useCallback(() => {
    const visible = [...profilesRef.current.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    setPeers(visible);
    void (async () => {
      const next: Record<string, string> = {};
      for (const peer of visible) {
        next[peer.id] = await sessionFingerprint(
          identity.publicKey,
          fromHex(peer.pubkey),
        );
      }
      setFingerprints(next);
    })();
  }, [identity]);

  const peerName = useCallback(
    (id: string) => profilesRef.current.get(id)?.name ?? "Nearby user",
    [],
  );

  const pumpQueue = useCallback(() => {
    while (activeSends.current < MAX_CONCURRENT_PAYLOADS) {
      const index = queued.current.findIndex((requestId) => {
        const item = outgoingRef.current.get(requestId);
        return Boolean(
          item &&
          item.state === "offered" &&
          !busyPeers.current.has(item.peerId),
        );
      });
      if (index < 0) return;
      const [requestId] = queued.current.splice(index, 1);
      const item = outgoingRef.current.get(requestId);
      if (!item) continue;
      busyPeers.current.add(item.peerId);
      activeSends.current += 1;
      patchOutgoing(requestId, { state: "sending" });
      beginSend.current(requestId);
    }
  }, [patchOutgoing]);

  const releaseSend = useCallback(
    (peerId: string) => {
      if (busyPeers.current.delete(peerId)) {
        activeSends.current = Math.max(0, activeSends.current - 1);
      }
      pumpQueue();
    },
    [pumpQueue],
  );

  const sendDirectEnvelope = useCallback(
    (peerId: string, envelope: Envelope) => {
      const link = linksRef.current?.peek(peerId);
      if (!link?.open)
        throw new Error("that person is no longer reachable locally");
      link.sendControl({ t: "envelope", envelope });
    },
    [],
  );

  const handleEnvelope = useCallback(
    (from: string, envelope: Envelope) => {
      if (envelope.kind === ENVELOPE_KINDS.message) {
        const text = String(envelope.message ?? "")
          .slice(0, MAX_TEXT_LENGTH)
          .trim();
        if (!text) return;
        setChat((lines) => [
          ...lines,
          {
            id: `${from}-${Date.now()}-${lines.length}`,
            peerIds: [from],
            from: peerName(from),
            text,
            at: Date.now(),
            outbound: false,
          },
        ]);
        return;
      }

      if (envelope.kind === ENVELOPE_KINDS.fileOffer) {
        const requestId = envelope.request_id ?? "";
        const streamId = envelope.stream_id ?? "";
        if (
          !REQUEST_ID.test(requestId) ||
          !STREAM_ID.test(streamId) ||
          !Number.isSafeInteger(envelope.size) ||
          envelope.size < 0
        ) {
          return;
        }
        if (incomingRef.current.has(requestId)) return;
        const item: IncomingItem = {
          requestId,
          from,
          fromName: peerName(from),
          name: sanitizeFilename(envelope.name),
          size: envelope.size,
          streamId,
          state: "pending",
          at: Date.now(),
          note: envelope.message
            ? String(envelope.message).slice(0, 200)
            : undefined,
        };
        incomingRef.current.set(requestId, item);
        syncIncoming();
        return;
      }

      if (envelope.kind === ENVELOPE_KINDS.fileRequest) {
        const requestId = envelope.request_id ?? "";
        const item = outgoingRef.current.get(requestId);
        if (!item || item.peerId !== from || item.state !== "offered") return;
        if (!queued.current.includes(requestId)) queued.current.push(requestId);
        pumpQueue();
        return;
      }

      if (envelope.kind === ENVELOPE_KINDS.fileReject) {
        const requestId = envelope.request_id ?? "";
        const item = outgoingRef.current.get(requestId);
        if (item?.peerId === from)
          patchOutgoing(requestId, { state: "declined" });
      }
    },
    [patchOutgoing, peerName, pumpQueue],
  );

  const failReceive = useCallback(
    (requestId: string, reason: string) => {
      openingReceive.current.delete(requestId);
      const activeItem = activeReceive.current.get(requestId);
      activeReceive.current.delete(requestId);
      activeItem?.sink.abort(reason);
      const item = incomingRef.current.get(requestId);
      if (
        !item ||
        item.state === "done" ||
        item.state === "declined" ||
        item.state === "failed"
      )
        return;
      patchIncoming(requestId, { state: "failed", error: reason });
      const link = linksRef.current?.peek(item.from);
      try {
        link?.sendControl({ t: "abort", requestId, error: reason });
      } catch {
        /* Peer left. */
      }
      link?.closePayload(requestId);
    },
    [patchIncoming],
  );

  const finishReceive = useCallback(
    (requestId: string) => {
      const activeItem = activeReceive.current.get(requestId);
      if (
        !activeItem ||
        activeItem.finishing ||
        !activeItem.ended ||
        activeItem.received !== activeItem.expected
      )
        return;
      activeItem.finishing = true;
      patchIncoming(requestId, { state: "verifying" });
      void activeItem.sink
        .close()
        .then(() => {
          if (activeReceive.current.get(requestId) !== activeItem) return;
          activeReceive.current.delete(requestId);
          patchIncoming(requestId, { state: "done" });
          const link = linksRef.current?.peek(activeItem.peerId);
          try {
            link?.sendControl({ t: "complete", requestId });
          } catch {
            /* Download has completed. */
          }
          link?.closePayload(requestId);
        })
        .catch((error) => failReceive(requestId, describe(error)));
    },
    [patchIncoming, failReceive],
  );

  const handlePayloadOpen = useCallback(
    async (peerId: string, requestId: string) => {
      const item = incomingRef.current.get(requestId);
      const link = linksRef.current?.peek(peerId);
      if (!item || item.from !== peerId || item.state !== "approved" || !link)
        return;
      if (
        openingReceive.current.has(requestId) ||
        activeReceive.current.has(requestId)
      )
        return;
      if (
        activeReceive.current.size + openingReceive.current.size >=
        MAX_CONCURRENT_PAYLOADS
      ) {
        link.sendControl({
          t: "abort",
          requestId,
          error:
            "This device is already receiving four files. Send this one again when a transfer finishes.",
        });
        patchIncoming(requestId, {
          state: "failed",
          error:
            "Already receiving four files. Ask the sender to try again shortly.",
        });
        link.closePayload(requestId);
        return;
      }
      openingReceive.current.set(requestId, peerId);
      try {
        const client = clientRef.current;
        if (!client) throw new Error("the local session closed");
        const shared = await client.sharedWith(peerId);
        const streamKey = await deriveStreamKey(shared, fromHex(item.streamId));
        const sink = await startDirectDownload({
          transferId: requestId,
          filename: item.name,
          plaintextSize: item.size,
          streamKey,
        });
        if (openingReceive.current.get(requestId) !== peerId || !link.open) {
          sink.abort("The connection closed before the download started.");
          return;
        }
        openingReceive.current.delete(requestId);
        activeReceive.current.set(requestId, {
          peerId,
          sink,
          received: 0,
          expected: cipherSizeFor(item.size),
          ended: false,
          finishing: false,
          report: throttleProgress((bytes) =>
            patchIncoming(requestId, { receivedBytes: bytes }),
          ),
        });
        void sink.finished.catch((error) =>
          failReceive(requestId, describe(error)),
        );
        patchIncoming(requestId, {
          state: "receiving",
          receivedBytes: 0,
        });
        link.sendControl({ t: "ready", requestId });
      } catch (err) {
        openingReceive.current.delete(requestId);
        const error = describe(err);
        patchIncoming(requestId, { state: "failed", error });
        try {
          link.sendControl({ t: "abort", requestId, error });
        } catch {
          // The direct link failed before the abort could be delivered.
        } finally {
          link.closePayload(requestId);
        }
      }
    },
    [patchIncoming, failReceive],
  );

  const handlePayloadData = useCallback(
    async (peerId: string, requestId: string, bytes: Uint8Array) => {
      const activeItem = activeReceive.current.get(requestId);
      if (!activeItem || activeItem.peerId !== peerId) return;
      try {
        if (activeItem.received + bytes.length > activeItem.expected) {
          throw new Error("peer sent more file data than offered");
        }
        await activeItem.sink.write(bytes);
        activeItem.received += bytes.length;
        activeItem.report(activeItem.received);
        finishReceive(requestId);
      } catch (err) {
        activeReceive.current.delete(requestId);
        const error = describe(err);
        activeItem.sink.abort(error);
        patchIncoming(requestId, { state: "failed", error });
        const link = linksRef.current?.peek(peerId);
        link?.sendControl({ t: "abort", requestId, error });
        link?.closePayload(requestId);
      }
    },
    [finishReceive, patchIncoming],
  );

  const handlePayloadClosed = useCallback(
    (requestId: string) => {
      if (
        activeReceive.current.has(requestId) ||
        openingReceive.current.has(requestId)
      ) {
        failReceive(
          requestId,
          "The file connection closed before completion. Ask the sender to try again.",
        );
      }
    },
    [failReceive],
  );

  const handleControl = useCallback(
    (peerId: string, message: ChannelControl) => {
      if (message.t === "profile") {
        const candidate = candidatesRef.current.get(peerId);
        if (!candidate || siblingTabsRef.current.has(peerId)) return;
        profilesRef.current.set(peerId, {
          ...candidate,
          name: sanitizePeerName(message.name),
        });
        publishPeers();
        return;
      }
      if (message.t === "envelope") {
        handleEnvelope(peerId, message.envelope);
        return;
      }
      const outgoingItem = outgoingRef.current.get(message.requestId);
      const waiters =
        outgoingItem?.peerId === peerId
          ? transferWaiters.current.get(message.requestId)
          : undefined;
      if (message.t === "ready") {
        waiters?.ready();
        return;
      }
      if (message.t === "complete") {
        waiters?.complete();
        return;
      }
      if (message.t === "end") {
        const activeItem = activeReceive.current.get(message.requestId);
        if (!activeItem || activeItem.peerId !== peerId) return;
        activeItem.ended = true;
        finishReceive(message.requestId);
        return;
      }

      const error = message.error || "the transfer was cancelled";
      waiters?.reject(new Error(error));
      if (outgoingItem?.peerId === peerId)
        sendAborts.current.get(message.requestId)?.abort(error);
      const activeItem = activeReceive.current.get(message.requestId);
      if (activeItem?.peerId === peerId) {
        activeReceive.current.delete(message.requestId);
        activeItem.sink.abort(error);
        patchIncoming(message.requestId, { state: "failed", error });
      }
    },
    [finishReceive, handleEnvelope, patchIncoming, publishPeers],
  );

  const handleLinkClosed = useCallback(
    (peerId: string) => {
      if (profilesRef.current.delete(peerId)) publishPeers();
      const error =
        "The local connection closed. Send the file again after reconnecting.";
      for (const [requestId, item] of incomingRef.current) {
        if (
          item.from === peerId &&
          (item.state === "pending" || item.state === "approved")
        )
          failReceive(requestId, error);
      }
      for (const [requestId, item] of outgoingRef.current) {
        if (item.peerId === peerId && item.state === "offered")
          patchOutgoing(requestId, { state: "failed", error });
      }
      for (const [requestId, waiters] of transferWaiters.current) {
        if (outgoingRef.current.get(requestId)?.peerId !== peerId) continue;
        waiters.reject(new Error(error));
        sendAborts.current.get(requestId)?.abort(error);
      }
      for (const [requestId, activeItem] of activeReceive.current) {
        if (activeItem.peerId !== peerId) continue;
        activeReceive.current.delete(requestId);
        activeItem.sink.abort(error);
        patchIncoming(requestId, { state: "failed", error });
      }
    },
    [patchIncoming, patchOutgoing, publishPeers, failReceive],
  );

  const applyCandidates = useCallback(() => {
    const allowed = [...candidatesRef.current.values()].filter(
      (candidate) => !siblingTabsRef.current.has(candidate.id),
    );
    setCandidateCount(allowed.length);
    const ids = new Set(allowed.map((candidate) => candidate.id));
    for (const id of [...profilesRef.current.keys()]) {
      if (!ids.has(id)) profilesRef.current.delete(id);
    }
    linksRef.current?.retain([...ids]);
    linksRef.current?.discover([...ids]);
    publishPeers();
  }, [publishPeers]);

  useEffect(() => {
    applyCandidates();
  }, [siblingTabs, applyCandidates]);

  const startSend = useCallback(
    async (requestId: string) => {
      const client = clientRef.current;
      const item = outgoingRef.current.get(requestId);
      const link = item ? linksRef.current?.peek(item.peerId) : undefined;
      if (!client || !item || !link?.open) {
        if (item) {
          patchOutgoing(requestId, {
            state: "failed",
            error: "that person is no longer reachable on your local network",
          });
          releaseSend(item.peerId);
        }
        return;
      }

      let readyResolve = () => {};
      let completeResolve = () => {};
      let rejectBoth = (_err: Error) => {};
      const ready = new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        rejectBoth = reject;
      });
      const complete = new Promise<void>((resolve, reject) => {
        completeResolve = resolve;
        const previous = rejectBoth;
        rejectBoth = (err) => {
          previous(err);
          reject(err);
        };
      });
      // The receiver can abort before file streaming reaches the point where
      // completion is awaited. Attach a handler now to avoid a transient
      // unhandled rejection while preserving the rejection for the later await.
      void ready.catch(() => undefined);
      void complete.catch(() => undefined);
      transferWaiters.current.set(requestId, {
        ready: readyResolve,
        complete: completeResolve,
        reject: rejectBoth,
      });
      const abort = new AbortController();
      sendAborts.current.set(requestId, abort);

      try {
        if (!(await link.openPayload(requestId))) {
          throw new Error("could not open a local file connection");
        }
        await withTimeout(
          ready,
          CONTROL_TIMEOUT_MS,
          "the other device did not start the approved download",
        );
        const shared = await client.sharedWith(item.peerId);
        const streamKey = await importAesKey(
          await deriveStreamKey(shared, item.streamId),
        );
        await sendOverChannel({
          channel: {
            sendData: (bytes) => link.sendData(requestId, bytes),
          },
          source: item.openStream(),
          streamKey,
          signal: abort.signal,
          onProgress: throttleProgress((sent) =>
            patchOutgoing(requestId, { sentBytes: sent }),
          ),
        });
        link.sendControl({ t: "end", requestId });
        await withTimeout(
          complete,
          COMPLETE_TIMEOUT_MS,
          "the other device did not confirm the completed file",
        );
        patchOutgoing(requestId, { state: "done" });
      } catch (err) {
        const error = describe(err);
        patchOutgoing(requestId, { state: "failed", error });
        try {
          link.sendControl({ t: "abort", requestId, error });
        } catch {
          // The connection itself failed.
        }
      } finally {
        transferWaiters.current.delete(requestId);
        sendAborts.current.delete(requestId);
        link.closePayload(requestId);
        releaseSend(item.peerId);
      }
    },
    [patchOutgoing, releaseSend],
  );

  useEffect(() => {
    beginSend.current = (requestId) => void startSend(requestId);
  }, [startSend]);

  useEffect(() => {
    if (!active || !nameRef.current) return;
    setNetworkGrouped(true);

    const client = new CoordinatorClient(COORDINATOR_WS, identity);
    clientRef.current = client;

    if (rtcSupported()) {
      const selfKey = toHex(identity.publicKey);
      linksRef.current = new LinkRegistry(
        (peerId) => selfKey < (client.candidate(peerId)?.pubkey ?? ""),
        (peerId, signal) => {
          void client.sendSignal(peerId, signal).catch(() => undefined);
        },
        (link) => {
          link.listen({
            onOpen: () =>
              link.sendControl({ t: "profile", name: nameRef.current }),
            onControl: (message) => handleControl(link.peerId, message),
            onPayloadOpen: (requestId) =>
              handlePayloadOpen(link.peerId, requestId),
            onPayloadData: (requestId, bytes) =>
              handlePayloadData(link.peerId, requestId, bytes),
            onPayloadClosed: handlePayloadClosed,
          });
          link.onDisconnect(() => handleLinkClosed(link.peerId));
        },
      );
    }

    const unsubscribe = client.on((event) => {
      switch (event.type) {
        case "status":
          setStatus(event.status);
          break;
        case "created":
          setRoomPending(false);
          setRoomError("");
          if (roomTimer.current) clearTimeout(roomTimer.current);
          setSelfPeerId(event.peerId);
          setCode(event.code);
          setNotice("");
          window.history.replaceState(null, "", `/r/${event.code}`);
          break;
        case "joined":
          setSelfPeerId(event.peerId);
          if (!event.code) {
            setCode("");
            if (window.location.pathname.startsWith("/r/"))
              window.history.replaceState(null, "", "/app");
          }
          if (event.code) {
            setRoomPending(false);
            setRoomError("");
            if (roomTimer.current) clearTimeout(roomTimer.current);
            setCode(event.code);
            setNotice("");
            window.history.replaceState(null, "", `/r/${event.code}`);
          }
          break;
        case "roster":
          candidatesRef.current = new Map(
            event.peers.map((candidate) => [candidate.id, candidate]),
          );
          applyCandidates();
          break;
        case "signal":
          if (!isRtcSignalKind(event.envelope.kind)) return;
          void linksRef.current
            ?.get(event.from)
            .accept({
              kind: event.envelope.kind,
              payload: event.envelope.message,
            })
            .catch(() => undefined);
          break;
        case "peerLeft":
          linksRef.current?.drop(event.peerId);
          profilesRef.current.delete(event.peerId);
          publishPeers();
          break;
        case "error":
          if (event.code === "network_busy") {
            setNetworkGrouped(false);
            break;
          }
          if (
            [
              "no_room",
              "network_mismatch",
              "room_full",
              "already_in_room",
              "bad_request",
              "capacity",
              "rate_limited",
            ].includes(event.code)
          ) {
            setRoomPending(false);
            setRoomError(
              event.code === "no_room"
                ? "That room was not found. Check the code and make sure the other person still has it open."
                : event.message,
            );
            if (roomTimer.current) clearTimeout(roomTimer.current);
            if (event.code === "no_room" || event.code === "network_mismatch") {
              window.history.replaceState(null, "", "/app");
              setCode("");
            }
          } else setNotice(event.message);
          break;
      }
    });

    client.connect();
    client.hello();
    const initial = roomCodeFromLocation();
    if (initial) {
      setRoomPending(true);
      roomTimer.current = setTimeout(() => {
        setRoomPending(false);
        setRoomError(
          "The room did not respond. Check your connection and try again.",
        );
        window.history.replaceState(null, "", "/app");
        setCode("");
        reconnect((value) => value + 1);
      }, CONTROL_TIMEOUT_MS);
      client.joinRoom(initial);
    }

    return () => {
      unsubscribe();
      if (roomTimer.current) clearTimeout(roomTimer.current);
      client.close();
      clientRef.current = null;
      linksRef.current?.closeAll();
      linksRef.current = null;
      candidatesRef.current.clear();
      profilesRef.current.clear();
      setPeers([]);
      setCandidateCount(0);
    };
    // Session callbacks intentionally bind to this session's name and keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, connectionGeneration]);

  useEffect(() => {
    for (const peer of profilesRef.current.values()) {
      try {
        linksRef.current?.peek(peer.id)?.sendControl({ t: "profile", name });
      } catch {
        /* Reconnecting. */
      }
    }
  }, [name]);

  const sendText = useCallback(
    async (targets: string[], text: string) => {
      const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
      if (!trimmed || targets.length === 0) return false;
      const at = Date.now();
      const delivered: string[] = [];
      for (const to of targets) {
        try {
          sendDirectEnvelope(
            to,
            envelopeFor(ENVELOPE_KINDS.message, name, { message: trimmed }),
          );
          delivered.push(to);
        } catch (err) {
          setNotice(describe(err));
        }
      }
      if (delivered.length === 0) return false;
      setChat((lines) => [
        ...lines,
        {
          id: `me-${at}-${lines.length}`,
          peerIds: delivered,
          from: name,
          text: trimmed,
          at,
          outbound: true,
        },
      ]);
      if (delivered.length < targets.length)
        setNotice(
          `Message sent to ${delivered.length} of ${targets.length} people. Others disconnected.`,
        );
      return true;
    },
    [name, sendDirectEnvelope],
  );

  const sendFiles = useCallback(
    async (targets: string[], files: File[], asFolder = false) => {
      if (targets.length === 0 || files.length === 0) return;
      const payloads = asFolder
        ? [
            (() => {
              const entries = entriesFor(files);
              return {
                label: folderNameFor(files),
                size: zipSize(entries),
                note: `${files.length} ${files.length === 1 ? "file" : "files"}`,
                open: () => zipStream(entries),
              };
            })(),
          ]
        : files.map((file) => ({
            label: file.name,
            size: file.size,
            note: "",
            open: () => file.stream() as ReadableStream<Uint8Array>,
          }));
      const groups = payloads.map(() => toHex(randomBytes(6)));

      for (const to of targets) {
        for (const [index, payload] of payloads.entries()) {
          const requestId = toHex(randomBytes(8));
          const streamId = randomBytes(16);
          const item: OutgoingItem = {
            requestId,
            peerId: to,
            peerName: peerName(to),
            size: payload.size,
            openStream: payload.open,
            label: payload.label,
            streamId,
            state: "offered",
            sentBytes: 0,
            at: Date.now(),
            groupId: groups[index],
            folder: asFolder,
          };
          outgoingRef.current.set(requestId, item);
          syncOutgoing();
          try {
            sendDirectEnvelope(
              to,
              envelopeFor(ENVELOPE_KINDS.fileOffer, name, {
                name: payload.label,
                size: payload.size,
                message: payload.note,
                request_id: requestId,
                stream_id: toHex(streamId),
              }),
            );
          } catch (err) {
            patchOutgoing(requestId, { state: "failed", error: describe(err) });
          }
        }
      }
    },
    [name, patchOutgoing, peerName, sendDirectEnvelope],
  );

  const approve = useCallback(
    async (item: IncomingItem) => {
      if (incomingRef.current.get(item.requestId)?.state !== "pending") return;
      patchIncoming(item.requestId, { state: "approved" });
      if (!serviceWorkerSupported()) {
        patchIncoming(item.requestId, {
          state: "failed",
          error: "this browser cannot stream downloads to disk",
        });
        return;
      }
      try {
        await registerServiceWorker();
        if (incomingRef.current.get(item.requestId)?.state !== "approved")
          return;
        sendDirectEnvelope(
          item.from,
          envelopeFor(ENVELOPE_KINDS.fileRequest, name, {
            name: item.name,
            size: item.size,
            request_id: item.requestId,
          }),
        );
      } catch (err) {
        patchIncoming(item.requestId, {
          state: "failed",
          error: describe(err),
        });
      }
    },
    [name, patchIncoming, sendDirectEnvelope],
  );

  const decline = useCallback(
    async (item: IncomingItem) => {
      if (incomingRef.current.get(item.requestId)?.state !== "pending") return;
      patchIncoming(item.requestId, { state: "declined" });
      try {
        sendDirectEnvelope(
          item.from,
          envelopeFor(ENVELOPE_KINDS.fileReject, name, {
            name: item.name,
            size: item.size,
            request_id: item.requestId,
          }),
        );
      } catch (err) {
        setNotice(describe(err));
      }
    },
    [name, patchIncoming, sendDirectEnvelope],
  );

  const beginRoom = useCallback(
    (value?: string) => {
      if (!clientRef.current || roomPending) return;
      setRoomError("");
      setRoomPending(true);
      if (roomTimer.current) clearTimeout(roomTimer.current);
      roomTimer.current = setTimeout(() => {
        setRoomPending(false);
        setRoomError(
          "The room did not respond. Check your connection and try again.",
        );
        window.history.replaceState(null, "", "/app");
        setCode("");
        reconnect((value) => value + 1);
      }, CONTROL_TIMEOUT_MS);
      if (value) clientRef.current.joinRoom(value.trim().toUpperCase());
      else clientRef.current.createRoom();
    },
    [roomPending],
  );
  const createRoom = useCallback(() => beginRoom(), [beginRoom]);
  const joinRoom = useCallback(
    (value: string) => beginRoom(value),
    [beginRoom],
  );
  const leaveRoom = useCallback(() => {
    window.history.replaceState(null, "", "/app");
    setCode("");
    setRoomError("");
    setRoomPending(false);
    reconnect((value) => value + 1);
  }, []);
  const retryConnection = useCallback(
    () => reconnect((value) => value + 1),
    [],
  );

  const events = useMemo<ThreadEvent[]>(() => {
    const merged: ThreadEvent[] = [
      ...chat.map((line) => ({
        kind: "message" as const,
        id: line.id,
        at: line.at,
        peerIds: line.peerIds,
        line,
      })),
      ...incoming.map((item) => ({
        kind: "incoming" as const,
        id: item.requestId,
        at: item.at,
        peerIds: [item.from],
        item,
      })),
      ...outgoing.map((item) => ({
        kind: "outgoing" as const,
        id: item.requestId,
        at: item.at,
        peerIds: [item.peerId],
        item,
      })),
    ];
    return merged.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }, [chat, incoming, outgoing]);

  const received = useMemo(
    () =>
      incoming
        .filter((item) => item.state === "done")
        .sort((a, b) => b.at - a.at),
    [incoming],
  );
  const pendingCount = useMemo(
    () => incoming.filter((item) => item.state === "pending").length,
    [incoming],
  );

  const [seenAt, setSeenAt] = useState<Record<string, number>>({});
  const markRead = useCallback((threadId: string) => {
    setSeenAt((current) => ({ ...current, [threadId]: Date.now() }));
  }, []);
  const unread = useMemo(() => {
    const out: Record<string, number> = {};
    for (const event of events) {
      if (event.kind === "message" && event.line.outbound) continue;
      if (event.kind === "outgoing") continue;
      for (const peerId of event.peerIds) {
        if (event.at > Math.max(seenAt[peerId] ?? 0, seenAt[EVERYONE] ?? 0))
          out[peerId] = (out[peerId] ?? 0) + 1;
      }
    }
    return out;
  }, [events, seenAt]);

  return {
    status,
    code,
    roomPending,
    roomError,
    candidateCount,
    leaveRoom,
    retryConnection,
    peers,
    fingerprints,
    events,
    received,
    pendingCount,
    unread,
    markRead,
    notice,
    networkGrouped,
    setNotice,
    sendText,
    sendFiles,
    approve,
    decline,
    createRoom,
    joinRoom,
  };
}
