# Bonjou interactive experience: verification

Date: 2026-10-04. Local production preview: `http://127.0.0.1:4173`.

This expands the previous polish pass with new sections and working features.
The user explicitly selected all three proposed directions: a hands-on sharing
lab, selectable product stories, and utilities in the real sharing app. The
existing uncommitted work was preserved. No release or deployment was performed.

## What changed

- **A working handoff lab leads the page.** Choose field notes, a colour sheet,
  an original dot-study SVG, or a local file up to 2 MiB. Offer the details, then
  approve or decline from the receiver view. Approval loads a separate transport
  module and opens two native WebRTC connections in this browser, with no
  external ICE servers. The receiver measures actual bytes, checks SHA-256,
  and acknowledges verification over the channel before an explicit download
  becomes available. Cancel, reset, failure, retry, and unsupported APIs have
  recovery paths. Connections, channels, deadlines, and Blob URLs are cleaned up.
- **Selectable sharing stories replace the passive explanation.** Study,
  studio, and shared-desk choices change the example and illustration context.
  Their Try actions load the related sample, scroll directly to the lab, and
  focus Offer. The Blender scene remains an explicitly labelled illustration
  with pause, resume, replay, and a reduced-motion alternative.
- **A connection explorer changes with the selected setup.** Browser/CLI,
  same LAN/guest Wi-Fi/separate networks, and internet availability produce
  twelve combinations of diagram, outcome, and concrete steps. The optional
  browser check performs local cryptography and checks API presence. It does
  not open a socket, peer, or worker and does not certify Wi-Fi reachability.
- **The real workspace has a file preparation tray.** File/folder picks,
  drops, and clipboard images remain local. Review count, size, type, and
  folder batches; remove or clear; then explicitly Offer to the current
  destination. Recipient approval still precedes payload streaming. An
  entirely unsuccessful metadata offer leaves its batch available for retry.
  A batch delivered to any recipient leaves staging, with partial failures
  recorded and reported instead of duplicating successful requests on retry.
  Staging survives recipient changes, Received files, and a trip home.
  Conversation text drafts remain separate. Palette file actions use this tray.
- **The page has a new composition.** A wide usable lab, selectable stories,
  a vermilion consent interlude, and a changing network diagram give each part
  a different purpose. Satoshi, Phosphor controls, Material file icons, and the
  existing installation/help content remain consistent.

The lab is a same-page demonstration. It does not run Bonjou protocol v2 or
establish a connection to an independent device. The coordinator, production
wire format, known-answer vectors, CLI version, and Go implementation were
unchanged by this expansion.

## Research and adaptation

These are interaction references, not claims of feature parity or copied assets.

