/** Passive, bounded native RTC evidence, written only after an E2E failure. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_EVENTS = 400;
const MAX_ERRORS = 40;

// Browser errors can contain SDP, addresses or application text. Keep their
// class/category, never their raw message, stack or argument values.
function errorSummary(error) {
  const name = String(error?.name ?? "Error");
  const message = String(error?.message ?? "").toLowerCase();
  return {
    name: /^[A-Za-z]+Error$/.test(name) ? name : "Error",
    category: /localstorage|sessionstorage|storage|property.?access/.test(
      message,
    )
      ? "storage"
      : /ice|candidate/.test(message)
        ? "ice-candidate"
        : /sdp|description/.test(message)
          ? "session-description"
          : /state|closed/.test(message)
            ? "state"
            : /service.worker|download helper/.test(message)
              ? "download-helper"
              : /crypto|decrypt|encrypt|key/.test(message)
                ? "cryptography"
                : /network|socket|connection/.test(message)
                  ? "network"
                  : /timeout|timed out/.test(message)
                    ? "timeout"
                    : "other",
  };
}

function installNativeRtcDiagnostics() {
  const limit = 400;
  const peers = [];
  const events = [];
  let droppedEvents = 0;
  let omittedPeers = 0;
  const started = performance.now();
  const record = (event) => {
    if (events.length === limit) {
      events.shift();
      droppedEvents += 1;
    }
    events.push({ atMs: Math.round(performance.now() - started), ...event });
  };
  const classifyError = (error) => {
    const name = String(error?.name ?? "Error");
    const message = String(error?.message ?? "").toLowerCase();
    return {
      name: /^[A-Za-z]+Error$/.test(name) ? name : "Error",
      category: /ice|candidate/.test(message)
        ? "ice-candidate"
        : /sdp|description/.test(message)
          ? "session-description"
          : /state|closed/.test(message)
            ? "state"
            : "other",
    };
  };
  // Observation must never throw into a native method or event handler.
  const observe = (action) => {
    try {
      action();
    } catch {
      record({ event: "observation-unavailable" });
    }
  };
  const stateOf = (peer) => ({
    connection: peer.connectionState,
    ice: peer.iceConnectionState,
    gathering: peer.iceGatheringState,
    signaling: peer.signalingState,
  });
  const candidateSummary = (candidate) => {
    if (!candidate) return { type: "end", addressKind: "none" };
    const tokens = String(candidate.candidate ?? "").split(/\s+/);
    const type = candidate.type ?? tokens[tokens.indexOf("typ") + 1];
    const address = candidate.address ?? tokens[4] ?? "";
    return {
      type: ["host", "srflx", "prflx", "relay"].includes(type) ? type : "other",
      addressKind: !address
        ? "none"
        : /\.local\.?$/i.test(address)
          ? "mdns"
          : /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)
            ? "ipv4"
            : address.includes(":")
              ? "ipv6"
              : "hostname",
    };
  };
  const countCandidate = (item, direction, candidate) => {
    const summary = candidateSummary(candidate);
    const counts = item.candidates[direction];
    const kind = `${summary.type}/${summary.addressKind}`;
    counts[kind] = Math.min((counts[kind] ?? 0) + 1, 9999);
    record({ peer: item.id, event: "candidate", direction, ...summary });
  };
  const controlKinds = new Set([
    "profile",
    "envelope",
    "ready",
    "credit",
    "complete",
    "end",
    "abort",
  ]);
  const controlKind = (data) => {
    // Do not inspect binary buffers or parse unbounded message bodies. Only
    // the public outer discriminator survives this observational read.
    if (typeof data !== "string" || data.length > 64 * 1024) return "other";
    try {
      const frame = JSON.parse(data);
      return controlKinds.has(frame?.t) ? frame.t : "other";
    } catch {
      return "other";
    }
  };
  const observePeer = (peer) => {
    if (peers.length === 32) {
      omittedPeers += 1;
      return;
    }
    const item = {
      id: peers.length + 1,
      peer,
      candidates: { local: {}, remote: {} },
      methods: {},
      channels: [],
      omittedChannels: 0,
    };
    peers.push(item);
    record({ peer: item.id, event: "created", ...stateOf(peer) });
    for (const event of [
      "connectionstatechange",
      "iceconnectionstatechange",
      "icegatheringstatechange",
      "signalingstatechange",
      "negotiationneeded",
    ]) {
      peer.addEventListener(event, () =>
        observe(() => record({ peer: item.id, event, ...stateOf(peer) })),
      );
    }
    peer.addEventListener("icecandidate", ({ candidate }) =>
      observe(() => countCandidate(item, "local", candidate)),
    );
    peer.addEventListener("icecandidateerror", (event) =>
      observe(() =>
        record({
          peer: item.id,
          event: "icecandidateerror",
          code: Number.isInteger(event.errorCode) ? event.errorCode : null,
        }),
      ),
    );
    const observedChannels = new WeakSet();
    const observeChannel = (channel, direction) => {
      if (observedChannels.has(channel)) return;
      observedChannels.add(channel);
      if (item.channels.length === 32) {
        item.omittedChannels += 1;
        return;
      }
      const channelItem = {
        id: item.channels.length + 1,
        kind:
          channel.label === "bonjou-control"
            ? "control"
            : channel.label.startsWith("bonjou-file:")
              ? "payload"
              : "other",
        direction,
        state: channel.readyState,
      };
      item.channels.push(channelItem);
      const channelState = () => ({
        id: channelItem.id,
        kind: channelItem.kind,
        direction: channelItem.direction,
        state: channelItem.state,
      });
      record({ peer: item.id, event: "channel-created", ...channelState() });
      for (const event of ["open", "close", "error"]) {
        channel.addEventListener(event, () =>
          observe(() => {
            channelItem.state = channel.readyState;
            record({
              peer: item.id,
              event: `channel-${event}`,
              ...channelState(),
            });
          }),
        );
      }
      if (channelItem.kind === "control") {
        channelItem.messages = { sent: {}, received: {} };
        const countControl = (direction, data) => {
          const type = controlKind(data);
          const counts = channelItem.messages[direction];
          counts[type] = Math.min((counts[type] ?? 0) + 1, 9999);
          record({
            peer: item.id,
            channel: channelItem.id,
            event: "control-message",
            direction,
            type,
          });
        };
        channel.addEventListener("message", (event) =>
          observe(() => countControl("received", event.data)),
        );
        const nativeSend = channel.send;
        Object.defineProperty(channel, "send", {
          configurable: true,
          writable: true,
          value: new Proxy(nativeSend, {
            apply(target, receiver, args) {
              // Count only a successful native send, preserving its receiver,
              // return value and any thrown error exactly as they were.
              const result = Reflect.apply(target, receiver, args);
              observe(() => countControl("sent", args[0]));
              return result;
            },
          }),
        });
      }
    };
    peer.addEventListener("datachannel", ({ channel }) =>
      observe(() => observeChannel(channel, "incoming")),
    );
    for (const method of [
      "createOffer",
      "createAnswer",
      "setLocalDescription",
      "setRemoteDescription",
      "addIceCandidate",
      "createDataChannel",
    ]) {
      const native = peer[method];
      if (typeof native !== "function") continue;
      observe(() => {
        Object.defineProperty(peer, method, {
          configurable: true,
          writable: true,
          value: new Proxy(native, {
            apply(target, receiver, args) {
              let result;
              try {
                result = Reflect.apply(target, receiver, args);
              } catch (error) {
                observe(() =>
                  record({
                    peer: item.id,
                    event: "method-threw",
                    method,
                    ...classifyError(error),
                  }),
                );
                throw error;
              }
              observe(() => {
                item.methods[method] = Math.min(
                  (item.methods[method] ?? 0) + 1,
                  9999,
                );
                record({ peer: item.id, event: "method-called", method });
                if (method === "addIceCandidate")
                  countCandidate(item, "remote", args[0]);
                if (method === "createDataChannel")
                  observeChannel(result, "outgoing");
                else {
                  // Return the original native promise below. These handlers
                  // observe its settlement; no await, replacement or delay.
                  Promise.prototype.then.call(
                    result,
                    () =>
                      observe(() =>
                        record({
                          peer: item.id,
                          event: "method-fulfilled",
                          method,
                          ...stateOf(peer),
                        }),
                      ),
                    (error) =>
                      observe(() =>
                        record({
                          peer: item.id,
                          event: "method-rejected",
                          method,
                          ...classifyError(error),
                        }),
                      ),
                  );
                }
              });
              return result;
            },
          }),
        });
      });
    }
  };
  Object.defineProperty(window, "__bonjouRtcDiagnostics", {
    configurable: true,
    value: {
      snapshot: () => ({
        nativeApis: {
          peerConnection: typeof RTCPeerConnection,
          dataChannel: typeof RTCDataChannel,
          secureContext: window.isSecureContext,
          webCrypto: typeof crypto?.subtle !== "undefined",
        },
        omittedPeers,
        droppedEvents,
        peers: peers.map(({ peer, ...item }) => ({
          ...item,
          ...stateOf(peer),
        })),
        events,
      }),
    },
  });
  if (typeof RTCPeerConnection === "function") {
    window.RTCPeerConnection = new Proxy(RTCPeerConnection, {
      construct(target, args, newTarget) {
        const peer = Reflect.construct(target, args, newTarget);
        observe(() => observePeer(peer));
        return peer;
      },
    });
  }
}

export function createRtcDiagnostics({ output, suite }) {
  const pages = [];
  const frameTypes = new Set([
    "hello",
    "signal",
    "created",
    "joined",
    "roster",
    "peer_left",
    "error",
    "create",
    "join",
  ]);
  const errorCodes = new Set([
    "network_busy",
    "no_room",
    "network_mismatch",
    "room_full",
    "already_in_room",
    "bad_request",
    "capacity",
    "rate_limited",
    "decrypt_failed",
    "no_peer",
    "not_in_room",
    "unsupported_message",
  ]);
  const trackPage = (page, label) => {
    const item = {
      page,
      label,
      pageErrors: [],
      sockets: [],
      events: [],
      droppedEvents: 0,
    };
    pages.push(item);
    const record = (event) => {
      if (item.events.length === MAX_EVENTS) {
        item.events.shift();
        item.droppedEvents += 1;
      }
      item.events.push({ at: new Date().toISOString(), ...event });
    };
    page.on("pageerror", (error) => {
      if (item.pageErrors.length < MAX_ERRORS)
        item.pageErrors.push(errorSummary(error));
      record({ event: "pageerror", ...errorSummary(error) });
    });
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname !== "/ws" || item.sockets.length >= 16)
        return;
      const state = {
        id: item.sockets.length + 1,
        sent: {},
        received: {},
        rosterCount: null,
        closed: false,
      };
      item.sockets.push(state);
      for (const [event, direction] of [
        ["framesent", "sent"],
        ["framereceived", "received"],
      ]) {
        socket.on(event, ({ payload }) => {
          let frame;
          try {
            if (payload.length > 1024 * 1024) return;
            frame = JSON.parse(String(payload));
          } catch {
            record({ socket: state.id, event: "unparseable-frame", direction });
            return;
          }
          const type = frameTypes.has(frame?.type) ? frame.type : "other";
          state[direction][type] = Math.min(
            (state[direction][type] ?? 0) + 1,
            9999,
          );
          const summary = {
            socket: state.id,
            event: "coordinator-frame",
            direction,
            type,
          };
          if (type === "roster") {
            state.rosterCount = Array.isArray(frame.peers)
              ? Math.min(frame.peers.length, 9999)
              : 0;
            summary.rosterCount = state.rosterCount;
          }
          if (type === "error")
            summary.code = errorCodes.has(frame.code_error)
              ? frame.code_error
              : "other";
          record(summary);
        });
      }
      socket.on("close", () => {
        state.closed = true;
        record({ socket: state.id, event: "coordinator-close" });
      });
      socket.on("socketerror", () =>
        record({ socket: state.id, event: "coordinator-socketerror" }),
      );
    });
  };
  return {
    async observeContext(context, label) {
      await context.addInitScript(installNativeRtcDiagnostics);
      let sequence = 0;
      context.on("page", (page) => trackPage(page, `${label}-${++sequence}`));
    },
    async captureFailure(error) {
      await mkdir(output, { recursive: true });
      await Promise.all(
        pages.map(async ({ page, ...item }, index) => {
          const file = `${String(index + 1).padStart(2, "0")}-${item.label.replace(/[^A-Za-z0-9_-]/g, "-")}-failure`;
          let runtime = {
            unavailable: page.isClosed()
              ? "page-closed-before-failure"
              : "snapshot-unavailable",
          };
          if (!page.isClosed()) {
            runtime = await page
              .evaluate(
                () =>
                  window.__bonjouRtcDiagnostics?.snapshot() ?? {
                    unavailable: "not-installed",
                  },
              )
              .catch(() => runtime);
            await page
              .screenshot({
                path: join(output, `${file}.png`),
                fullPage: true,
                timeout: 5000,
              })
              .catch(() => {});
          }
          const evidence = {
            suite,
            failure: errorSummary(error),
            ...item,
            runtime,
          };
          await writeFile(
            join(output, `${file}.json`),
            `${JSON.stringify(evidence, null, 2)}\n`,
          );
          console.error(
            `${suite} ${item.label} diagnostics: ${JSON.stringify({ sockets: item.sockets, pageErrors: item.pageErrors, peers: runtime.peers?.map(({ id, connection, ice, gathering, signaling, candidates, channels }) => ({ id, connection, ice, gathering, signaling, candidates, controlChannels: channels.filter(({ kind }) => kind === "control") })), unavailable: runtime.unavailable })}`,
          );
        }),
      );
    },
  };
}
