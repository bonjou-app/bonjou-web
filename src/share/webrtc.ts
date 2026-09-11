/** Direct, local-network-only browser connections. */

import type { Envelope } from "./crypto";

const CONTROL_LABEL = "bonjou-control";
const PAYLOAD_PREFIX = "bonjou-file:";
const REQUEST_ID = /^[0-9a-f]{16}$/;

const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1 * 1024 * 1024;
const DISCOVERY_TIMEOUT_MS = 15_000;
export const MAX_PARALLEL_NEGOTIATIONS = 8;

export type RtcSignalKind = "rtc_offer" | "rtc_answer" | "rtc_ice";

export interface RtcSignal {
  kind: RtcSignalKind;
  payload: string;
}

export type ChannelControl =
  | { t: "profile"; name: string; flowControl?: 1 }
  | { t: "envelope"; envelope: Envelope }
  | { t: "ready"; requestId: string }
  | { t: "end"; requestId: string }
  | { t: "complete"; requestId: string }
  | { t: "abort"; requestId: string; error: string };

export interface ChannelHandlers {
  onOpen: () => void;
  onControl: (message: ChannelControl) => void | Promise<void>;
  onPayloadOpen: (requestId: string) => void | Promise<void>;
  onPayloadData: (requestId: string, bytes: Uint8Array) => void | Promise<void>;
  onPayloadClosed: (requestId: string) => void;
}

type Send = (signal: RtcSignal) => void;

export function isRtcSignalKind(kind: string): kind is RtcSignalKind {
  return kind === "rtc_offer" || kind === "rtc_answer" || kind === "rtc_ice";
}

export function rtcSupported(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

function candidateType(candidate: RTCIceCandidateInit): string {
  const typed = candidate as RTCIceCandidateInit & { type?: string | null };
  if (typed.type) return typed.type;
  return /\styp\s+([^\s]+)/.exec(candidate.candidate ?? "")?.[1] ?? "";
}

/** Only host candidates are allowed to leave this browser. */
export function isHostCandidate(candidate: RTCIceCandidateInit): boolean {
  return candidateType(candidate) === "host";
}

function assertSafeRemoteCandidate(candidate: RTCIceCandidateInit): void {
  const type = candidateType(candidate);
  if (type === "srflx" || type === "relay") {
    throw new Error(`refusing non-local ICE candidate (${type})`);
  }
}

/** Reject SDP that tries to smuggle a public or relayed candidate inline. */
export function assertHostOnlyDescription(
  description: RTCSessionDescriptionInit,
): void {
  for (const line of (description.sdp ?? "").split(/\r?\n/)) {
    if (!line.startsWith("a=candidate:")) continue;
    const type = /\styp\s+([^\s]+)/.exec(line)?.[1] ?? "";
    if (type === "srflx" || type === "relay") {
      throw new Error(`refusing non-local ICE candidate (${type})`);
    }
  }
}

type Credit = { t: "credit"; requestId: string; bytes: number };

function parseControl(raw: string): ChannelControl | Credit | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || !("t" in value)) return null;
  const message = value as Record<string, unknown>;
  if (message.t === "profile" && typeof message.name === "string") {
    return {
      t: "profile",
      name: message.name,
      ...(message.flowControl === 1 ? { flowControl: 1 as const } : {}),
    };
  }
  if (
    message.t === "credit" &&
    typeof message.requestId === "string" &&
    REQUEST_ID.test(message.requestId) &&
    Number.isSafeInteger(message.bytes) &&
    Number(message.bytes) >= 0
  ) {
    return {
      t: "credit",
      requestId: message.requestId,
      bytes: Number(message.bytes),
    };
  }
  if (message.t === "envelope" && message.envelope) {
    return { t: "envelope", envelope: message.envelope as Envelope };
  }
  if (
    (message.t === "ready" ||
      message.t === "end" ||
      message.t === "complete") &&
    typeof message.requestId === "string" &&
    REQUEST_ID.test(message.requestId)
  ) {
    return { t: message.t, requestId: message.requestId };
  }
  if (
    message.t === "abort" &&
    typeof message.requestId === "string" &&
    REQUEST_ID.test(message.requestId) &&
    typeof message.error === "string"
  ) {
    return {
      t: "abort",
      requestId: message.requestId,
      error: message.error.slice(0, 500),
    };
  }
  return null;
}

/**
 * A small generic scheduler used to keep a 100-person candidate set from
 * starting 99 simultaneous negotiations in one tab.
 */
