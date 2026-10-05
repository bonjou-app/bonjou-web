# Bonjou Web LAN-Only Design

Date: 2026-08-31
Status: Awaiting written-spec review

This specification replaces the cross-network behavior in
`2026-08-03-bonjou-web-relay-design.md`. Bonjou Web keeps its normal browser
experience and uses the hosted service for discovery and WebRTC signaling.
Browsers exchange application content over direct LAN connections.

## Goal

Anyone who opens Bonjou Web on the same local network can see the other
reachable Bonjou users. The network has a live shared conversation, and users
can narrow that conversation by creating a room and sharing its link or QR
code.

Bonjou Web must remove the features that let people communicate or transfer
files across different networks. The hosted service must not forward chat,
file metadata, approvals, or file bytes.

## User experience

### Network lobby

Opening Bonjou Web places the user in an **Everyone on this network** lobby.
The page connects to the rendezvous service, receives opaque peer candidates,
and attempts direct WebRTC connections. Bonjou shows a profile after the
direct control channel opens and the peer sends its profile over that channel.

The lobby contains live events only. A user who joins at 10:05 does not receive
messages sent at 10:04. Neither the browser nor the rendezvous service stores
conversation history.

Sending a lobby message fans one encrypted copy out to each connected peer.
The sender sees a partial-delivery result when one or more peers disconnect
during the fan-out.

### Profiles

Each browser generates an ephemeral identity for its tab session. The profile
contains the display name and session fingerprint. Browsers exchange profiles
after the direct channel opens, so a public-address match alone never exposes a
name in the interface.

The rendezvous service receives the source address, peer id, ephemeral public
key, room membership, signaling traffic, and connection timing. It does not
receive display names or application envelopes.

### Rooms

A room narrows the network lobby. It cannot introduce peers from another
network.

The creator receives a short code, link, and QR code. The rendezvous service
binds the room to the creator's network-group key. A join request from another
network group receives a generic rejection and no room roster.

A peer becomes visible in the room after both conditions hold:

1. The rendezvous service reports that the peer joined the room.
2. The browser has an open direct control channel to that peer.

Room messages carry the room id. A receiving browser accepts the message only
while both peers appear in its current membership snapshot. Lobby peers remain
available for direct conversations while a room is active.

### Files and folders

Bonjou preserves metadata-first approval. The sender transmits an encrypted
offer over the direct control channel. The offer contains the filename, size,
folder detail when applicable, request id, and stream id. The sender opens a
payload channel only after the recipient approves.

Sending to Everyone creates one offer per connected recipient. Each person
approves or declines their copy. The sender encrypts and transmits one copy per
recipient because each pair has a different shared secret.

The sender runs at most four payload transfers at once. Further approved
transfers wait in a visible queue. This limit keeps a broadcast to a large
network from consuming the sender's memory and upload capacity at once.

Bonjou reports that a file sent to 99 peers requires 99 direct transfers. The
first release will not implement swarming or peer-assisted redistribution.

## Architecture

```text
                        Hosted rendezvous
                   presence + room membership
                         WebRTC signaling
                              only
                         /             \
                        /               \
                 Browser A ========= Browser B
                    direct encrypted WebRTC
                 chat + offers + file payloads
```

The Vite site remains a normal website. Users open it without installing a
native helper, browser extension, or Isolated Web App.

The repository keeps `cmd/bonjou-relay` and `internal/relay` to avoid an
operational rename unrelated to this change. Their behavior becomes
rendezvous-only. Product copy calls the service a discovery or rendezvous
service, never a file relay.

### Rendezvous responsibilities

The hosted service may:

- assign ephemeral peer ids;
- group connection candidates by a salted digest of the observed source
  address;
- maintain in-memory room membership;
- forward encrypted SDP and ICE signaling frames between allowed candidates;
- report presence changes and health information; and
- apply connection, signaling, room, and rate limits.

The hosted service must reject:

- signaling between different network groups;
- a room join from a network group other than the creator's;
- frames sent through the deprecated generic application-relay message type;
- transfer setup messages; and
- every request under the old `/t/` data-plane routes.

