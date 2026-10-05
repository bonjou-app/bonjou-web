# Bonjou comprehensive verification

Date: 2026-10-05. Canonical web candidate based on `59e2f8a7fd3a`; canonical
coordinator code tested at `2e96dbf059a2727cd7e1e54381a8146dae43d497`.

## Result and repository integration

All 17 local end-to-end checks have passing final attempts. A navigation defect
found by the additional boundary coverage is fixed. The web changes belong in
[bonjou-web PR 13](https://github.com/bonjou-app/bonjou-web/pull/13); the paired
signaling coordinator belongs in
[bonjou-cli PR 20](https://github.com/bonjou-app/bonjou-cli/pull/20).
Fresh CI on both PR heads is a merge gate; earlier green checks are not reused
as verification of this candidate. CI runs the complete sequential browser
suite and saves its logs and captures as `browser-verification-ubuntu-latest` and
`browser-verification-macos-latest` artifacts. Chrome native transfer suites run
on Linux; WebKit native transfer and mixed-engine suites run on macOS. Linux
also retains WebKit UI and motion checks. All 17 named checks remain required
across the two jobs, with three additional repeated platform checks.

The approved split remains intact: no `website/` is restored to CLI main.
The old combined checkout and all task changes are preserved in local branch
`codex/bonjou-e2e-main-2026-10-05`, commit `dde96f5`. The canonical web integration
retains its current dependency versions, Node 24 configuration, Vercel routes,
approved logo assets, and protocol-vector provenance. The unused shadcn
code-generator dependency is removed; its attributed CSS is vendored locally.

The original interactive lab, three scenario tabs, twelve setup combinations,
file staging and explicit offers, and five original artwork kinds are included.
Ten responsive WebP assets total 151,090 bytes. Earlier 2026-10-04 reports describe
the legacy combined checkout; this report records the canonical repositories.

## Verification evidence

[All attempts and timings](2026-10-05-bonjou-e2e-evidence/results.json) include
failures rather than overwriting them. Individual suite logs are in the same
directory. Suites ran sequentially against the production preview at
`http://127.0.0.1:4173`, configured for the local signaling coordinator at
`http://127.0.0.1:46330`. Independent browsers use native WebRTC and crypto;
no ICE, mDNS, protocol framing, or production timeout was changed to pass tests.
The final navigation fix was followed by fresh UI and boundary suites in both
engines. The fresh PR CI suite exercises the complete committed tree.

| Check                         | Local result and demonstrated behavior                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit/protocol tests       | 12 files, 93 tests pass; Go/browser known-answer vectors match canonical provenance. No wire-format changes.                                                                                                                                                                                                                                                                                          |
| Dependency/build checks       | Clean `npm ci`, zero `npm audit --audit-level=moderate` vulnerabilities, TypeScript and production Vite build pass.                                                                                                                                                                                                                                                                                   |
| UI: Chrome and WebKit         | Light/dark 320–1440px layouts, actual Satoshi font, navigation, onboarding, settings, palette, rooms, mobile controls.                                                                                                                                                                                                                                                                                |
| Motion: Chrome and WebKit     | Real playback, approval sequence, pause/resume/replay, keyboard focus, offscreen pause, live reduced-motion changes, pointer tilt. All pages capture console/page errors.                                                                                                                                                                                                                             |
| LAN: Chrome and WebKit        | Source-network discovery, chat, room isolation, approval and decline, desktop/mobile flows, exact downloaded bytes.                                                                                                                                                                                                                                                                                   |
| Experience: Chrome and WebKit | Native two-endpoint lab, independent SHA-256 and download bytes, approval before custom file reads/PCs/sockets/session locks, recovery and cancellation, three scenarios, twelve setups, local API checks, eight scoped axe scans per engine.                                                                                                                                                         |
| Workflows: Chrome             | Unicode/long filenames, empty and 10 MB files, folders, preparation failures/retry, rooms/history, navigation/session names, reconnect, tab ownership, and stale/timeout states.                                                                                                                                                                                                                      |
| Accessibility: Chrome         | Sixteen whole-page light/dark axe scans. Automated checks complement the keyboard flows; they do not establish manual screen-reader usability.                                                                                                                                                                                                                                                        |
| Polish: Chrome                | Sixteen populated axe scans, touch targets, focus traps/returns, input/error association and recovery, narrow and short-window reflow.                                                                                                                                                                                                                                                                |
| Resilience: Chrome            | Concurrent and queued byte-exact files, direct mid-payload peer loss on both sides, room-scoped coordinator reconnection.                                                                                                                                                                                                                                                                             |
| Staging: Chrome               | Local preparation, paste, folders, named broadcast, explicit offers, no reads before approval, exact bytes, Undo/expiry, invalidated late drops, departed private recipient retention/recovery, short-window controls.                                                                                                                                                                                |
| Mixed Chrome ↔ WebKit        | Bidirectional chat, matching independently checked fingerprints, approval before reads/downloads, SHA-256 and exact downloads, declines both ways, no HTTP payload writes, departure preserves private drafts/staging and disables departed targets.                                                                                                                                                  |
| Boundaries: Chrome and WebKit | Genuine 0-byte/2 MiB native lab downloads; receiver-corruption rejection and clean retry; unchanged 20-second deadline and retry; unmount closes peer connections/channels and revokes Blob URLs; all ten artwork variants decode; system/manual/persisted theme; navigation resizing. Real single/multiline clipboard round-trips run in Chrome; WebKit grant is unsupported and explicitly skipped. |
| Coordinator smoke             | Health, network-scoped rooms, roster without profile names, equal derived signaling keys, opaque encrypted signaling preserved, legacy payload frames rejected, HTTP payload route returns 404.                                                                                                                                                                                                       |
| Go race/vet/lint/format       | Fresh uncached race suite: 115 top-level passes across five packages, one Windows-only skip on macOS; vet and golangci-lint pass; all 63 tracked Go files formatted. [Raw logs and count summary](2026-10-05-bonjou-e2e-evidence/backend/summary.json).                                                                                                                                               |
| Cross-builds                  | CLI Linux amd64/arm64, macOS arm64, Windows amd64; coordinator Linux amd64/arm64 compile. Local cross-builds do not establish runtime behavior. GitHub CI runs Go tests on Linux, macOS, and Windows.                                                                                                                                                                                                 |

## Findings and corrections

1. Canonical organization URLs in the landing and CLI install panel were
   restored after transplanting the combined checkout's UI changes.
2. The LAN test now accepts either a bare preview origin or a full `/app` URL,
   retaining the canonical migration's behavior.
3. The current Playwright required WebKit build 2359; installing its genuine
   runtime resolved the initial missing-binary failure.
4. A new artwork assertion incorrectly treated responsive `naturalWidth` as
   raw image pixels. The live image decoded at its specified 128px intrinsic
   width. The test checks positive square dimensions and selected source;
   separate image loads still verify exact 256/512px asset dimensions.
5. Opening the mobile menu, widening to desktop, then narrowing reopened the
   drawer because its controlled state survived unmount. Landing now clears
   that state when entering desktop. Both browsers pass the regression.
6. Boundary screenshots are saved per suite/engine and CI uploads failure
   evidence even when a suite stops the sequence.

7. The first Linux CI run ([37268875126](https://github.com/bonjou-app/bonjou-web/actions/runs/37268875126))
   passed all nine Chrome suites and WebKit UI/motion, then timed out waiting for
   Bob during native WebKit peer discovery. Both clients had connected to the
   coordinator. [Its retained result/log](2026-10-05-bonjou-e2e-evidence/ci-linux-initial/results.json)
   does not establish the underlying cause. Playwright's
   [native-port guidance](https://playwright.dev/docs/browsers#webkit)
   recommends macOS for the closest Safari behavior; its
   [launcher](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/webkit/pw_run.sh)
   uses different Linux and macOS ports. Native WebKit and mixed-browser transfer
   checks are now required on macOS, while Chrome flows and WebKit UI/motion
   remain on Linux. A read-only preflight records each port's actual WebRTC and
   WebCrypto availability; required transfer engines fail clearly when absent.
   LAN failures save peer/ICE/signaling states, browser errors, and captures.
   No transport setting or timeout was relaxed. The added observer and preflight
   pass locally, and both Chrome/WebKit LAN flows pass after the change.

8. The second hosted run ([37269918811](https://github.com/bonjou-app/bonjou-web/actions/runs/37269918811))
   confirmed WebRTC and WebCrypto APIs present in both Linux and macOS ports.
   Missing APIs are ruled out. WebKit still stalled with ICE `new` and gathering;
   the initiator closed after its existing 15-second discovery deadline. A
   separate Chrome run timed out discovering the `Unsupported downloads`
   client; the same workflow had passed in the first hosted run and locally.
   These failures are retained under
   [second-run evidence](2026-10-05-bonjou-e2e-evidence/ci-second-run).
   The underlying negotiation cause is not established from those snapshots.
   Native candidate types/counts, RTC method outcomes, state transitions,
   coordinator frame/roster counts, and both client captures are now observed
   without changing returned RTC promises or logging payload/key/SDP values.
   Hosted macOS has a documented
   [local-network permission issue](https://github.com/actions/runner-images/issues/10924).
   The disposable macOS CI browser process uses Apple's documented
   [root-process permission context](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy#macOS-considerations)
   to test permitted LAN behavior. The coordinator, install/build steps, Linux
   jobs, and normal local checks use the ordinary runner/user account. No
   production browser or user's privacy setting is changed. Normal nonroot
   Chrome/WebKit sharing is covered by the passing local runs. This adjustment
   is being validated by fresh CI; it is not presented as proof of the earlier
   failures' cause. Chrome/WebKit LAN and the complete Chrome workflows pass
   again with the expanded diagnostics installed. A deliberate diagnostic
   capture after a genuine approved local lab transfer verifies both native
   peer records, method outcomes, closed-client handling, and error redaction.

## Current captures

- [Desktop light](2026-10-05-bonjou-e2e-evidence/landing-light-1440.png)
- [Desktop dark](2026-10-05-bonjou-e2e-evidence/landing-dark-1440.png)
- [Mobile landing](2026-10-05-bonjou-e2e-evidence/landing-light-390.png)
- [Mobile workspace](2026-10-05-bonjou-e2e-evidence/thread-mobile-light.png)

## Production and platform limits

The public marketing host responded HTTP 200. Its published browser bundle
points to `https://bonjou.80-225-228-65.sslip.io`. Read-only health requests to
that coordinator timed out, including a five-second connection deadline.
This is an observed availability gap from this machine, not proof of its cause.
Local and CI results do not prove production connectivity. No coordinator
server deployment or release/version change is part of this merge operation.
The web deployment and coordinator deployment are separate; the signaling-only
coordinator must be deployed for the new workspace.

Physical iOS/Android devices, guest routers, VPNs, cross-network reachability,
phone-camera QR scans, real notifications, manual screen readers, and Firefox
are not certified here. Browser/CLI interoperability and resumable transfers
are not product claims. Fault-injection cases corrupt a genuine data-channel
chunk or hold a native offer to exercise failure handling; successful flow
checks retain unmodified transport behavior.