export class NegotiationScheduler {
  private queued: string[] = [];
  private known = new Set<string>();
  private running = 0;

  constructor(
    private readonly start: (id: string) => Promise<void>,
    private readonly limit = MAX_PARALLEL_NEGOTIATIONS,
  ) {}

  add(ids: string[]): void {
    for (const id of ids) {
      if (this.known.has(id)) continue;
      this.known.add(id);
      this.queued.push(id);
    }
    this.pump();
  }

  retain(ids: string[]): void {
    const keep = new Set(ids);
    this.queued = this.queued.filter((id) => keep.has(id));
    for (const id of [...this.known]) {
      if (!keep.has(id)) this.known.delete(id);
    }
  }

  private pump(): void {
    while (this.running < this.limit && this.queued.length > 0) {
      const id = this.queued.shift();
      if (!id) return;
      this.running += 1;
      void this.start(id).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}

/** One persistent control channel and isolated payload channels for a peer. */
export class PeerLink {
  private pc: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private payloads = new Map<string, RTCDataChannel>();
  private payloadWaiters = new Map<string, ((ok: boolean) => void)[]>();
  private payloadTails = new Map<string, Promise<void>>();
  private supportsCredits = false;
  private flows = new Map<
    string,
    {
      sent: number;
      acknowledged: number;
      received: number;
      queued: number;
      wake: Set<() => void>;
    }
  >();
  private makingOffer = false;
  private ignoringOffer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private openWaiters: ((ok: boolean) => void)[] = [];
  private handlers: ChannelHandlers | null = null;
  private onClosed: (() => void) | null = null;
  private closed = false;
  private controlTail: Promise<void> = Promise.resolve();

  constructor(
    readonly peerId: string,
    readonly polite: boolean,
    private readonly send: Send,
  ) {}

  get open(): boolean {
    return this.control?.readyState === "open";
  }

  listen(handlers: ChannelHandlers): void {
    this.handlers = handlers;
  }

  onDisconnect(handler: () => void): void {
    this.onClosed = handler;
  }

  private ensure(): RTCPeerConnection {
    if (this.pc) return this.pc;

    // No STUN and no TURN. The only candidates this connection can learn are
    // local host candidates, which makes failure final instead of relayed.
    const pc = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: "all",
    });
    this.pc = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !isHostCandidate(candidate.toJSON())) return;
      this.send({
        kind: "rtc_ice",
        payload: JSON.stringify(candidate.toJSON()),
      });
    };

    pc.onnegotiationneeded = () => {
      void this.negotiate();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.settleControl(false);
        this.onClosed?.();
      }
    };

    pc.ondatachannel = ({ channel }) => {
      if (channel.label === CONTROL_LABEL) {
        this.adoptControl(channel);
        return;
      }
      if (channel.label.startsWith(PAYLOAD_PREFIX)) {
        const requestId = channel.label.slice(PAYLOAD_PREFIX.length);
        if (REQUEST_ID.test(requestId)) {
          this.adoptPayload(requestId, channel);
          return;
        }
      }
      channel.close();
    };
    return pc;
  }

  private async negotiate(): Promise<void> {
    const pc = this.ensure();
    try {
      this.makingOffer = true;
      await pc.setLocalDescription();
      const description = pc.localDescription;
      if (!description) return;
      assertHostOnlyDescription(description);
      this.send({
        kind: description.type === "offer" ? "rtc_offer" : "rtc_answer",
        payload: JSON.stringify(description),
      });
    } catch {
      this.settleControl(false);
    } finally {
      this.makingOffer = false;
    }
  }

  private adoptControl(channel: RTCDataChannel): void {
    if (this.control) {
      channel.close();
      return;
    }
    channel.binaryType = "arraybuffer";
    this.control = channel;
    channel.onopen = () => {
      this.settleControl(true);
      this.handlers?.onOpen();
    };
    channel.onclose = () => {
      this.settleControl(false);
      this.onClosed?.();
    };
    channel.onerror = () => this.settleControl(false);
    channel.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseControl(event.data);
      if (!message) return;
      if (message.t === "profile")
        this.supportsCredits = message.flowControl === 1;
      if (message.t === "credit") {
        const flow = this.flows.get(message.requestId);
        if (
          flow &&
          message.bytes >= flow.acknowledged &&
          message.bytes <= flow.sent
        ) {
          flow.acknowledged = message.bytes;
          for (const wake of [...flow.wake]) wake();
        }
        return;
      }
      this.controlTail = this.controlTail
        .then(() => this.handlers?.onControl(message))
        .then(() => undefined)
        .catch(() => undefined);
    };
  }

  private adoptPayload(requestId: string, channel: RTCDataChannel): void {
    if (this.payloads.has(requestId)) {
      channel.close();
      return;
    }
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = LOW_WATER;
    this.payloads.set(requestId, channel);
    this.payloadTails.set(requestId, Promise.resolve());
    const flow = {
      sent: 0,
      acknowledged: 0,
      received: 0,
      queued: 0,
      wake: new Set<() => void>(),
    };
    this.flows.set(requestId, flow);

    channel.onopen = () => {
      this.settlePayload(requestId, true);
      void this.handlers?.onPayloadOpen(requestId);
    };
    channel.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      if (this.payloads.get(requestId) !== channel) return;
      const bytes = new Uint8Array(event.data);
      flow.queued += bytes.byteLength;
      // Cap legacy or misbehaving senders too. No unbounded promise queue.
      if (flow.queued > HIGH_WATER * 4) {
        this.closePayload(requestId);
        return;
      }
      const tail = this.payloadTails.get(requestId) ?? Promise.resolve();
      this.payloadTails.set(
        requestId,
        tail
          .then(async () => {
            if (this.payloads.get(requestId) !== channel) return;
            await this.handlers?.onPayloadData(requestId, bytes);
            flow.queued -= bytes.byteLength;
            flow.received += bytes.byteLength;
            if (this.supportsCredits && this.control?.readyState === "open") {
              this.control.send(
                JSON.stringify({
                  t: "credit",
                  requestId,
                  bytes: flow.received,
                }),
              );
            }
          })
          .catch(() => this.closePayload(requestId)),
      );
    };
    channel.onclose = () => this.payloadClosed(requestId);
    channel.onerror = () => this.settlePayload(requestId, false);
  }

  private payloadClosed(requestId: string): void {
    if (!this.payloads.has(requestId)) return;
    this.settlePayload(requestId, false);
    this.payloads.delete(requestId);
    const flow = this.flows.get(requestId);
    this.flows.delete(requestId);
    for (const wake of [...(flow?.wake ?? [])]) wake();
    this.payloadTails.delete(requestId);
    this.handlers?.onPayloadClosed(requestId);
  }

  private settleControl(ok: boolean): void {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const resolve of waiters) resolve(ok);
  }

  private settlePayload(requestId: string, ok: boolean): void {
    const waiters = this.payloadWaiters.get(requestId) ?? [];
    this.payloadWaiters.delete(requestId);
    for (const resolve of waiters) resolve(ok);
  }

  /** Only the deterministic initiator creates the persistent channel. */
  start(): void {
    if (this.closed) return;
    const pc = this.ensure();
    if (this.control || this.polite) return;
    this.adoptControl(pc.createDataChannel(CONTROL_LABEL, { ordered: true }));
  }

  waitOpen(timeoutMs: number): Promise<boolean> {
    if (this.open) return Promise.resolve(true);
    if (this.closed) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.openWaiters.push((ok) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  async accept(signal: RtcSignal): Promise<void> {
    if (this.closed) return;
    const pc = this.ensure();

    if (signal.kind === "rtc_ice") {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
      assertSafeRemoteCandidate(candidate);
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        if (!this.ignoringOffer)
          throw new Error("could not add local ICE candidate");
      }
      return;
    }

    const description = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
    assertHostOnlyDescription(description);
    const collision =
      description.type === "offer" &&
      (this.makingOffer || pc.signalingState !== "stable");
    this.ignoringOffer = !this.polite && collision;
    if (this.ignoringOffer) return;

    await pc.setRemoteDescription(description);
    for (const candidate of this.pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate);
    }
    if (description.type === "offer") {
      await pc.setLocalDescription();
      const answer = pc.localDescription;
      if (!answer) return;
      assertHostOnlyDescription(answer);
      this.send({ kind: "rtc_answer", payload: JSON.stringify(answer) });
    }
  }

  sendControl(message: ChannelControl): void {
    const channel = this.control;
    if (!channel || channel.readyState !== "open") {
      throw new Error("the local connection is not open");
    }
    channel.send(
      JSON.stringify(
        message.t === "profile" ? { ...message, flowControl: 1 } : message,
      ),
    );
  }

  async openPayload(requestId: string): Promise<boolean> {
    if (!REQUEST_ID.test(requestId) || !this.open || this.closed) return false;
    const existing = this.payloads.get(requestId);
    if (existing?.readyState === "open") return true;
    if (!existing) {
      const channel = this.ensure().createDataChannel(
        `${PAYLOAD_PREFIX}${requestId}`,
        {
          ordered: true,
        },
      );
      this.adoptPayload(requestId, channel);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), DISCOVERY_TIMEOUT_MS);
      const waiters = this.payloadWaiters.get(requestId) ?? [];
      waiters.push((ok) => {
        clearTimeout(timer);
        resolve(ok);
      });
      this.payloadWaiters.set(requestId, waiters);
    });
  }

  async sendData(requestId: string, bytes: Uint8Array): Promise<void> {
    const channel = this.payloads.get(requestId);
    if (!channel || channel.readyState !== "open") {
      throw new Error("the local file channel closed");
    }
    const flow = this.flows.get(requestId);
    if (this.supportsCredits && flow) {
      if (bytes.byteLength > HIGH_WATER)
        throw new Error("file chunk exceeds the receive window");
      while (flow.sent - flow.acknowledged + bytes.byteLength > HIGH_WATER) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            flow.wake.delete(wake);
            reject(new Error("the receiver stopped reading the file"));
          }, 60_000);
          const wake = () => {
            clearTimeout(timer);
            flow.wake.delete(wake);
            resolve();
          };
          flow.wake.add(wake);
        });
        if (
          this.payloads.get(requestId) !== channel ||
          channel.readyState !== "open"
        )
          throw new Error("the local file channel closed");
      }
    }
    if (channel.bufferedAmount > HIGH_WATER) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          channel.removeEventListener("bufferedamountlow", onLow);
          channel.removeEventListener("close", onClose);
        };
        const onLow = () => {
          done();
          resolve();
        };
        const onClose = () => {
          done();
          reject(new Error("the local file channel closed mid-transfer"));
        };
        channel.addEventListener("bufferedamountlow", onLow);
        channel.addEventListener("close", onClose);
        if (channel.readyState !== "open") onClose();
      });
    }
    if (channel.readyState !== "open")
      throw new Error("the local file channel closed");
    if (flow) flow.sent += bytes.byteLength;
    channel.send(new Uint8Array(bytes).buffer);
  }

  closePayload(requestId: string): void {
    this.payloads.get(requestId)?.close();
    this.payloadClosed(requestId);
  }

  close(): void {
    this.closed = true;
    this.settleControl(false);
    for (const id of [...this.payloads.keys()]) this.closePayload(id);
    try {
      this.control?.close();
      this.pc?.close();
    } catch {
      // Already torn down.
    }
    this.control = null;
    this.pc = null;
  }
}