| Official source                                                                         | Pattern adapted                                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [PairDrop source](https://github.com/schlagmichdoch/PairDrop)                           | Prepare a payload, choose a destination, and retain recipient approval.                                    |
| [Blip](https://blip.net/)                                                               | Put a concrete handoff at the centre of the product story.                                                 |
| [LocalSend](https://localsend.org/) and [web project](https://github.com/localsend/web) | Ground sharing around nearby devices and real tasks. Browser support is not presented as unique to Bonjou. |
| [Wormhole](https://wormhole.app/) and [FAQ](https://wormhole.app/faq)                   | Let visitors act on a file immediately. Bonjou does not claim Wormhole's temporary storage behaviour.      |
| [Resend](https://resend.com/)                                                           | Controls that produce an immediate visible result on the marketing page.                                   |
| [Linear demo](https://linear.app/demo)                                                  | Let visitors explore product behaviour before starting their own session.                                  |
| [Raycast](https://raycast.com/)                                                         | Selectable examples tied to visitor tasks.                                                                 |
| [Apple Continuity](https://www.apple.com/macos/continuity/)                             | Paired-device stories with a concrete action and result.                                                   |

The lab transport was checked against the official
[WebRTC data-transfer sample](https://webrtc.github.io/samples/src/content/datachannel/datatransfer/),
[MDN data-channel guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels),
[send API](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send),
and [digest API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

## Verification

Tests use the stable production build and local signaling coordinator. Browser
suites run sequentially because real app clients share discovery. Successful
transfers use native WebRTC. Narrow API gates and faults are identified in the
scripts; they exercise cancellation and recovery without replacing the protocol.

| Check                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `go test ./...`                     | Pass; Go source unchanged.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `golangci-lint run ./...`           | Pass, 0 issues.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npm test`                          | Pass, 13 files and 101 tests, including protocol vectors, receive bounds, staging failures, the setup matrix, and real local cryptography.                                                                                                                                                                                                                                                                                               |
| `npm run build`                     | TypeScript and production build pass.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm audit --audit-level=moderate`  | Pass, 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `e2e:experience`, Chrome and WebKit | Both pass: two native peer connections, independent SHA-256, exact downloaded bytes, no custom-file payload read/peer/socket/session lock before approval, decline, cancellation, URL cleanup, binary-send failure and retry, unsupported API recovery, three story actions and focus, twelve setup choices, local capability check, light/dark 320–1440px fit, eight scoped axe scans per engine.                                       |
| `e2e:lan`, Chrome and WebKit        | Both pass: discovery, chat, room isolation, desktop/mobile approval, decline, exact bytes.                                                                                                                                                                                                                                                                                                                                               |
| `e2e:motion`, Chrome and WebKit     | Both pass: playback, approval sequence, pause/resume/replay, keyboard focus, offscreen pause, live reduced-motion changes, static alternative, narrow headline, pointer tilt.                                                                                                                                                                                                                                                            |
| `e2e:workflows`                     | Full fresh run passes, including drafts, home navigation, names, verification, large/empty/Unicode/folder downloads, failed preparation, rooms, history, reconnect, tab handoff, and timeout. See the discovery observation below.                                                                                                                                                                                                       |
| `e2e:staging`                       | Pass on the final build: local selection without recipients, remove/clear, text and image paste, recipient changes without offers, home/Received persistence, failed metadata retention and retry, approval before payload reads, exact received bytes, delayed-drop invalidation, folder archive paths, bounded mobile metadata, and long drafts with reachable actions at 320 × 640, 390 × 450, and 640 × 450. Scoped axe checks pass. |
| `e2e:polish`                        | Pass: populated layouts, long content, 200% reflow equivalent, keyboard traps/returns, deferred/multiple approvals, exact downloads, and twelve axe scans.                                                                                                                                                                                                                                                                               |
| `e2e:resilience`                    | Pass: simultaneous/queued exact-byte downloads, mid-transfer peer loss, and room reconnect scope.                                                                                                                                                                                                                                                                                                                                        |
| `e2e:accessibility`                 | Pass: sixteen light/dark landing, onboarding, workspace, and overlay axe scans.                                                                                                                                                                                                                                                                                                                                                          |
| `e2e:ui`, Chrome and WebKit         | Both pass: light/dark 320–1440px, Satoshi, navigation, onboarding, overlays, and mobile controls.                                                                                                                                                                                                                                                                                                                                        |
| Coordinator smoke                   | Pass: opaque encrypted signaling, no profile names in roster, rejected legacy payload frames, no HTTP payload endpoint.                                                                                                                                                                                                                                                                                                                  |
| Formatting and `git diff --check`   | Changed source passes. The exact vendored upstream stylesheet is intentionally not reformatted.                                                                                                                                                                                                                                                                                                                                          |

The staging, polish, accessibility, and Chrome/WebKit UI suites were rerun after
the final long-draft and short-window layout fix. All passed.

One Chrome workflow run timed out at 30 seconds waiting for Alice's display name
on Bob's page during discovery. A fresh complete run passed. The cause is
unproven; this is retained as a reliability observation, not dismissed as a
confirmed test-only problem. No ICE policy, mDNS setting, protocol framing, or
coordinator behaviour was changed to make that rerun pass.

## Findings corrected during verification

- Centralized new styles after the declared cascade order. Earlier component
  imports established the Bonjou layer before Tailwind's base reset, which
  flattened page headings and spacing.
- Matched Radix's horizontal height variant when sizing story/setup tabs.
  Otherwise the wrapped third story tab overlapped the illustration on mobile.
- Kept the setup switch's expanded touch area within the narrow layout.
- Increased the default primary button's hover opacity from 80% to 90%. The
  received-file download's hovered state otherwise failed white-label contrast
  on the light surface (4.38:1 against the required 4.5:1).
- Bound the Button link variant to the existing accent-text token. Using the
  background accent as text failed contrast on the dark receipt (3.49:1).
- Moved scenario Try actions directly to the lab and handed off keyboard focus.
- Bounded native content-sized draft textareas and made the preparation region
  scrollable. A long draft with staged files could otherwise put Send below
  the visible area in a 640 × 450 window. Reserved the conversation header's
  minimum height and clipped the collapsed conversation scroller so messages
  and file cards cannot cover or intercept preparation controls in short windows.
- Deferred the full filename/icon registry until a custom demo file is selected.
  Owned samples use four exact upstream Material assets; the real resolver and
  workspace behaviour are unchanged.
- Updated existing browser regressions for explicit sender offers, the usable
  empty-state composer, and the new headline. Fixed the delayed-drop test's
  injection point because Chrome returns fresh DataTransferItem wrappers.

## Build and screenshots

The final production entry is 461.60 kB JavaScript (140.45 kB gzip). The deferred
workspace is 301.45 kB (94.76 kB gzip), custom-file icon registry 49.05 kB
(16.57 kB gzip), demo transport 6.26 kB (2.47 kB gzip), and CSS 141.54 kB
(24.53 kB gzip). The initial experimental entry was about 509.5 kB; deferring
the full icon registry removed about 48 kB from initial JavaScript. These are
build sizes, not network timing or performance benchmarks.

Durable captures were reviewed after the new layout and interaction fixes:

- [Light landing](2026-10-04-bonjou-interactive-preview/landing-light.png)
- [Dark landing](2026-10-04-bonjou-interactive-preview/landing-dark.png)
- [Mobile landing](2026-10-04-bonjou-interactive-preview/landing-mobile.png)
- [Verified original SVG handoff](2026-10-04-bonjou-interactive-preview/lab-received.png)
- [Mobile story controls](2026-10-04-bonjou-interactive-preview/stories-mobile.png)
- [Guest-network explorer and capability results](2026-10-04-bonjou-interactive-preview/setup-explorer.png)
- [Desktop staging](2026-10-04-bonjou-interactive-preview/staging-desktop.png)
- [Mobile staging](2026-10-04-bonjou-interactive-preview/staging-mobile.png)
- [Staging with a long draft in a short window](2026-10-04-bonjou-interactive-preview/staging-short.png)

## Coverage limits

The local demo proves a bounded transfer between two endpoints in one page.
The real app checks use independent browser clients on this Mac and mobile
viewport emulation. They do not certify physical phones, guest routers, VPNs,
phone-camera QR scanning, native notifications, or manual screen-reader use.
Browser transfer completion and a byte-checked downloaded artifact do not prove
that a person retained a file on disk. No cross-network sharing, resumability,
browser/CLI interoperability, or backend payload endpoint was added.

The [previous polish report](2026-10-04-bonjou-web-polish-verification.md)
remains a historical record of that earlier build; this report describes the
expanded experience.