The service keeps no durable state. A restart clears peer presence and rooms.
Existing direct browser connections may continue, but the clients cannot
discover new peers or receive membership changes until they reconnect.

### Candidate discovery and LAN verification

The server's source-address grouping supplies candidates, not proof of LAN
membership. Carrier-grade NAT and large institutional networks can place
unrelated devices behind one public address. The server groups IPv4 clients by
their observed address and IPv6 clients by their observed `/64` prefix. Direct
verification handles false matches from either rule.

Bonjou verifies reachability with WebRTC configured with an empty ICE-server
list. The client forwards host candidates only and rejects remote
server-reflexive and TURN relay candidates. ICE may create peer-reflexive
candidates while it checks a host path, so their presence does not trigger a
failure. A client adds a profile to its roster after the direct control channel
opens and completes an encrypted profile handshake.

The client chooses one negotiation initiator by comparing the two ephemeral
public keys. Each browser negotiates at most eight candidate links at once.
This rule prevents duplicate offers and limits the join storm on a network with
100 active users.

The design treats a routable campus network as one local network when host-only
ICE connects its peers and the rendezvous sees one network-group key. Guest
Wi-Fi client isolation prevents the direct channel, so those candidates never
become visible peers.

### Direct control channel

Each verified peer pair keeps one reliable, ordered `bonjou-control` data
channel. The channel carries:

- the profile handshake;
- lobby and room chat;
- file and folder offers;
- approvals, declines, cancellation, and transfer results; and
- direct presence pings.

The existing X25519 and AES-256-GCM envelope format protects these messages on
top of WebRTC's DTLS transport. The browser derives one pairwise shared secret
from the ephemeral keys distributed during candidate discovery. The existing
session fingerprint remains available for out-of-band verification.

### Payload channels

The sender creates an ordered data channel for an approved transfer and labels
it with the request id. The first frame identifies the transfer. The receiver
must match that id to an approved offer before it creates the download sink or
accepts payload bytes.

One transfer channel carries one payload and closes after the final frame. A
separate control channel keeps chat, declines, and cancellation responsive
during a large transfer.

Bonjou keeps the current 64 KiB AEAD framing, streaming ZIP writer, service
worker download sink, and backpressure rules. It removes HTTP chunk uploads,
relay download mode, transfer tokens, and the data-plane rendezvous.

## Protocol changes

### Hosted WebSocket protocol

The browser-to-service protocol keeps these concepts:

| Concept | Purpose |
| --- | --- |
| `hello` | Announce an ephemeral public key and request network candidates |
| `roster` | Return opaque candidate ids, public keys, and room membership |
| `create` | Create a room bound to the caller's network group |
| `join` | Join a room only from its bound network group |
| `signal` | Forward sealed WebRTC offer, answer, and host ICE candidates |
| `peer_left` | Remove stale candidates and room members |
| `error` | Report bounded protocol failures without exposing room details |

The protocol removes `transfer_begin`, `transfer_ready`, and `transfer_end`.
The service also rejects generic application `relay` frames. A dedicated
`signal` frame sets a small size limit and a signaling-specific rate limit. The
service cannot inspect the sealed payload, so the first-party client enforces
that the frame contains WebRTC negotiation data.

### Direct application protocol

The control channel supports these message kinds:

| Kind | Purpose |
| --- | --- |
| `profile` | Exchange display name and session details after direct verification |
| `chat` | Deliver a lobby, room, or direct message |
| `file_offer` | Present metadata without moving payload bytes |
| `file_approve` | Authorize one request id |
| `file_decline` | Refuse one request id |
| `file_cancel` | Abort a queued or active transfer |
| `transfer_result` | Tell the other peer that a transfer finished or failed |
| `ping` / `pong` | Detect a dead direct channel |

Every room-scoped message includes its room id. The receiver checks local room
membership before displaying it.

## Limits and scale

The network-group cap increases from 12 to 128 candidates so a 100-person
workshop fits. The server continues to cap rooms, room members, message size,
signaling rate, and total connections.

