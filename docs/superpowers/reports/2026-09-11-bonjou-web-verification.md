# Bonjou Web revamp verification

Implemented locally on 2026-09-11 following the approved design. Existing
uncommitted coordinator and application work was preserved. No deployment
or release-version change was made.

## Delivered interface

- Satoshi, neutral light/dark surfaces, restrained Bonjou red, library
  Phosphor icons, and shadcn/Radix controls throughout.
- Landing page with nearby-sharing copy, a real Blender device scene,
  three sharing steps, network/privacy explanation, CLI installation tabs
  with optional alternatives, and practical FAQs. No live roster or GitHub
  counter requests on the landing page.
- Full-height workspace, a clearer recipient list, actionable empty and
  connection states, per-conversation drafts, recipient labels, file/folder
  controls, verification status, and explicit transfer history states.
- Standard Command Dialog, name/settings feedback, room pending/error/timeout
  states, QR/link copying, room exit, and correct single-tab acquisition.
- Mobile people/thread navigation and approval Drawer; light/dark layouts
  checked from 320 to 1440 pixels. Interface copy contains no em dashes.
- The requested direct, honest communication rules are in root AGENTS.md.

## Engineering repairs

Download completion now waits for the worker to authenticate and consume the
expected plaintext, rather than acknowledging ciphertext receipt. Corrupt,
truncated, oversized, wrong-sized, and cancelled downloads fail. The UI says
to check browser downloads and does not claim proof of disk persistence.

Receiver credits bound queued payload data, with a separate cap for legacy
or misbehaving senders. Folder generation reads bounded chunks on demand.
Upload cancellation interrupts stalled reads. Opening downloads reserve a
receive slot before async preparation, and late preparation is discarded if
the connection has gone away. Unicode download names have a safe ASCII
header fallback plus RFC 5987 encoding.

Confirmed room membership is separate from pending room commands. Temporary
lobby rosters are withheld during rejoin, failed rejoin restores the actual
scope, and duplicate commands preserve confirmed membership. Timed-out room
links return to the lobby without silently repeating the join. Renaming a
person updates the profile without replacing the connection. Outgoing
transfer acknowledgements are scoped to the intended peer.

ZIP64 selection now includes archive-header overhead, covering the case where
payload fits in ZIP32 but the central-directory offset does not. Protocol v2
cryptographic framing and known-answer vectors remain unchanged.

## Verification results

| Check | Result |
| --- | --- |
| `go test ./...` | Pass |
| `cd website && npm test` | 9 files, 72 tests pass |
| `npm run build` | TypeScript and production Vite build pass |
| `npm run e2e:lan` | Chrome pass with default networking settings |
| `PLAYWRIGHT_ENGINE=webkit npm run e2e:lan` | WebKit pass on fresh launch |
| `npm run e2e:workflows` | Pass |
| `npm run e2e:ui` | Chrome light/dark, 320–1440px pass |
| `PLAYWRIGHT_ENGINE=webkit npm run e2e:ui` | WebKit light/dark, 320–1440px pass |
| `npm run e2e:accessibility` | axe detects no WCAG A/AA violations across 16 surfaces |
| `COORDINATOR=http://127.0.0.1:46330 npm run smoke` | Signaling/privacy boundary and absence of payload endpoints pass |
| `npm audit --audit-level=moderate` | Zero known vulnerabilities after compatible tooling updates |
| `git diff --check` | Pass |

Browser flows cover discovery, chat, room isolation, desktop/mobile approval,
decline without download, exact file bytes, 10 MB receive-window pressure,
Unicode names, empty files, nested folder ZIPs, pending history, drafts across
threads and home navigation, profile rename, matching verification codes,
search and keyboard palette selection, room clipboard actions, rejected room
recovery, room exit, tab handoff, and an unresponsive room-link timeout.
Worker and protocol tests cover corruption, truncation, cancellation, size
validation, bounded streaming, and ZIP64 boundary selection.

## Performance and assets

| Artifact | Before | After |
| --- | --- | --- |
| Initial JavaScript | 906.18 kB | 396.71 kB |
| Initial JavaScript, gzip | 282.11 kB | 122.31 kB |
| Deferred workspace JavaScript | Included initially | 360.51 kB, 113.36 kB gzip |
| Desktop Blender WebP | None | 50,972 bytes |
| Mobile Blender WebP | None | 21,568 bytes |

Initial JavaScript is approximately 56% smaller. `motion` and `next-themes`
were removed after replacing their remaining uses with existing controls,
CSS transitions, and the application's theme state.

