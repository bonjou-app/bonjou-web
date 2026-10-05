import { describe, expect, it } from "vitest";

import {
  MAX_PARALLEL_NEGOTIATIONS,
  NegotiationScheduler,
  assertHostOnlyDescription,
  isHostCandidate,
} from "./webrtc";

describe("LAN-only ICE policy", () => {
  it("forwards host candidates and rejects public candidate types", () => {
    expect(
      isHostCandidate({
        candidate:
          "candidate:1 1 udp 2122260223 192.168.1.20 53122 typ host generation 0",
      }),
    ).toBe(true);
    expect(
      isHostCandidate({
        candidate:
          "candidate:2 1 udp 1686052607 203.0.113.4 62000 typ srflx raddr 0.0.0.0 rport 0",
      }),
    ).toBe(false);
    expect(
      isHostCandidate({
        candidate: "candidate:3 1 udp 1677734911 198.51.100.8 443 typ relay",
      }),
    ).toBe(false);
  });

  it("rejects SDP containing srflx or relay candidates", () => {
    expect(() =>
      assertHostOnlyDescription({
        type: "offer",
        sdp: "v=0\r\na=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n",
      }),
    ).not.toThrow();
    expect(() =>
      assertHostOnlyDescription({
        type: "offer",
        sdp: "v=0\r\na=candidate:2 1 udp 1 203.0.113.2 5000 typ srflx\r\n",
      }),
    ).toThrow(/non-local ICE candidate/);
    expect(() =>
      assertHostOnlyDescription({
        type: "answer",
        sdp: "v=0\r\na=candidate:3 1 udp 1 198.51.100.2 443 typ relay\r\n",
      }),
    ).toThrow(/non-local ICE candidate/);
  });
});

describe("candidate negotiation scheduler", () => {
  it("processes 100 candidates without exceeding the concurrency bound", async () => {
    let active = 0;
    let peak = 0;
    let completed = 0;
    let finish!: () => void;
    const allDone = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const scheduler = new NegotiationScheduler(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      completed += 1;
      if (completed === 100) finish();
    });

    scheduler.add(Array.from({ length: 100 }, (_, index) => `peer-${index}`));
    await allDone;

    expect(completed).toBe(100);
    expect(peak).toBe(MAX_PARALLEL_NEGOTIATIONS);
  });
});

import { vi, afterEach } from "vitest";
import { LinkRegistry, PeerLink, type ChannelHandlers } from "./webrtc";

class TestChannel extends EventTarget {
  readyState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = "arraybuffer";
  onopen?: () => void;
  onmessage?: (event: { data: string | ArrayBuffer }) => void;
  onclose?: () => void;
  send = vi.fn();
  constructor(readonly label: string) {
    super();
  }
  close() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
    this.onclose?.();
  }
}
function testLink(onPayloadData = async () => {}) {
  const channels: TestChannel[] = [];
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      createDataChannel(label: string) {
        const channel = new TestChannel(label);
        channels.push(channel);
        return channel;
      }
      close() {}
    },
  );
  const link = new PeerLink("peer", false, () => {});
  const closed = vi.fn();
  link.listen({
    onOpen() {},
    onControl() {},
    onPayloadOpen() {},
    onPayloadData,
    onPayloadClosed: closed,
  });
  link.start();
  const control = channels[0];
  control.onopen?.();
  control.onmessage?.({
    data: JSON.stringify({ t: "profile", name: "Receiver", flowControl: 1 }),
  });
  const id = "0123456789abcdef";
  const opening = link.openPayload(id);
  const payload = channels[1];
  payload.onopen?.();
  return { link, id, control, payload, opening, closed };
}
afterEach(() => vi.unstubAllGlobals());

function controlledConnections() {
  const connections: TestConnection[] = [];
  class TestConnection {
    connectionState = "new";
    channels: TestChannel[] = [];
    onconnectionstatechange?: () => void;
    ondatachannel?: (event: { channel: TestChannel }) => void;

    constructor() {
      connections.push(this);
    }

    createDataChannel(label: string) {
      const channel = new TestChannel(label);
      channel.readyState = "connecting";
      this.channels.push(channel);
      return channel;
    }

    close() {
      this.connectionState = "closed";
      // Native teardown events can be dispatched after a replacement exists.
    }
  }
  vi.stubGlobal("RTCPeerConnection", TestConnection);
  return connections;
}

function openControl(
  connection: ReturnType<typeof controlledConnections>[number],
) {
  const control = connection.channels[0];
  control.readyState = "open";
  control.onopen?.();
  return control;
}

function emptyHandlers(): ChannelHandlers {
  return {
    onOpen() {},
    onControl() {},
    onPayloadOpen() {},
    onPayloadData() {},
    onPayloadClosed() {},
  };
}

