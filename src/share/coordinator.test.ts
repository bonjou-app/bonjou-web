import { afterEach, describe, expect, it, vi } from "vitest";

import { CoordinatorClient } from "./coordinator";

class MockWebSocket {
  static readonly OPEN = 1;
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {
    sockets.push(this);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const sockets: MockWebSocket[] = [];

afterEach(() => {
  vi.useRealTimers();
  sockets.length = 0;
  vi.unstubAllGlobals();
});

describe("coordinator privacy boundary", () => {
  it("announces only a public key and sends room commands without a name", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const client = new CoordinatorClient("wss://coordinator.test/ws", {
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(32).fill(2),
    });
    client.connect();
    client.hello();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();
    client.createRoom();

    const frames = sockets[0].sent.map((raw) => JSON.parse(raw));
    expect(frames).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
      { type: "create" },
    ]);
    expect(JSON.stringify(frames)).not.toContain("name");
    client.close();
  });
});

describe("room reconnection scope", () => {
  function connect() {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const client = new CoordinatorClient("wss://coordinator.test/ws", {
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(32).fill(2),
    });
    client.connect();
    client.hello();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();
    return client;
  }
  function frame(socket: MockWebSocket, value: object) {
    socket.onmessage?.({ data: JSON.stringify(value) });
  }
  function reconnect() {
    sockets[0].close();
    vi.advanceTimersByTime(500);
    sockets[1].readyState = MockWebSocket.OPEN;
    sockets[1].onopen?.();
    return sockets[1].sent.map((raw) => JSON.parse(raw));
  }
  it("preserves confirmed membership after a rejected duplicate create", () => {
    const client = connect();
    client.createRoom();
    frame(sockets[0], { type: "created", code: "ABC-234", peer_id: "alice" });
    client.createRoom();
    frame(sockets[0], { type: "error", code_error: "already_in_room" });
    expect(reconnect()).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
      { type: "join", code: "ABC-234" },
    ]);
    client.close();
  });
  it("does not repeatedly rejoin a rejected room", () => {
    const client = connect();
    client.joinRoom("BAD-234");
    frame(sockets[0], { type: "error", code_error: "no_room" });
    expect(reconnect()).toEqual([{ type: "hello", pubkey: "02".repeat(32) }]);
    client.close();
  });
  it("publishes the actual lobby scope when a full room rejects rejoining", () => {
    const client = connect();
    client.createRoom();
    frame(sockets[0], { type: "created", code: "ABC-234", peer_id: "alice" });
    reconnect();
    const events: unknown[] = [];
    client.on((event) => events.push(event));
    frame(sockets[1], { type: "joined", peer_id: "new-alice" });
    frame(sockets[1], { type: "error", code_error: "room_full" });
    expect(events[0]).toEqual({
      type: "joined",
      code: "",
      peerId: "new-alice",
    });
    frame(sockets[1], {
      type: "roster",
      peers: [{ id: "lobby", pubkey: "03".repeat(32), source: "network" }],
    });
    expect(client.candidate("lobby")).toBeDefined();
    sockets[1].close();
    vi.advanceTimersByTime(500);
    sockets[2].readyState = MockWebSocket.OPEN;
    sockets[2].onopen?.();
    expect(sockets[2].sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
    ]);
    client.close();
  });

  it("does not publish temporary lobby recipients during a room reconnect", () => {
    const client = connect();
    client.createRoom();
    frame(sockets[0], { type: "created", code: "ABC-234", peer_id: "alice" });
    reconnect();
    const events: unknown[] = [];
    client.on((event) => events.push(event));
    frame(sockets[1], { type: "joined", peer_id: "new-alice" });
    frame(sockets[1], {
      type: "roster",
      peers: [{ id: "lobby", pubkey: "03".repeat(32), source: "network" }],
    });
    expect(events).toEqual([]);
    expect(client.candidate("lobby")).toBeUndefined();
    frame(sockets[1], {
      type: "joined",
      peer_id: "new-alice",
      code: "ABC-234",
    });
    frame(sockets[1], {
      type: "roster",
      peers: [{ id: "room-peer", pubkey: "04".repeat(32), source: "code" }],
    });
    expect(client.candidate("room-peer")).toBeDefined();
    client.close();
  });
});