A 100-person lobby can create 4,950 peer pairs. Each browser keeps at most 99
control channels in that case. Clients stagger negotiation with an eight-link
limit, use one deterministic initiator per pair, and stop retrying candidates
that fail the LAN handshake until the rendezvous reports a meaningful state
change.

Chat messages remain small, but an Everyone send still creates one encrypted
frame per recipient. File fan-out uses the four-transfer sender limit described
above. The UI reports delivered, pending, and failed recipient counts.

The implementation must measure a 100-client signaling and application-state
simulation before it ships. Browser resource tests must record connection time,
memory, open data channels, and message delivery. If a supported browser cannot
sustain the 100-person design, implementation stops until the team revises this
architecture and the user approves the new limit or topology.

## Failure behavior

| Failure | User-visible result |
| --- | --- |
| Rendezvous unavailable at startup | Bonjou shows discovery unavailable and no fabricated peers |
| Rendezvous drops after peers connect | Existing direct conversations continue; discovery and room membership show offline |
| Candidate cannot open a host-only channel | Bonjou omits the profile and reports that the Wi-Fi may isolate devices |
| Peer leaves | Bonjou removes the profile and fails queued work for that peer |
| Room link opens from another network | The join fails without revealing member names or room state |
| Recipient declines | The sender records the decline and sends no payload |
| Direct channel closes before payload starts | Both sides mark the transfer failed; Bonjou does not fall back to a server |
| Direct channel closes during payload | The receiver aborts the download and both sides show a failed transfer |
| Service worker cannot create a download | The receiver reports the browser limitation before sending approval |
| Sender reaches the four-transfer limit | Further approved sends remain queued with their position visible |

Bonjou must not splice a partial direct transfer onto another transport. The
receiver gets a complete authenticated stream or a failed download.

## Security and privacy

The change preserves these invariants:

- The receiver approves metadata before Bonjou creates a payload channel.
- The browser encrypts application envelopes and payload frames with pairwise
  keys.
- The first-party client never sends a display name, message, filename,
  declared file size, approval, or payload byte to the service.
- A room cannot widen candidate discovery beyond its network group.
- The client accepts host ICE candidates only.
- The service stores presence and rooms in memory and clears them on restart.

The rendezvous can observe source addresses, ephemeral peer ids, public keys,
room membership, signaling size, and timing. A malicious rendezvous could
substitute public keys during discovery. Session fingerprints remain the first
release's mitigation, matching the current browser threat model.

Traffic analysis and a malicious room member remain out of scope. A room member
can copy any message or file they receive.

## User interface changes

The workspace keeps the network lobby, direct conversations, room creation,
room links, QR codes, and the transfer approval flow.

The interface removes:

- `relayed` path badges and route preferences;
- copy that advertises different-network or two-city transfers;
- progress states that exist only for relay downloads; and
- recovery text that suggests opening a room when LAN discovery fails.

The interface adds:

- a checking state while Bonjou verifies candidate links;
- a clear Wi-Fi-isolation explanation when candidates fail;
- per-recipient delivery counts for lobby and room broadcasts; and
- a visible queue state for large file fan-outs.

Settings must describe the rendezvous metadata with the same prominence as the
encryption guarantees.

## Repository changes

Implementation will touch these areas:

- `internal/relay`: remove the HTTP rendezvous and restrict rooms and signaling
  to one network group;
- `cmd/bonjou-relay`: serve WebSocket discovery and health routes only;
- `website/src/share/relay.ts`: reduce the client to candidate, room, and
  signaling operations;
- `website/src/share/webrtc.ts`: create host-only control and payload channels;
- `website/src/share/useSession.ts`: move application events onto direct
  channels and manage verified peers;
- `website/src/share/transfer.ts` and `website/public/sw.js`: keep direct
  streaming and delete relay upload/download paths;
- workspace components and styles: remove relay routes and add verification,
  broadcast, and queue states;
- deployment files: remove `/t/` proxy rules and upload buffering settings; and
- product, architecture, security, help, and design documents: describe the
  LAN-only behavior and rendezvous metadata.

The CLI's UDP discovery and TCP transfer implementation stays unchanged. The Go
and browser protocol vectors stay in the repository because direct browser
traffic continues to use the shared cryptographic framing.

