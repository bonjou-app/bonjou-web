import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CoordinatorClient,
  type CoordinatorEvent,
  type ConnectionStatus,
} from "./coordinator";
import * as crypto from "./crypto";

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
  vi.restoreAllMocks();
  vi.useRealTimers();
  sockets.length = 0;
  vi.unstubAllGlobals();
});

describe("coordinator asynchronous peer lifetime", () => {
  const bob = { id: "bob", pubkey: "03".repeat(32), source: "network" } as const;
  const envelope: crypto.Envelope = {
    kind: "rtc_offer", from: "", from_ip: "", to: "", name: "", size: 0,
    ts: 0, message: "{}", checksum: "", hmac: "",
  };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    return { promise, resolve, reject };
  }

  function frame(socket: MockWebSocket, value: object) {
    socket.onmessage?.({ data: JSON.stringify(value) });
  }

  function open(socket: MockWebSocket) {
    socket.readyState = MockWebSocket.OPEN;
    socket.onopen?.();
    frame(socket, { type: "roster", peers: [bob] });
  }

  function start() {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const events: CoordinatorEvent[] = [];
    const client = new CoordinatorClient("wss://coordinator.test/ws", {
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(32).fill(2),
    });
    client.on((event) => events.push(event));
    client.connect();
    client.hello();
    open(sockets[0]);
    return { client, events };
  }

  it("does not restore a retired key cache after close and a new connection", async () => {
    const firstKey = deferred<Uint8Array>();
    const currentKey = new Uint8Array(32).fill(5);
    const derive = vi.spyOn(crypto, "deriveSharedSecret")
      .mockReturnValueOnce(firstKey.promise)
      .mockResolvedValue(currentKey);
    const { client } = start();
    const first = expect(client.sharedWith(bob.id)).rejects.toThrow("no longer nearby");
    client.close();
    client.connect();
    open(sockets[1]);
    firstKey.resolve(new Uint8Array(32).fill(4));
    await first;
    await expect(client.sharedWith(bob.id)).resolves.toBe(currentKey);
    expect(derive).toHaveBeenCalledTimes(2);
    client.close();
  });

  it("retires pending key derivation when a peer disappears and returns", async () => {
    const firstKey = deferred<Uint8Array>();
    const currentKey = new Uint8Array(32).fill(5);
    const derive = vi.spyOn(crypto, "deriveSharedSecret")
      .mockReturnValueOnce(firstKey.promise)
      .mockResolvedValue(currentKey);
    const { client } = start();
    const first = expect(client.sharedWith(bob.id)).rejects.toThrow("no longer nearby");
    frame(sockets[0], { type: "roster", peers: [] });
    frame(sockets[0], { type: "roster", peers: [bob] });
    firstKey.resolve(new Uint8Array(32).fill(4));
    await first;
    await expect(client.sharedWith(bob.id)).resolves.toBe(currentKey);
    expect(derive).toHaveBeenCalledTimes(2);
    client.close();
  });

  it("preserves pending key derivation through an equivalent roster refresh", async () => {
    const pendingKey = deferred<Uint8Array>();
    const derive = vi.spyOn(crypto, "deriveSharedSecret").mockReturnValue(pendingKey.promise);
    const { client } = start();
    const shared = client.sharedWith(bob.id);
    frame(sockets[0], { type: "roster", peers: [bob, { ...bob, id: "charlie" }] });
    const key = new Uint8Array(32).fill(4);
    pendingKey.resolve(key);
    await expect(shared).resolves.toBe(key);
    await expect(client.sharedWith(bob.id)).resolves.toBe(key);
    expect(derive).toHaveBeenCalledTimes(1);
    client.close();
  });

  it("invalidates a cached key when a candidate public key changes", async () => {
    const firstKey = new Uint8Array(32).fill(4);
    const currentKey = new Uint8Array(32).fill(5);
    const derive = vi.spyOn(crypto, "deriveSharedSecret")
      .mockResolvedValueOnce(firstKey)
      .mockResolvedValueOnce(currentKey);
    const { client } = start();
    await expect(client.sharedWith(bob.id)).resolves.toBe(firstKey);
    frame(sockets[0], { type: "roster", peers: [{ ...bob, pubkey: "06".repeat(32) }] });
    await expect(client.sharedWith(bob.id)).resolves.toBe(currentKey);
    expect(derive).toHaveBeenCalledTimes(2);
    client.close();
  });

  it.each(["close", "replacement", "room change", "peer departure", "roster removal", "rejected decrypt"])(
    "drops a deferred signaling decrypt after %s", async (transition) => {
      vi.spyOn(crypto, "deriveSharedSecret").mockResolvedValue(new Uint8Array(32));
      const plaintext = deferred<crypto.Envelope>();
      const decrypt = vi.spyOn(crypto, "openEnvelope").mockReturnValue(plaintext.promise);
      const { client, events } = start();
      frame(sockets[0], { type: "signal", from: bob.id, payload: "opaque" });
      await Promise.resolve();
      await Promise.resolve();
      expect(decrypt).toHaveBeenCalledTimes(1);
      if (transition === "replacement") {
        sockets[0].close();
        vi.advanceTimersByTime(500);
        open(sockets[1]);
      } else if (transition === "room change") {
        client.createRoom();
        frame(sockets[0], { type: "created", code: "BCD-234", peer_id: "alice" });
      } else if (transition === "peer departure") {
        frame(sockets[0], { type: "peer_left", peer_id: bob.id });
      } else if (transition === "roster removal") {
        frame(sockets[0], { type: "roster", peers: [] });
      } else client.close();
      if (transition === "rejected decrypt") plaintext.reject(new Error("retired decryption failed"));
      else plaintext.resolve(envelope);
      await Promise.resolve();
      await Promise.resolve();
      expect(events.filter((event) => event.type === "signal" || event.type === "error")).toEqual([]);
      client.close();
    },
  );

  it("publishes signaling after an equivalent roster refresh", async () => {
    vi.spyOn(crypto, "deriveSharedSecret").mockResolvedValue(new Uint8Array(32));
    const plaintext = deferred<crypto.Envelope>();
    const decrypt = vi.spyOn(crypto, "openEnvelope").mockReturnValue(plaintext.promise);
    const { client, events } = start();
    frame(sockets[0], { type: "signal", from: bob.id, payload: "opaque" });
    await Promise.resolve();
    await Promise.resolve();
    expect(decrypt).toHaveBeenCalledTimes(1);
    frame(sockets[0], { type: "roster", peers: [bob] });
    plaintext.resolve(envelope);
    await Promise.resolve();
    await Promise.resolve();
    expect(events.filter((event) => event.type === "signal")).toEqual([
      { type: "signal", from: bob.id, envelope },
    ]);
    client.close();
  });

  it("never sends a deferred encrypted signal over a replacement socket", async () => {
    vi.spyOn(crypto, "deriveSharedSecret").mockResolvedValue(new Uint8Array(32));
    const ciphertext = deferred<string>();
    const encrypt = vi.spyOn(crypto, "sealEnvelope").mockReturnValue(ciphertext.promise);
    const { client } = start();
    const sent = expect(client.sendSignal(bob.id, { kind: "rtc_offer", payload: "{}" }))
      .rejects.toThrow("no longer nearby");
    await Promise.resolve();
    await Promise.resolve();
    expect(encrypt).toHaveBeenCalledTimes(1);
    sockets[0].close();
    vi.advanceTimersByTime(500);
    open(sockets[1]);
    ciphertext.resolve("opaque");
    await sent;
    expect(sockets[1].sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
    ]);
    client.close();
  });
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

