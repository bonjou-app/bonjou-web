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
  "idle" | "connecting" | "connected" | "reconnecting" | "closed";

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

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;

export class CoordinatorClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private sharedSecrets = new Map<string, Uint8Array>();
  private roster = new Map<string, Candidate>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.closedByUser = false;
    this.emit({
      type: "status",
      status: this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
    });

    this.socketRoom = "";
    this.lobbyPeerId = "";
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket || this.closedByUser) return;
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
      this.socket = null;
      this.roster.clear();
      this.sharedSecrets.clear();
      this.emit({ type: "roster", peers: [] });
      if (this.closedByUser) {
        this.emit({ type: "status", status: "closed" });
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose follows and owns reconnection.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.emit({ type: "status", status: "reconnecting" });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private send(frame: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(frame));
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
    const shared = await this.sharedWith(to);
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
    this.send({
      type: "signal",
      to,
      payload: await sealEnvelope(envelope, shared),
    });
  }

  async sharedWith(peerId: string): Promise<Uint8Array> {
    const cached = this.sharedSecrets.get(peerId);
    if (cached) return cached;
    const peer = this.roster.get(peerId);
    if (!peer) throw new Error("that peer is no longer nearby");
    const shared = await deriveSharedSecret(
      this.identity.privateKey,
      fromHex(peer.pubkey),
    );
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
        const present = new Set(peers.map((peer) => peer.id));
        for (const id of [...this.sharedSecrets.keys()]) {
          if (!present.has(id)) this.sharedSecrets.delete(id);
        }
        this.roster = new Map(peers.map((peer) => [peer.id, peer]));
        this.emit({ type: "roster", peers });
        break;
      }

      case "signal": {
        const from = frame.from ?? "";
        if (!frame.payload) return;
        try {
          const shared = await this.sharedWith(from);
          const envelope = await openEnvelope(frame.payload, shared);
          this.emit({ type: "signal", from, envelope });
        } catch (err) {
          this.emit({
            type: "error",
            code: "decrypt_failed",
            message: `could not decrypt WebRTC signaling: ${describe(err)}`,
          });
        }
        break;
      }

      case "peer_left":
        this.emit({ type: "peerLeft", peerId: frame.peer_id ?? "" });
        break;

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