/** One link per candidate, with bounded outbound discovery negotiation. */
export class LinkRegistry {
  private links = new Map<string, PeerLink>();
  private scheduler: NegotiationScheduler;

  constructor(
    private readonly polite: (peerId: string) => boolean,
    private readonly send: (peerId: string, signal: RtcSignal) => void,
    private readonly configure: (link: PeerLink) => void,
  ) {
    this.scheduler = new NegotiationScheduler(async (peerId) => {
      const link = this.get(peerId);
      link.start();
      if (!(await link.waitOpen(DISCOVERY_TIMEOUT_MS))) this.drop(peerId);
    });
  }

  get(peerId: string): PeerLink {
    let link = this.links.get(peerId);
    if (!link) {
      link = new PeerLink(peerId, this.polite(peerId), (signal) =>
        this.send(peerId, signal),
      );
      this.links.set(peerId, link);
      this.configure(link);
    }
    return link;
  }

  peek(peerId: string): PeerLink | undefined {
    return this.links.get(peerId);
  }

  discover(peerIds: string[]): void {
    const initiators = peerIds.filter((id) => !this.polite(id)).sort();
    this.scheduler.add(initiators);
  }

  drop(peerId: string): void {
    this.links.get(peerId)?.close();
    this.links.delete(peerId);
  }

  retain(peerIds: string[]): void {
    const keep = new Set(peerIds);
    this.scheduler.retain(peerIds.filter((id) => !this.polite(id)));
    for (const id of [...this.links.keys()]) {
      if (!keep.has(id)) this.drop(id);
    }
  }

  closeAll(): void {
    this.scheduler.retain([]);
    for (const id of [...this.links.keys()]) this.drop(id);
  }
}