Editable Blender source, packed screenshots, and reproduction instructions:
`website/assets/nearby-scene/README.md`. Rendering uses Cycles, physical
materials, and real app screenshots. Both responsive images reserve layout
space and the hero image receives high fetch priority.

## Visual evidence

- Full-page final light/dark/mobile landing captures: `/tmp/bonjou-revamp-final/`.
- Chrome workspace, onboarding, settings, palette, room, and mobile captures:
  `$TMPDIR/bonjou-ui-check/`.
- WebKit responsive captures: `/tmp/bonjou-webkit-ui/`.
- Actual approval screens: `/tmp/bonjou-file-approval-desktop.png` and
  `/tmp/bonjou-file-approval-mobile.png`.
- Actual completed conversation: `/tmp/bonjou-lan-e2e.png`.

## Limits and remaining validation

These tests run separate browser processes on this Mac, with mobile viewport
emulation. They do not certify physical iOS/Android behavior or reachability
across routers, VPNs, or guest networks. OS notification delivery and actual
phone-camera QR scanning still need a physical-device check.

The initial same-process Chrome context harness failed mDNS discovery;
separate browser processes pass without disabling mDNS or adding STUN/TURN.
One WebKit LAN run timed out during discovery. A diagnostic run established
all direct connections and a fresh full LAN run passed. The cause of that
transient timeout is not established; it remains a test-stability concern.
The application exposes retry and network-permission troubleshooting.

Automated accessibility results supplement, rather than replace, manual
screen-reader and physical-device testing. Browser completion confirms the
stream was consumed; it cannot certify that the user kept the downloaded file.

## Typography and motion revision

The user found the initial font unattractive and the motion too restrained,
then chose Satoshi for the revision. Satoshi now replaces Public Sans across
the site, workspace, and portals. The unmodified Fontshare variable font and
license are self-hosted. Headings have stronger weights and more open tracking.

The landing now has a staged headline entrance, section reveals, link hover
feedback, and a pointer-responsive Blender scene. Its four-second sharing
demo illustrates offer, approval, transfer, and receipt, with working pause,
resume, and replay controls. The demo pauses offscreen and in hidden tabs.
Reduced motion cancels active movement and offers a static result/reset flow.
Workspace entry, incoming rows, and receipt get short transitions.

Revision checks: 72 tests and production build pass; Chrome and WebKit UI
checks pass at 320–1440px in light and dark. Motion checks pass in both engines,
including actual movement, paused playheads, and mobile autoplay timing. The
16-surface accessibility pass still reports no WCAG A/AA violations. The font
check now targets the text inside the headline's animated line wrapper. CDP
confirms `SatoshiVariable-Bold_Bold` supplies the rendered glyphs.

Run coordinator-backed UI, LAN, workflow, and accessibility suites in sequence.
They share a discovery network, so running two suites together invalidates
empty-network assertions by creating real peers for each other. The first
concurrent Chrome/WebKit UI attempt exposed this test-harness constraint.

Revision visual artifacts:
- `/tmp/bonjou-motion-preview/bonjou-motion.webm`
- `/tmp/bonjou-motion-preview/desktop.png`
- `/tmp/bonjou-motion-preview/mobile-320.png`
- `/tmp/bonjou-motion-webkit/landing-dark-1440.png`

The physical-device and network-reachability limits above still apply.


## Standalone repository integration

Before publication, upstream had split the original checkout into
`bonjou-app/bonjou-web` and `bonjou-app/bonjou-cli`. The revamp is based on
web commit `fd000df` and coordinator commit `fc19c84`, preserving upstream's
approved logo and generated icons, Go module/dependency updates, web dependency
updates, independent build/deployment configuration, and protocol fixture pins.
The original monorepo implementation remains recorded in local commit `1042599`.

The standalone web repository passes 64 tests in eight files. The eight
additional tests from the monorepo exercised its Sites worker adapter, which
is absent from the standalone Vercel product. The authenticated download
worker's eight regression tests remain included and pass. Vite 8.3 and Vitest 5
are retained from upstream. Initial JavaScript is 399.28 kB (123.23 kB gzip),
and the deferred workspace is 365.88 kB (114.64 kB gzip).

`VITE_COORDINATOR_URL` and `COORDINATOR` are the preferred configuration names;
the earlier `VITE_RELAY_URL` and `RELAY` names remain supported. The coordinator
smoke test defaults to loopback. The LAN test now accepts the same base
`APP_URL` as the other browser suites. The original integration LAN attempt
opened the landing route because its URL convention differed; this harness
inconsistency was fixed before rerunning the test.

Publish the paired coordinator and web branches together. The former payload
relay cannot serve this revision's signaling-only protocol. CLI cryptographic
framing and the canonical v2 vector fixture are unchanged.
