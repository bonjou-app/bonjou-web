/** Check deployed ingress header spoof resistance using synthetic room membership only. */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { channel } from "node:diagnostics_channel";

const TIMEOUT_MS = 10_000;
const ownedPeers = new Set();

function httpURL(value, label) {
  const url = new URL(value);
  assert.ok(["https:", "http:"].includes(url.protocol), `${label} must use HTTP(S)`);
  assert.equal(url.username + url.password + url.search + url.hash, "", `${label} must not contain credentials, a query, or a fragment`);
  return url;
}

async function configuration() {
  const app = httpURL(process.env.APP_URL ?? "https://bonjou.vercel.app", "APP_URL");
  const originURL = httpURL(process.env.APP_ORIGIN ?? app.origin, "APP_ORIGIN");
  assert.equal(originURL.pathname, "/", "APP_ORIGIN must be an exact origin without a path");
  let configured = process.env.COORDINATOR;
  if (!configured) {
    const response = await fetch(`${app.origin}/coordinator-config.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    assert.equal(response.status, 200, "Deployed coordinator configuration must be accessible");
    const config = await response.json();
    assert.equal(config.version, 1, "Unexpected coordinator configuration version");
    assert.equal(typeof config.coordinator, "string", "Missing deployed coordinator URL");
    if (process.env.EXPECT_APP_REVISION)
      assert.equal(config.revision, process.env.EXPECT_APP_REVISION.toLowerCase(), "Production alias is not serving the expected source revision");
    configured = config.coordinator;
  }
  const coordinator = httpURL(configured, "COORDINATOR");
  if (originURL.protocol === "https:")
    assert.equal(coordinator.protocol, "https:", "HTTPS app needs a secure coordinator");
  const base = coordinator.href.replace(/\/+$/, "");
  return { origin: originURL.origin, base, wsURL: `${base.replace(/^http/, "ws")}/ws` };
}

class RejectedUpgrade extends Error {
  constructor(status) {
    super(`WebSocket upgrade rejected with HTTP ${status}`);
    this.status = status;
  }
}

function publicKey() {
  // SPKI for X25519 ends with the 32-byte public key. Private material never
  // leaves this process; the coordinator receives only the synthetic public key.
  const { publicKey: key } = generateKeyPairSync("x25519");
  return key.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
}

async function connect(config, label, extraHeaders = []) {
  const headers = new Headers([["Origin", config.origin], ...extraHeaders]);
  const handshakeURL = new URL(config.wsURL.replace(/^ws/, "http"));
  let requestIdentity;
  let status;
  // Native WebSocket hides HTTP rejection status. Observe only this handshake's
  // numeric status so DNS/TLS failures and timeouts cannot count as safe rejection.
  const created = channel("undici:request:create");
  const received = channel("undici:request:headers");
  const onCreated = ({ request }) => {
    if (String(request.origin) === handshakeURL.origin && request.path === handshakeURL.pathname)
      requestIdentity = request;
  };
  const onReceived = ({ request, response }) => {
    if (request === requestIdentity) status = response.statusCode;
  };
  created.subscribe(onCreated);
  received.subscribe(onReceived);
  let peer;
  try {
    const socket = new WebSocket(config.wsURL, { headers });
    const backlog = [];
    const waiters = new Set();
    let terminalError;
    const fail = (error) => {
      terminalError ??= error;
      for (const waiter of waiters) waiter.reject(error);
    };
    peer = {
      label, socket, id: "",
      send(frame) {
        if (terminalError) throw terminalError;
        assert.equal(socket.readyState, WebSocket.OPEN, `${label}: socket is not open`);
        socket.send(JSON.stringify(frame));
      },
      expect(match, description, expectedErrorCode) {
        if (terminalError) return Promise.reject(terminalError);
        const index = backlog.findIndex(match);
        if (index >= 0) return Promise.resolve(backlog.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
          const settle = (callback, value) => {
            clearTimeout(timer);
            waiters.delete(waiter);
            callback(value);
          };
          const waiter = {
            match,
            expectedErrorCode,
            resolve: (frame) => settle(resolve, frame),
            reject: (error) => settle(reject, error),
          };
          const timer = setTimeout(() => waiter.reject(new Error(`${label}: timed out waiting for ${description}`)), TIMEOUT_MS);
          waiters.add(waiter);
        });
      },
    };
    ownedPeers.add(peer);
    socket.addEventListener("message", (event) => {
      try {
        assert.equal(typeof event.data, "string");
        assert.ok(event.data.length <= 128 * 1024);
        const frame = JSON.parse(event.data);
        assert.ok(frame && typeof frame === "object" && !Array.isArray(frame));
        const waiter = [...waiters].find((candidate) => candidate.match(frame));
        if (frame.type === "error") {
          // Only the dedicated cross-network probe may consume its exact
          // expected control error. Other errors remain terminal failures.
          if (waiter?.expectedErrorCode && waiter.expectedErrorCode === frame.code_error) {
            waiter.resolve(frame);
            return;
          }
          // Avoid logging server-supplied text, addresses, rosters, or user state.
          fail(new Error(frame.code_error === "network_mismatch"
            ? `${label}: ingress changed the source network; reference-room join rejected`
            : `${label}: coordinator rejected a control message`));
          return;
        }
        if (waiter) waiter.resolve(frame);
        else if (backlog.length < 128) backlog.push(frame);
        else fail(new Error(`${label}: unexpected control-frame backlog`));
      } catch {
        fail(new Error(`${label}: malformed coordinator control frame`));
      }
    });
    socket.addEventListener("close", () => fail(new Error(`${label}: coordinator socket closed`)));
    socket.addEventListener("error", () => fail(new Error(`${label}: coordinator socket failed`)));
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onError);
        if (error) reject(error);
        else resolve();
      };
      const onOpen = () => finish();
      const onError = () => finish(
        (status >= 400 && status < 500) || status === 503
          ? new RejectedUpgrade(status)
          : new Error(`${label}: WebSocket handshake failed without a permitted HTTP rejection`),
      );
      const timer = setTimeout(() => finish(new Error(`${label}: WebSocket did not open within 10 seconds`)), TIMEOUT_MS);
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onError, { once: true });
    });
    return peer;
  } catch (error) {
    if (peer) await closePeer(peer);
    throw error;
  } finally {
    created.unsubscribe(onCreated);
    received.unsubscribe(onReceived);
  }
}

async function closePeer(peer) {
  if (peer.socket.readyState === WebSocket.CLOSED) {
    ownedPeers.delete(peer);
    return;
  }
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      peer.socket.removeEventListener("close", finish);
      resolve();
    };
    const timer = setTimeout(finish, 2_000);
    peer.socket.addEventListener("close", finish, { once: true });
    peer.socket.close();
  });
  if (peer.socket.readyState === WebSocket.CLOSED) ownedPeers.delete(peer);
}

async function hello(peer) {
  peer.send({ type: "hello", pubkey: publicKey() });
  const joined = await peer.expect((frame) => frame.type === "joined" && !frame.code, "hello acknowledgment");
  assert.equal(typeof joined.peer_id, "string", `${peer.label}: missing peer id`);
  assert.ok(joined.peer_id, `${peer.label}: empty peer id`);
  peer.id = joined.peer_id;
}

async function joinReference(config, reference, code, label, headers = []) {
  const peer = await connect(config, label, headers);
  try {
    await hello(peer);
    peer.send({ type: "join", code });
    const joined = await peer.expect((frame) => frame.type === "joined" && frame.code === code, "same-source reference-room join");
    assert.equal(joined.peer_id, peer.id, `${label}: peer identity changed`);
    await peer.expect(
      (frame) => frame.type === "roster" && frame.peers?.some((candidate) => candidate.id === reference.id),
      "reference membership",
    );
    await reference.expect(
      (frame) => frame.type === "roster" && frame.peers?.some((candidate) => candidate.id === peer.id),
      "probe membership",
    );
  } finally {
    await closePeer(peer);
  }
}

async function rejectCrossNetworkRoom(config, externalCode, referenceCode) {
  const peer = await connect(config, "cross-network isolation control");
  try {
    await hello(peer);
    peer.send({ type: "join", code: externalCode });
    const outcome = await peer.expect(
      (frame) => frame.type === "joined" || (frame.type === "error" && frame.code_error === "network_mismatch"),
      "explicit cross-network room rejection",
      "network_mismatch",
    );
    assert.equal(outcome.type, "error", "Cross-network room joined: ingress may collapse unrelated source networks");
    assert.equal(outcome.code_error, "network_mismatch", "Cross-network isolation needs the exact canonical rejection");
    // A missing/expired room (`no_room`), upgrade failure, generic error, and
    // timeout do not prove isolation. The same ordinary socket must stay usable.
    peer.send({ type: "join", code: referenceCode });
    const joined = await peer.expect((frame) => frame.type === "joined" && frame.code === referenceCode, "same-source room join after cross-network rejection");
    assert.equal(joined.peer_id, peer.id, "Cross-network control peer identity changed");
    console.log("  ok  external room rejected with network_mismatch; same-source room remains accessible");
  } finally {
    await closePeer(peer);
  }
}

async function main() {
  const config = await configuration();
  console.log(`Checking coordinator ingress ${config.base} for ${config.origin}`);
  const reference = await connect(config, "ordinary reference");
  await hello(reference);
  reference.send({ type: "create" });
  const created = await reference.expect((frame) => frame.type === "created" && frame.code, "reference-room creation");
  assert.equal(created.peer_id, reference.id, "Reference peer identity changed");
  await joinReference(config, reference, created.code, "ordinary control");
  console.log("  ok  ordinary peers join the same source-scoped room");

  const probes = [
    ["forged X-Forwarded-For single", [["X-Forwarded-For", "198.51.100.17"]]],
    ["forged X-Forwarded-For chain", [["X-Forwarded-For", "198.51.100.17, 203.0.113.19"]]],
    ["forged X-Forwarded-For repeated values (coalesced)", [["X-Forwarded-For", "198.51.100.17"], ["X-Forwarded-For", "203.0.113.19"]]],
    ["forged X-Forwarded-For invalid", [["X-Forwarded-For", "invalid-address"]]],
    ["forged X-Real-IP", [["X-Real-IP", "198.51.100.23"]]],
    ["forged CF-Connecting-IP", [["CF-Connecting-IP", "203.0.113.29"]]],
  ];
  for (const [label, headers] of probes) {
    try {
      await joinReference(config, reference, created.code, label, headers);
      console.log(`  ok  ${label}: ingress preserves reference network`);
    } catch (error) {
      if (!(error instanceof RejectedUpgrade)) throw error;
      // Rejection only passes if an ordinary peer still works immediately after
      // it. A service outage, rate-limit blanket, or transport error must fail.
      await joinReference(config, reference, created.code, `${label} ordinary recovery control`);
      console.log(`  ok  ${label}: HTTP ${error.status} rejection; ordinary control still works`);
    }
  }
  if (process.env.CROSS_NETWORK_ROOM_CODE) {
    // The operator must hold this room open from an independently verified
    // different egress source while this job runs against the same coordinator.
    await rejectCrossNetworkRoom(config, process.env.CROSS_NETWORK_ROOM_CODE, created.code);
  }
  console.log("Ingress spoof checks passed. Scope: one egress source; no application payloads sent.");
  console.log(process.env.CROSS_NETWORK_ROOM_CODE
    ? "Additional coverage: a live external room rejected from this egress source. Distinct duplicate HTTP header lines and physical device discovery remain untested."
    : "Not covered: distinct duplicate HTTP header lines, separate physical networks, or proxy-address collapse across networks.");
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error(`Ingress check failed: ${error.message}`);
} finally {
  await Promise.all([...ownedPeers].map(closePeer));
  if (ownedPeers.size) {
    exitCode = 1;
    console.error("Ingress check failed: a socket did not acknowledge cleanup within 2 seconds");
  }
}
// Termination also releases any transport that failed its bounded close wait.
process.exit(exitCode);
