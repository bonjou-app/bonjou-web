/** End-to-end protocol smoke test for a running Bonjou coordinator. */

import { x25519 } from "@noble/curves/ed25519.js";

const BASE = (
  process.env.COORDINATOR ??
  process.env.RELAY ??
  "http://127.0.0.1:46330"
).replace(/\/$/, "");
const WS_URL = `${BASE.replace(/^http/, "ws")}/ws`;
const AAD = new TextEncoder().encode("bonjou.v2");
const enc = new TextEncoder();

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const unhex = (value) => new Uint8Array(Buffer.from(value, "hex"));

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdfExpand(secret, info, length = 32) {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const out = new Uint8Array(length);
  let previous = new Uint8Array(0);
  let written = 0;
  for (let counter = 1; written < length; counter += 1) {
    const block = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        concat(previous, info, Uint8Array.of(counter)),
      ),
    );
    const take = Math.min(block.length, length - written);
    out.set(block.subarray(0, take), written);
    written += take;
    previous = block;
  }
  return out;
}

async function sharedSecret(privateKey, publicKeyHex) {
  const raw = x25519.getSharedSecret(privateKey, unhex(publicKeyHex));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
}

async function sealEnvelope(envelope, shared) {
  const key = await crypto.subtle.importKey(
    "raw",
    await hkdfExpand(shared, enc.encode("bonjou/v2/envelope")),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: AAD, tagLength: 128 },
      key,
      enc.encode(JSON.stringify(envelope)),
    ),
  );
  return JSON.stringify({
    v: 2,
    n: hex(nonce),
    c: Buffer.from(ciphertext).toString("base64"),
  });
}

async function openEnvelope(frame, shared) {
  const sealed = JSON.parse(frame);
  const key = await crypto.subtle.importKey(
    "raw",
    await hkdfExpand(shared, enc.encode("bonjou/v2/envelope")),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unhex(sealed.n),
      additionalData: AAD,
      tagLength: 128,
    },
    key,
    new Uint8Array(Buffer.from(sealed.c, "base64")),
  );
  return JSON.parse(Buffer.from(plain).toString("utf8"));
}

function keypair() {
  const privateKey = x25519.utils.randomSecretKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

function connect(label, keys) {
  const socket = new WebSocket(WS_URL);
  const waiters = [];
  const backlog = [];
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(event.data);
    const index = waiters.findIndex((waiter) => waiter.match(frame));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(frame);
    else backlog.push(frame);
  });
  const peer = {
    label,
    keys,
    socket,
    id: "",
    send(frame) {
      socket.send(JSON.stringify(frame));
    },
    expect(match, description, timeoutMs = 20_000) {
      const index = backlog.findIndex(match);
      if (index >= 0) return Promise.resolve(backlog.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error(`${label}: timed out waiting for ${description}`)),
          timeoutMs,
        );
        waiters.push({
          match,
          resolve(frame) {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      });
    },
  };
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(peer));
    socket.addEventListener("error", () =>
      reject(new Error(`${label}: WebSocket failed`)),
    );
  });
}

let failures = 0;
function check(label, ok, detail = "") {
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? `: ${detail}` : ""}`,
  );
  if (!ok) failures += 1;
}

async function enterLobby(peer) {
  peer.send({ type: "hello", pubkey: hex(peer.keys.publicKey) });
  const joined = await peer.expect(
    (frame) => frame.type === "joined",
    "lobby join",
  );
  peer.id = joined.peer_id;
}

async function main() {
  console.log(`coordinator: ${BASE}`);
  const health = await fetch(`${BASE}/healthz`).then((response) =>
    response.json(),
  );
  check(
    "health endpoint responds",
    health.status === "ok",
    JSON.stringify(health),
  );
  check("health has no transfer data plane", !("transfers" in health));

  const alice = await connect("alice", keypair());
  const bob = await connect("bob", keypair());
  await enterLobby(alice);
  await enterLobby(bob);

  const lobbyRoster = await alice.expect(
    (frame) =>
      frame.type === "roster" &&
      frame.peers?.some((peer) => peer.id === bob.id),
    "same-network candidate",
  );
  const bobCandidate = lobbyRoster.peers.find((peer) => peer.id === bob.id);
  check("roster exposes no display name", !("name" in bobCandidate));
  check(
    "roster carries only the public session key",
    bobCandidate.pubkey === hex(bob.keys.publicKey),
  );

  alice.send({ type: "create" });
  const created = await alice.expect(
    (frame) => frame.type === "created",
    "room creation",
  );
  check("room created", Boolean(created.code), created.code);
  bob.send({ type: "join", code: created.code });
  const joined = await bob.expect(
    (frame) => frame.type === "joined" && frame.code,
    "room join",
  );
  check("second peer joined the same room", joined.code === created.code);

  await alice.expect(
    (frame) =>
      frame.type === "roster" &&
      frame.peers?.some((peer) => peer.id === bob.id),
    "room roster",
  );

  const aliceShared = await sharedSecret(
    alice.keys.privateKey,
    hex(bob.keys.publicKey),
  );
  const bobShared = await sharedSecret(
    bob.keys.privateKey,
    hex(alice.keys.publicKey),
  );
  check(
    "both peers derive the same signal key",
    hex(aliceShared) === hex(bobShared),
  );

  const offer = {
    kind: "rtc_offer",
    from: "",
    from_ip: "",
    to: "",
    name: "",
    size: 0,
    ts: Math.floor(Date.now() / 1000),
    message: JSON.stringify({ type: "offer", sdp: "v=0\\r\\n" }),
    checksum: "",
    hmac: "",
  };
  alice.send({
    type: "signal",
    to: bob.id,
    payload: await sealEnvelope(offer, aliceShared),
  });
  const signal = await bob.expect(
    (frame) => frame.type === "signal",
    "opaque signal",
  );
  check("coordinator preserves opaque signal bytes", signal.from === alice.id);
  check(
    "recipient decrypts signaling",
    (await openEnvelope(signal.payload, bobShared)).kind === "rtc_offer",
  );

  alice.send({ type: "transfer_begin", to: bob.id, size: 1 });
  const legacy = await alice.expect(
    (frame) =>
      frame.type === "error" && frame.code_error === "unsupported_message",
    "legacy payload rejection",
  );
  check(
    "legacy payload frames are rejected",
    legacy.code_error === "unsupported_message",
  );

  const payloadRoute = await fetch(`${BASE}/t/not-a-transfer`, {
    method: "POST",
  });
  check(
    "HTTP payload endpoint is absent",
    payloadRoute.status === 404,
    String(payloadRoute.status),
  );

  alice.socket.close();
  bob.socket.close();
  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nsmoke test failed: ${err.stack ?? err}`);
  process.exit(1);
});