The implementation must patch the current uncommitted website redesign in
place. It must not restore or overwrite unrelated shadcn, Tailwind, component,
or design-system work.

## Verification plan

The removal needs tests at the protocol, browser, security, scale, and visual
layers.

### Go tests

- Verify that peers from the same source group receive candidate ids and
  public keys.
- Verify that different source groups cannot discover or signal one another.
- Verify that room creation binds the room to one network-group key.
- Verify that a different network cannot join the room even with a valid code.
- Verify signaling authorization, size limits, malformed frames, rate limits,
  disconnect cleanup, and room expiry.
- Verify that application relay and transfer setup messages receive protocol
  errors.
- Verify that `/t`, `/t/{id}`, upload, download, and completion routes return
  `404` or `405` as appropriate.
- Run concurrent roster, room, and signaling tests under the Go race detector.

### Browser unit tests

- Test the deterministic initiator and eight-link negotiation queue.
- Test host-only ICE configuration and candidate filtering.
- Test the encrypted profile handshake before roster visibility.
- Test lobby, room, and direct message routing.
- Test room membership checks on incoming messages.
- Test offer, approval, decline, cancellation, queueing, and transfer results.
- Test that direct negotiation failure cannot call an HTTP fallback.
- Test payload-channel ordering, backpressure, authentication failures, and
  cleanup.
- Keep the protocol known-answer vectors and ZIP boundary tests.

### Browser integration tests

A local production build and rendezvous process will drive separate browser
contexts through these flows:

1. Two users open the site and become visible after the direct handshake.
2. Three users exchange lobby chat and receive the same live event.
3. A late joiner receives no stored history.
4. A creator opens a room; another user joins through the link and QR target.
5. A room message reaches members and stays out of a non-member's timeline.
6. A direct message reaches one selected peer.
7. A file offer moves no bytes before approval.
8. Approval produces a byte-identical downloaded file.
9. Decline, cancellation, sender departure, receiver departure, and a
   mid-stream channel failure produce explicit terminal states.
10. Existing direct chat continues after the rendezvous process stops.

The integration run will inspect browser console errors and network requests.
It must observe no request to `/t/`, no STUN or TURN endpoint, and no HTTP
payload upload.

### Scale and compatibility tests

- Simulate 100 clients joining one network group, completing peer-link state,
  exchanging profiles and lobby chat, and running file-offer state transitions.
- Run a multi-browser connection test up to the practical local-machine limit
  and record resource use.
- Verify current Chromium, Firefox, and WebKit builds where the test runner
  supports their WebRTC and service-worker behavior.
- Test desktop and mobile layouts for roster growth, room controls, pending
  offers, queue states, and failure messages.
- Test keyboard navigation, focus return, screen-reader labels, reduced motion,
  and narrow viewports after the UI removal.

### Required commands

The implementation is not complete until these commands pass:

```bash
gofmt -w <changed-go-files>
go test ./...
go test -race ./...
golangci-lint run ./...
cd website && npm test
cd website && npm run build
```

The implementation plan will add the local browser integration and scale-test
commands once it selects the test harness.

## Completion criteria

The work is complete when:

- two supported browsers on the same reachable network discover each other and
  exchange chat and files directly;
- room links and QR codes group verified LAN peers without admitting another
  network group;
- the service exposes no file data plane and rejects application relay frames;
- the browser has no server fallback or public ICE server;
- metadata-first approval, encryption vectors, and streaming downloads still
  pass;
- the 100-client signaling simulation passes without races or leaked state;
- all required test, lint, build, integration, accessibility, and visual checks
  pass; and
- user-facing copy describes the LAN-only scope and rendezvous metadata without
  cross-network claims.

## Out of scope

- Cross-network communication, even when someone has a room link.
- Offline delivery, stored history, and resumable transfers.
- A local coordinator command, native background helper, browser extension, or
  Isolated Web App.
- STUN, TURN, and server-relayed payload fallback.
- Efficient one-to-many file distribution through multicast or swarming.
- Changes to the CLI's existing LAN discovery and transfer behavior.
