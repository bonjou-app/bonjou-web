# Bonjou Web LAN-Only Implementation Plan

Date: 2026-08-31
Design: `docs/superpowers/specs/2026-08-31-bonjou-web-lan-only-design.md`

## Working rules

- Preserve the existing uncommitted website redesign. Patch overlapping React,
  CSS, package, and Vite files in place.
- Keep the CLI network stack unchanged.
- Add a failing test before each protocol or transport behavior change.
- Keep metadata-first approval and the Go/browser crypto vectors green through
  every phase.
- Do not restore the HTTP payload relay as a compatibility fallback.

## Phase 1: Establish the baseline

1. Record `git status --short` and the current diff summary.
2. Run `go test ./...`, `cd website && npm test`, and
   `cd website && npm run build` before editing implementation files.
3. Record pre-existing failures. Fix only failures caused by this work.
4. Inspect the current relay limits, room lifecycle, WebRTC state machine,
   service worker, session hook, and room UI before patching them.

## Phase 2: Reduce the Go service to rendezvous responsibilities

### 2.1 Protocol tests

Files:

- `internal/relay/protocol.go`
- `internal/relay/conn.go`
- `internal/relay/conn_test.go` or the closest existing relay test file

Tests must prove:

- `hello` accepts an ephemeral public key without a display name.
- `signal` forwards a bounded opaque signaling payload to an authorized peer.
- different network groups cannot signal one another;
- deprecated `relay`, `transfer_begin`, and `transfer_end` frames receive stable
  protocol errors; and
- the service rejects malformed keys, missing destinations, oversized payloads,
  and unknown peers.

Implementation:

- Replace generic application relay messages with a signaling-specific frame.
- Remove transfer roles, tokens, sizes, ids, and completion state from the
  WebSocket protocol.
- Remove the display name from server-side peer records and roster frames.
- Keep peer id, public key, candidate source, and room membership.
- Apply a small signal payload limit and per-peer signal rate limit.

### 2.2 Network-group and room isolation tests

Files:

- `internal/relay/room.go`
- `internal/relay/room_test.go`
- `internal/relay/code.go`
- `internal/relay/code_test.go`

Tests must prove:

- IPv4 clients group by observed address;
- IPv6 clients group by normalized `/64` prefix;
- room creation stores the creator's network-group key;
- a join from a different network group receives `network_mismatch` without a
  roster or room details;
- a room only contributes candidates from its bound network group;
- room codes still normalize and expire; and
- a network group accepts 100 clients within the new 128-candidate cap.

Implementation:

- Separate the observed address from the normalized network-group key.
- Bind each code room to one network-group key.
- Restrict `Reachable`, roster creation, room joins, and signaling lookups to
  that key.
- Raise `MaxNetworkPeers` to 128 and retain global connection and rate limits.

### 2.3 Delete the payload data plane

Files:

- `internal/relay/server.go`
- `internal/relay/rendezvous.go`
- `internal/relay/rendezvous_test.go`
- `internal/relay/limits.go`
- `cmd/bonjou-relay/main.go`

Tests must prove:

- `/healthz` reports presence and room state without transfer fields;
- `/t`, `/t/{id}`, `/t/{id}/{seq}`, and `/t/{id}/end` have no registered
  handlers; and
- the server starts, handles WebSockets, and shuts down without a rendezvous
  worker.

Implementation:

- Delete `Rendezvous`, transfer ownership, upload/download handlers, token CORS
  headers, and transfer timeouts.
- Keep `/healthz`, `/ws`, origin checks, proxy-aware client address handling,
  and room sweeping.
- Update package and command comments to describe discovery and signaling.

Run after Phase 2:

```bash
gofmt -w internal/relay cmd/bonjou-relay
go test ./internal/relay ./cmd/bonjou-relay
go test -race ./internal/relay
```

## Phase 3: Build the direct browser application protocol

### 3.1 Define and test direct messages

Files:

- new `website/src/share/directProtocol.ts`
- new `website/src/share/directProtocol.test.ts`
- `website/src/share/crypto.ts`

Define typed messages for profile exchange, chat, file offer, approval, decline,
cancellation, transfer result, ping, and pong. Each room message carries its
room id and each file state change carries one request id.