describe("coordinator connection availability", () => {
  function start() {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const statuses: ConnectionStatus[] = [];
    const client = new CoordinatorClient("wss://coordinator.test/ws", {
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(32).fill(2),
    });
    client.on((event) => {
      if (event.type === "status") statuses.push(event.status);
    });
    client.connect();
    client.hello();
    return { client, statuses };
  }

  function open(socket: MockWebSocket) {
    socket.readyState = MockWebSocket.OPEN;
    socket.onopen?.();
  }

  it("bounds a socket that never opens and keeps the outage visible during retries", () => {
    const { client, statuses } = start();
    vi.advanceTimersByTime(9_999);
    expect(statuses[statuses.length - 1]).toBe("connecting");
    vi.advanceTimersByTime(1);
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    expect(sockets[0].readyState).toBe(3);

    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    // A late browser event from the abandoned handshake cannot report
    // success for this replacement connection.
    open(sockets[0]);
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    client.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a rejected handshake without waiting for the deadline and recovers", () => {
    const { client, statuses } = start();
    client.createRoom();
    sockets[0].onerror?.();
    sockets[0].close();
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(500);
    open(sockets[1]);
    expect(statuses[statuses.length - 1]).toBe("connected");
    expect(sockets[1].sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
      { type: "create" },
    ]);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(2);
    expect(statuses[statuses.length - 1]).toBe("connected");
    expect(vi.getTimerCount()).toBe(0);
    client.close();
  });

  it("times out a stalled replacement without losing a confirmed private room", () => {
    const { client, statuses } = start();
    open(sockets[0]);
    client.createRoom();
    sockets[0].onmessage?.({
      data: JSON.stringify({ type: "created", code: "ABC-234", peer_id: "alice" }),
    });
    sockets[0].close();
    expect(statuses[statuses.length - 1]).toBe("reconnecting");
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(10_000);
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    vi.advanceTimersByTime(1_000);
    open(sockets[2]);
    expect(statuses[statuses.length - 1]).toBe("connected");
    expect(sockets[2].sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "hello", pubkey: "02".repeat(32) },
      { type: "join", code: "ABC-234" },
    ]);
    const rosterEvents: unknown[] = [];
    client.on((event) => {
      if (event.type === "roster") rosterEvents.push(event);
    });
    sockets[2].onmessage?.({
      data: JSON.stringify({ type: "joined", peer_id: "new-alice" }),
    });
    sockets[2].onmessage?.({
      data: JSON.stringify({
        type: "roster",
        peers: [{ id: "lobby", pubkey: "03".repeat(32), source: "network" }],
      }),
    });
    expect(rosterEvents).toEqual([]);
    expect(client.candidate("lobby")).toBeUndefined();
    client.close();
  });

  it.each([0, 10_000])("cancels all timers when closed after %i ms", (elapsed) => {
    const { client, statuses } = start();
    vi.advanceTimersByTime(elapsed);
    client.close();
    expect(statuses[statuses.length - 1]).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
    open(sockets[0]);
    sockets[0].onclose?.();
    vi.advanceTimersByTime(30_000);
    expect(sockets).toHaveLength(1);
    expect(statuses[statuses.length - 1]).toBe("closed");
  });

  it("clears candidate keys on explicit close without waiting for a browser close event", () => {
    const { client } = start();
    open(sockets[0]);
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: "roster",
        peers: [{ id: "bob", pubkey: "03".repeat(32), source: "network" }],
      }),
    });
    expect(client.candidate("bob")).toBeDefined();
    const rosterEvents: unknown[] = [];
    client.on((event) => {
      if (event.type === "roster") rosterEvents.push(event.peers);
    });
    client.close();
    expect(client.candidate("bob")).toBeUndefined();
    expect(rosterEvents).toEqual([[]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles a synchronous socket failure and retries without crashing the session", () => {
    const { client, statuses } = start();
    sockets[0].close();
    vi.stubGlobal("WebSocket", class {
      constructor() {
        throw new Error("WebSocket could not be constructed");
      }
    });
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(statuses[statuses.length - 1]).toBe("unavailable");
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.advanceTimersByTime(1_000);
    open(sockets[1]);
    expect(statuses[statuses.length - 1]).toBe("connected");
    client.close();
    expect(vi.getTimerCount()).toBe(0);
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
