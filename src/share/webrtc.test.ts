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
import { PeerLink } from "./webrtc";

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