describe("peer replacement lifecycle", () => {
  it("does not let a retired discovery wait close its replacement", async () => {
    const connections = controlledConnections();
    const registry = new LinkRegistry(
      () => false,
      () => {},
      () => {},
    );
    registry.discover(["peer"]);
    const retired = registry.peek("peer");
    expect(connections).toHaveLength(1);

    registry.retain([]);
    const replacement = registry.get("peer");
    replacement.start();
    openControl(connections[1]);
    await Promise.resolve();
    await Promise.resolve();

    expect(replacement).not.toBe(retired);
    expect(registry.peek("peer")).toBe(replacement);
    expect(replacement.open).toBe(true);
    expect(connections[1].connectionState).toBe("new");
    registry.closeAll();
  });

  it("cleans up once before replacement and ignores delayed old native events", async () => {
    const connections = controlledConnections();
    const profiles = new Map<string, string>();
    const disconnected = vi.fn((peerId: string) => profiles.delete(peerId));
    const registry = new LinkRegistry(
      () => false,
      () => {},
      (link) => {
        link.listen({
          ...emptyHandlers(),
          onControl(message) {
            if (message.t === "profile")
              profiles.set(link.peerId, message.name);
          },
        });
        link.onDisconnect(() => disconnected(link.peerId));
      },
    );
    const retired = registry.get("peer");
    retired.start();
    const oldControl = openControl(connections[0]);
    const delayedClose = oldControl.onclose;
    const delayedMessage = oldControl.onmessage;
    const delayedStateChange = connections[0].onconnectionstatechange;
    oldControl.onmessage?.({
      data: JSON.stringify({ t: "profile", name: "Retired" }),
    });
    registry.drop("peer");
    expect(disconnected).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(profiles.size).toBe(0);

    const replacement = registry.get("peer");
    replacement.start();
    const control = openControl(connections[1]);
    control.onmessage?.({
      data: JSON.stringify({ t: "profile", name: "Replacement" }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(profiles.get("peer")).toBe("Replacement");

    delayedClose?.();
    delayedStateChange?.();
    delayedMessage?.({
      data: JSON.stringify({ t: "profile", name: "Late retired profile" }),
    });
    retired.close();
    await Promise.resolve();
    await Promise.resolve();

    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(profiles.get("peer")).toBe("Replacement");
    expect(replacement.open).toBe(true);
    registry.closeAll();
  });

  it("reports current native failure once and closes active payloads immediately", async () => {
    const connections = controlledConnections();
    const link = new PeerLink("peer", false, () => {});
    const closed = vi.fn();
    const disconnected = vi.fn();
    link.listen({ ...emptyHandlers(), onPayloadClosed: closed });
    link.onDisconnect(disconnected);
    link.start();
    const control = openControl(connections[0]);
    const opening = link.openPayload("0123456789abcdef");
    const payload = connections[0].channels[1];
    payload.readyState = "open";
    payload.onopen?.();
    await opening;

    connections[0].connectionState = "failed";
    connections[0].onconnectionstatechange?.();
    control.onclose?.();
    link.close();
    expect(payload.readyState).toBe("closed");
    expect(closed).toHaveBeenCalledTimes(1);
    expect(disconnected).toHaveBeenCalledTimes(1);
  });
});

describe("receiver flow control", () => {
  it("waits for processed bytes even when the network has already drained", async () => {
    const { link, id, control, payload, opening } = testLink();
    await opening;
    await link.sendData(id, new Uint8Array(4 * 1024 * 1024));
    let resolved = false;
    const sending = link.sendData(id, new Uint8Array(1024)).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(payload.send).toHaveBeenCalledTimes(1);
    // Out-of-range credits cannot release the window.
    control.onmessage?.({
      data: JSON.stringify({
        t: "credit",
        requestId: id,
        bytes: 8 * 1024 * 1024,
      }),
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    control.onmessage?.({
      data: JSON.stringify({ t: "credit", requestId: id, bytes: 1024 }),
    });
    await sending;
    expect(payload.send).toHaveBeenCalledTimes(2);
    link.close();
  });
  it("releases blocked uploads when the payload closes", async () => {
    const { link, id, opening } = testLink();
    await opening;
    await link.sendData(id, new Uint8Array(4 * 1024 * 1024));
    const sending = link.sendData(id, new Uint8Array(1));
    link.closePayload(id);
    await expect(sending).rejects.toThrow(/closed/);
    link.close();
  });
  it("acknowledges only after the sink consumes bytes and bounds hostile queues", async () => {
    let resume!: () => void;
    const stalled = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const { link, control, payload, opening, closed } = testLink(() => stalled);
    await opening;
    payload.onmessage?.({ data: new ArrayBuffer(4 * 1024 * 1024) });
    await Promise.resolve();
    expect(control.send).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++)
      payload.onmessage?.({ data: new ArrayBuffer(4 * 1024 * 1024) });
    expect(payload.readyState).toBe("closed");
    expect(closed).toHaveBeenCalledTimes(1);
    resume();
    link.close();
  });
});
