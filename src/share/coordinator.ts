/**
 * Browser client for Bonjou's small coordination service.
 *
 * The service only supplies network-scoped candidate ids, room membership,
 * public session keys, and an opaque route for encrypted WebRTC signaling.
 * Names, chat, file metadata, and file bytes never use this connection.
 */

import {
  deriveSharedSecret,
  fromHex,
  openEnvelope,
  sealEnvelope,
  toHex,
  type Envelope,
  type KeyPair,
} from "./crypto";

export interface Peer {
  id: string;
  /** Filled only after the direct control channel exchanges profiles. */
  name: string;
  pubkey: string;
  source: "network" | "code";
}

export type Candidate = Omit<Peer, "name">;

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "closed";

export const ROOM_CONNECTION_UNAVAILABLE =
  "Bonjou's connection service is unavailable. Room codes and QR invites will work when it reconnects. Retrying automatically.";

export type CoordinatorEvent =
  | { type: "status"; status: ConnectionStatus }
  | { type: "created"; code: string; peerId: string }
  | { type: "joined"; code: string; peerId: string }
  | { type: "roster"; peers: Candidate[] }
  | { type: "signal"; from: string; envelope: Envelope }
  | { type: "peerLeft"; peerId: string }
  | { type: "error"; code: string; message: string };

type Handler = (event: CoordinatorEvent) => void;

interface ServerPeer {
  id: string;
  pubkey: string;
  source: "network" | "code";
}

interface ServerFrame {
  type: string;
  code?: string;
  peer_id?: string;
  peers?: ServerPeer[];
  from?: string;
  payload?: string;
  code_error?: string;
  message?: string;
}