Tests must cover validation, malformed input, room ids, request ids, size
bounds, and encryption round trips. Reuse the existing sealed-envelope format
instead of creating a third cryptographic format.

### 3.2 Refactor WebRTC into control and payload channels

Files:

- `website/src/share/webrtc.ts`
- new `website/src/share/webrtc.test.ts`

Tests must prove:

- `RTCPeerConnection` receives `iceServers: []`;
- the client forwards host candidates and drops server-reflexive and relay
  candidates;
- public-key ordering selects one initiator;
- the negotiation scheduler runs no more than eight links at once;
- the control channel opens before the profile becomes visible;
- one payload channel maps to one approved request id;
- chat can cross the control channel while payload backpressure stalls a file;
  and
- close, timeout, authentication failure, and duplicate-channel paths release
  their resources.

Implementation:

- Keep one reliable ordered `bonjou-control` channel per verified peer.
- Create one ordered payload channel for each approved transfer and close it at
  the terminal state.
- Move begin and end markers onto the payload channel.
- Keep acknowledgements, declines, cancellation, and results on the control
  channel.
- Expose small interfaces so Vitest can supply an `RTCPeerConnection` test
  double without browser globals.

### 3.3 Narrow the hosted client to rendezvous traffic

Files:

- `website/src/share/relay.ts`
- new `website/src/share/relay.test.ts`

Tests must prove:

- `hello` sends the public key without the display name;
- roster entries contain opaque candidate data;
- create and join retain room behavior;
- the client sends only `signal` frames after connection;
- reconnect restores network and room membership intent; and
- transfer and generic application relay methods no longer exist.

Implementation:

- Rename public types to rendezvous terms where the change does not create UI
  churn.
- Keep the file name for a focused diff if a rename would touch unrelated user
  work.
- Forward sealed WebRTC signaling through the dedicated server frame.

Run after Phase 3:

```bash
cd website && npx vitest run src/share/directProtocol.test.ts src/share/webrtc.test.ts src/share/relay.test.ts
```

## Phase 4: Move session behavior onto direct channels

Files:

- `website/src/share/useSession.ts`
- new `website/src/share/sessionState.ts`
- new `website/src/share/sessionState.test.ts`
- `website/src/share/tabs.ts`
- `website/src/share/verified.ts`

Tests must prove:

- an opaque candidate stays hidden until the profile handshake succeeds;
- lobby chat fans out to verified peers and records partial delivery;
- a direct conversation targets one peer;
- room chat reaches current verified members and a recipient drops a stale-room
  message;
- late joiners receive no history;
- one browser's sibling tabs stay out of the roster;
- offer, approval, decline, cancellation, and result states agree on both ends;
- the sender runs no more than four payload transfers at once;
- a failed direct path produces a terminal failure on both ends; and
- rendezvous loss keeps existing direct sessions while freezing discovery and
  membership changes.

Implementation:

- Extract pure roster, room, broadcast, and transfer queue transitions into
  `sessionState.ts`.
- Send profile, chat, and transfer-control messages through each peer's control
  channel.
- Keep the rendezvous connection for candidate and room changes plus signaling.
- Track candidate, connecting, verified, unavailable, and disconnected states.
- Remove `TransferPath`, transfer ownership tokens, HTTP-ready events, and
  fallback branches.
- Preserve metadata-first approval and the existing folder ZIP path.

## Phase 5: Remove browser relay upload and download code

Files:

- `website/src/share/transfer.ts`
- `website/public/sw.js`
- related transfer tests

Tests must prove:

- the sender streams AEAD frames into a payload channel with backpressure;
- the service worker accepts direct `MessagePort` input only;
- the receiver creates no download before approval;
- truncated, forged, cancelled, and zero-length-invalid streams fail;
- a completed download matches the input bytes; and
- no code path builds a `/t/` URL or calls relay upload functions.

Implementation:

- Delete `UploadOptions`, HTTP chunk batching, `postChunk`, `postEnd`, relay
  download options, and relay-mode service-worker branches.
- Keep chunk sealing, direct sending, service-worker registration, direct
  download sinks, framing helpers, and size formatting.
- Rename relay-specific errors to direct-connection errors.

Run after Phases 4 and 5:

```bash
cd website && npm test
cd website && npm run build
```

## Phase 6: Align rooms, lobby UI, and product copy

Patch the current user-modified files in place:

- `website/src/share/App.tsx`
- `website/src/share/Landing.tsx`
- `website/src/share/Workspace.tsx`
- `website/src/share/Rail.tsx`
- `website/src/share/Thread.tsx`
- `website/src/share/EventRow.tsx`
- `website/src/share/Composer.tsx`
- `website/src/share/Overlays.tsx`
- `website/src/share/Palette.tsx`
- `website/src/share/NameGate.tsx`
- `website/src/share/settings.ts`
- `website/src/share/app.css`
- `website/src/share/site.css`
- `website/src/share/tokens.css`
- `website/index.html`

Behavior:

- Keep Everyone, direct threads, room creation, room links, QR codes, search,
  approvals, and responsive navigation.
- Show candidate checking, verified presence, isolation failures, partial
  delivery, and queued fan-out transfers.
- Remove relayed path badges, route settings, two-city claims, across-network
  copy, relay download progress, and server-fallback guidance.
- Explain the rendezvous metadata and LAN-only limitation in settings,
  onboarding, FAQ, and security copy.
- Keep the current shadcn and Tailwind redesign intact.

Verification:

- Run component and state tests after each UI slice.
- Inspect desktop and narrow mobile layouts in a real browser.
- Check keyboard navigation, focus return, labels, contrast, reduced motion,
  pending-offer drawers, room dialogs, and long rosters.

## Phase 7: Replace the relay smoke test with LAN integration tests

Files:

- replace `website/scripts/smoke-relay.mjs` with
  `website/scripts/smoke-lan.mjs`
- add any small test-only rendezvous launcher needed by the script
- update `website/package.json` and `website/package-lock.json`

Playwright must drive independent browser contexts through:

1. direct profile verification;
2. three-peer lobby chat;
3. no history for a late joiner;
4. room creation and link joining;
5. room-member isolation;
6. direct chat;
7. file offer, approval, and byte-identical completion;
8. decline and cancellation;
9. sender, receiver, and mid-stream disconnects; and
10. continued direct chat after the rendezvous process stops.

The script must fail on browser console errors, page errors, `/t/` requests,
external ICE endpoints, HTTP payload uploads, or an unexpected download.

Add a Go or Node scale harness for 100 candidates. It must cover roster churn,
the signaling pattern, profile state, lobby chat fan-out, file-offer state, room
membership, reconnects, and cleanup. Run the scale harness under the Go race
detector where it exercises Go state.

## Phase 8: Clean deployment, build, and documentation

Files:

- `packaging/relay/nginx-bonjou-relay.conf`
- `packaging/relay/bonjou-relay.service`
- `scripts/deploy-relay.sh`
- `scripts/build.sh`
- `vercel.json`
- `AGENTS.md`
- `DESIGN.md`
- `PRODUCT.md`
- `README.md`
- `HELP.md`
- `docs/security-model.md`
- `docs/superpowers/specs/2026-08-03-bonjou-web-relay-design.md`

Changes:

- Remove `/t/` proxy rules, upload buffering guidance, payload timeout claims,
  and transfer health fields.
- Keep the WebSocket proxy, TLS, origin restrictions, systemd hardening, and
  deploy path.
- Mark the old relay design's cross-network sections as superseded by the
  LAN-only design.
- Update architecture rules and product copy without changing the two-binary
  repository structure.
- Remove obsolete frontend dependencies or scripts after `rg` confirms no
  consumers.

## Phase 9: Final verification

Run the full required matrix:

```bash
gofmt -w <changed-go-files>
go test ./...
go test -race ./...
golangci-lint run ./...
cd website && npm test
cd website && npm run build
cd website && npm run smoke
```

Then:

- run the 100-client scale harness;
- run desktop and mobile browser verification;
- inspect console and network logs;
- run `rg` for `stun:`, `turn:`, `/t/`, `transfer_begin`, `transfer_ready`,
  `transfer_end`, `relayed`, and the production relay hostname;
- review the full diff for unrelated changes and leaked user work; and
- confirm that every approved completion criterion has a passing test or a
  recorded manual check.