interface PeerContext {
  peer: Candidate;
  socket: WebSocket;
  generation: number;
  room: string;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class CoordinatorClient {
  private socket: WebSocket | null = null;
  private connectionGeneration = 0;
  private handlers = new Set<Handler>();
  private sharedSecrets = new Map<string, Uint8Array>();
  private roster = new Map<string, Candidate>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private unavailable = false;
  private closedByUser = false;
  private saidHello = false;
  private pendingIntent: { action: "create" | "join"; code?: string } | null =
    null;

  private confirmedRoom = "";
  private awaitingRoom = false;
  private socketRoom = "";
  private lobbyPeerId = "";

  selfId = "";

  constructor(
    private readonly url: string,
    private readonly identity: KeyPair,
  ) {}

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: CoordinatorEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  candidate(id: string): Candidate | undefined {
    return this.roster.get(id);
  }

  connect(): void {
    if (this.socket) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closedByUser = false;
    this.connectionGeneration += 1;
    this.emit({
      type: "status",
      status: this.unavailable
        ? "unavailable"
        : this.reconnectAttempt === 0
          ? "connecting"
          : "reconnecting",
    });

    this.socketRoom = "";
    this.lobbyPeerId = "";
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.unavailable = true;
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    let opened = false;
    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket || this.closedByUser) return;
      this.clearConnectTimer();
      // Retire this socket before closing it: its delayed events must not
      // replace the status or room scope of a newer connection.
      this.socket = null;
      this.clearCandidates();
      this.unavailable = true;
      socket.close();
      this.scheduleReconnect();
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (this.socket !== socket || this.closedByUser) return;
      this.clearConnectTimer();
      opened = true;
      this.unavailable = false;
      this.reconnectAttempt = 0;
      this.emit({ type: "status", status: "connected" });
      this.awaitingRoom = Boolean(this.pendingIntent || this.confirmedRoom);
      if (this.saidHello) this.sendHello();
      if (this.pendingIntent?.action === "create") this.sendCreate();
      else if (this.pendingIntent?.action === "join" && this.pendingIntent.code)
        this.sendJoin(this.pendingIntent.code);
      else if (this.confirmedRoom) this.sendJoin(this.confirmedRoom);
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      void this.handleFrame(String(event.data));
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.clearConnectTimer();
      this.socket = null;
      this.clearCandidates();
      if (this.closedByUser) {
        this.emit({ type: "status", status: "closed" });
        return;
      }
      if (!opened) this.unavailable = true;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose follows and owns reconnection.
    };
  }

  private clearConnectTimer(): void {
    if (this.connectTimer === null) return;
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearCandidates(): void {
    // Crypto promises can finish after this socket and its peers retire.
    this.connectionGeneration += 1;
    this.roster.clear();
    this.sharedSecrets.clear();
    this.emit({ type: "roster", peers: [] });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.emit({
      type: "status",
      status: this.unavailable ? "unavailable" : "reconnecting",
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  close(): void {
    this.closedByUser = true;
    this.clearConnectTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.clearCandidates();
    socket?.close();
    this.emit({ type: "status", status: "closed" });
  }

  private send(frame: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(frame));
  }

  private peerContext(peerId: string): PeerContext {
    const peer = this.roster.get(peerId);
    const socket = this.socket;
    if (!peer || !socket) throw new Error("that peer is no longer nearby");
    const context = {
      peer,
      socket,
      generation: this.connectionGeneration,
      room: this.socketRoom,
    };
    if (!this.peerIsCurrent(context))
      throw new Error("that peer is no longer nearby");
    return context;
  }

  private peerIsCurrent(context: PeerContext): boolean {
    return (
      !this.closedByUser &&
      !this.awaitingRoom &&
      this.socket === context.socket &&
      context.socket.readyState === WebSocket.OPEN &&
      this.connectionGeneration === context.generation &&
      this.socketRoom === context.room &&
      this.roster.get(context.peer.id) === context.peer
    );
  }

  hello(): void {
    this.saidHello = true;
    this.sendHello();
  }

  private sendHello(): void {
    this.send({ type: "hello", pubkey: toHex(this.identity.publicKey) });
  }

  createRoom(): void {
    this.pendingIntent = { action: "create" };
    this.awaitingRoom = true;
    this.sendCreate();
  }

  joinRoom(code: string): void {
    this.pendingIntent = { action: "join", code };
    this.awaitingRoom = true;
    this.sendJoin(code);
  }

  private sendCreate(): void {
    this.send({ type: "create" });
  }

  private sendJoin(code: string): void {
    this.send({ type: "join", code });
  }

  /** Encrypts one WebRTC signaling message for its intended candidate. */
  async sendSignal(
    to: string,
    signal: { kind: string; payload: string },
  ): Promise<void> {
    const context = this.peerContext(to);
    const shared = await this.sharedWith(to);
    if (!this.peerIsCurrent(context))
      throw new Error("that peer is no longer nearby");
    const envelope: Envelope = {
      kind: signal.kind,
      from: "",
      from_ip: "",
      to: "",
      name: "",
      size: 0,
      ts: Math.floor(Date.now() / 1000),
      message: signal.payload,
      checksum: "",
      hmac: "",
    };
    const payload = await sealEnvelope(envelope, shared);
    if (!this.peerIsCurrent(context))
      throw new Error("that peer is no longer nearby");
    this.send({
      type: "signal",
      to,
      payload,
    });
  }

  async sharedWith(peerId: string): Promise<Uint8Array> {
    const context = this.peerContext(peerId);
    const cached = this.sharedSecrets.get(peerId);
    if (cached) return cached;
    const shared = await deriveSharedSecret(
      this.identity.privateKey,
      fromHex(context.peer.pubkey),
    );
    if (!this.peerIsCurrent(context))
      throw new Error("that peer is no longer nearby");
    this.sharedSecrets.set(peerId, shared);
    return shared;
  }

  private async handleFrame(raw: string): Promise<void> {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw) as ServerFrame;
    } catch {
      return;
    }

    switch (frame.type) {
      case "created":
        this.selfId = frame.peer_id ?? "";
        this.confirmedRoom = frame.code ?? "";
        this.socketRoom = this.confirmedRoom;
        this.pendingIntent = null;
        this.awaitingRoom = false;
        this.emit({
          type: "created",
          code: frame.code ?? "",
          peerId: this.selfId,
        });
        break;

      case "joined":
        // The hello response precedes the room join during reconnect. Never
        // publish its lobby scope while a room request is in flight.
        if (!frame.code) this.lobbyPeerId = frame.peer_id ?? "";
        if (!frame.code && this.awaitingRoom) break;
        this.confirmedRoom = frame.code ?? "";
        this.socketRoom = this.confirmedRoom;
        this.pendingIntent = null;
        this.awaitingRoom = false;
        this.selfId = frame.peer_id ?? "";
        this.emit({
          type: "joined",
          code: frame.code ?? "",
          peerId: this.selfId,
        });
        break;

      case "roster": {
        if (this.awaitingRoom) break;
        const peers = frame.peers ?? [];
        const roster = new Map(
          peers.map((peer) => {
            const previous = this.roster.get(peer.id);
            // An unchanged peer survives roster broadcasts when others join.
            if (
              previous?.pubkey === peer.pubkey &&
              previous.source === peer.source
            )
              return [peer.id, previous] as const;
            this.sharedSecrets.delete(peer.id);
            return [peer.id, peer] as const;
          }),
        );
        for (const id of [...this.sharedSecrets.keys()]) {
          if (!roster.has(id)) this.sharedSecrets.delete(id);
        }
        this.roster = roster;
        this.emit({ type: "roster", peers: [...roster.values()] });
        break;
      }

      case "signal": {
        const from = frame.from ?? "";
        if (!frame.payload) return;
        let context: PeerContext;
        try {
          context = this.peerContext(from);
        } catch {
          return;
        }
        try {
          const shared = await this.sharedWith(from);
          if (!this.peerIsCurrent(context)) return;
          const envelope = await openEnvelope(frame.payload, shared);
          if (!this.peerIsCurrent(context)) return;
          this.emit({ type: "signal", from, envelope });
        } catch (err) {
          if (!this.peerIsCurrent(context)) return;
          this.emit({
            type: "error",
            code: "decrypt_failed",
            message: `could not decrypt WebRTC signaling: ${describe(err)}`,
          });
        }
        break;
      }

      case "peer_left": {
        const peerId = frame.peer_id ?? "";
        this.roster.delete(peerId);
        this.sharedSecrets.delete(peerId);
        this.emit({ type: "peerLeft", peerId });
        break;
      }

      case "error":
        if (
          [
            "no_room",
            "network_mismatch",
            "room_full",
            "bad_request",
            "already_in_room",
            "capacity",
            "rate_limited",
          ].includes(frame.code_error ?? "")
        ) {
          this.pendingIntent = null;
          this.awaitingRoom = false;
          if (!this.socketRoom && this.lobbyPeerId) {
            this.confirmedRoom = "";
            this.selfId = this.lobbyPeerId;
            this.emit({ type: "joined", code: "", peerId: this.selfId });
          }
          if (
            frame.code_error === "no_room" ||
            frame.code_error === "network_mismatch"
          )
            this.confirmedRoom = "";
          this.sendHello(); // Refresh the current scope after ignoring in-flight rosters.
        }
        this.emit({
          type: "error",
          code: frame.code_error ?? "unknown",
          message: frame.message ?? "the coordinator reported an error",
        });
        break;

      default:
        break;
    }
  }
}

export function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
