# Bonjou comprehensive verification

Date: 2026-10-05. Canonical web candidate based on `59e2f8a7fd3a`; canonical
coordinator code tested at `0e30775c9efeded215930ab46aaffaa65a8c85ea`.

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

[Initial attempts and timings](2026-10-05-bonjou-e2e-evidence/results.json) include
failures rather than overwriting them. Individual suite logs are in the same
directory. Suites ran sequentially against the production preview at
`http://127.0.0.1:4173`, configured for the local signaling coordinator at
`http://127.0.0.1:46330`. Independent browsers use native WebRTC and crypto;
no ICE, mDNS, protocol framing, or production timeout was changed to pass tests.
The connection lifecycle fixes were followed by all 17 checks again, passing
against coordinator `df923b6`. [That full sequential run](2026-10-05-bonjou-e2e-evidence/lifecycle-final/results.json)
is retained. After the final roster/departure corrections at `0e30775`, all
eight affected sharing/coordinator checks passed again, including Chrome and
WebKit LAN, mixed-engine transfers, workflows, polish, resilience, staging, and
coordinator smoke. [Final targeted results and logs](2026-10-05-bonjou-e2e-evidence/roster-final/results.json)
record that run. The fresh PR CI suite exercises the complete committed tree.

| Check                         | Local result and demonstrated behavior                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web unit/protocol tests       | 12 files, 96 tests pass; Go/browser known-answer vectors match canonical provenance. No wire-format changes.                                                                                                                                                                                                                                                                                          |
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
| Mixed Chrome ↔ WebKit         | Bidirectional chat, matching independently checked fingerprints, approval before reads/downloads, SHA-256 and exact downloads, declines both ways, no HTTP payload writes, departure preserves private drafts/staging and disables departed targets.                                                                                                                                                  |
| Boundaries: Chrome and WebKit | Genuine 0-byte/2 MiB native lab downloads; receiver-corruption rejection and clean retry; unchanged 20-second deadline and retry; unmount closes peer connections/channels and revokes Blob URLs; all ten artwork variants decode; system/manual/persisted theme; navigation resizing. Real single/multiline clipboard round-trips run in Chrome; WebKit grant is unsupported and explicitly skipped. |
| Coordinator smoke             | Health, network-scoped rooms, roster without profile names, equal derived signaling keys, opaque encrypted signaling preserved, legacy payload frames rejected, HTTP payload route returns 404.                                                                                                                                                                                                       |
| Go race/vet/lint/format       | Fresh uncached race suite: 123 top-level passes across five packages, one Windows-only skip on macOS; vet and golangci-lint pass; all 63 tracked Go files formatted. [Raw logs and count summary](2026-10-05-bonjou-e2e-evidence/backend-roster/summary.json).                                                                                                                                        |
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

9. Run [37271700933](https://github.com/bonjou-app/bonjou-web/actions/runs/37271700933)
   stopped before creating jobs because the browser cache path used
   `runner.temp` in job-level `env`. GitHub only makes that context available
   at step level. The install and verification steps now set the same cache
   path in their own environments. This attempt supplied no browser results.

10. Run [37272364003](https://github.com/bonjou-app/bonjou-web/actions/runs/37272364003)
    passed the web build/unit job and all seven macOS checks, including native
    WebKit sharing and mixed-engine downloads. The hosted permission adjustment
    is now verified for that environment. Linux Chrome passed initial discovery
    and chat, then timed out showing the peer after both clients joined a room.
    Passive diagnostics show both replacement control channels open, connected
    ICE, and successfully applied native descriptions/candidates. This failure
    is after transport establishment. [Both platforms' results and the Linux
    failure captures](2026-10-05-bonjou-e2e-evidence/ci-fourth-run) are retained.

11. Review found a coordinator lifecycle race: after the last peer left, a
    concurrent join could attach to the room before a delayed cleanup removed
    it from the Hub. Future peers would join a separate room under the same key.
    A deterministic reproduction fails on the earlier coordinator. Lookup and
    membership now share the Hub critical section with removal/retirement;
    cleanup also checks the exact room pointer and emptiness. Four regression
    tests cover stale cleanup, replacement rooms, code-room authorization and
    both operation orderings. The fresh race suite passes 119 top-level tests
    (152 including subtests), with the existing Windows-only skip on macOS.
    [Before/after evidence](2026-10-05-bonjou-e2e-evidence/backend-lifecycle)
    establishes this defect independently of the hosted browser failure.

12. Browser review reproduced two separate lifecycle failures: an old discovery
    wait could close a replacement link, and a queued profile from a retired
    channel could repopulate peer state. PeerLink teardown is now terminal and
    notifies once synchronously; delayed events and old queued controls are
    ignored. Expiry checks the exact awaited link, and session callbacks check
    current-link identity. Three regressions pass; the full unit suite is now
    96 tests. [Captured before/after results](2026-10-05-bonjou-e2e-evidence/web-lifecycle-regressions.txt)
    prove these defects, without claiming they caused the fourth hosted run.
    Passive diagnostics now count public control-message kinds. A genuine
    two-browser exchange confirms one sent/received profile per client and
    excludes names, message bodies, keys, SDP, and raw addresses from the
    [observer proof](2026-10-05-bonjou-e2e-evidence/rtc-control-observer-proof.json).

13. Run [37274107969](https://github.com/bonjou-app/bonjou-web/actions/runs/37274107969)
    again passed every macOS check. Linux passed native LAN and workflows, then
    failed initial peer discovery in the dark-theme polish check after light
    polish had completed. Alice displayed Bob; Bob did not display Alice.
    [Retained results](2026-10-05-bonjou-e2e-evidence/ci-fifth-run) include the
    timeout. Polish now captures passive RTC/profile counters before closing
    its failed clients. No native state was captured by that older attempt,
    so its precise cause is not asserted.

14. The new send observer initially shadowed the prototype method used by the
    polish test's existing failed-chat injection. The local observer check
    exposed this harness failure. Observation now uses one prototype proxy and
    a WeakMap of control-channel counters, preserving later prototype patches
    and exact native returns/errors. Both themes again prove failed-send draft
    retention and a genuine successful retry, alongside all original polish
    checks. [Harness before/after proof](2026-10-05-bonjou-e2e-evidence/polish-observer-proof.json)
    records the correction. Polish fixture seeding now runs only at the app's
    origin, avoiding storage exceptions in opaque initial/download documents.

15. A separate scheduling proof found old roster snapshots could be enqueued
    after newer membership snapshots, making a browser discard a present peer.
    A test-only barrier in an isolated checkout reproduces the actual old
    `NotifyRosters` path and observes `[Alice]` followed by `[]` at Bob.
    [Before-fix proof](2026-10-05-bonjou-e2e-evidence/roster-order-before/summary.json)
    establishes this ordering defect; it does not identify the fifth run's
    precise cause. The final coordinator serializes snapshot and queue delivery
    with membership changes, including repeat-hello refreshes.

16. The same scheduling review reproduced a delayed lobby `peer_left` arriving
    after a recipient moved into a private room with that peer. Departure now
    removes membership, selects current recipients, and queues notices and
    correcting rosters under one Hub write lock. A peer still reachable through
    another current room receives the current roster without a false departure.
    Both isolated ordering reproductions fail before the fix and pass afterward.
    Four additional regressions bring the race suite to 123 top-level passes
    (163 including subtests), with one Windows-only skip on macOS.
    [Exact scheduling proofs and final race/vet/lint/format evidence](2026-10-05-bonjou-e2e-evidence/backend-roster/summary.json)
    record the result. Retained browser profiles now refresh their source label
    from the current candidate while preserving name, key, link, and transfer
    state, so a retained private-room peer is labeled correctly.

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
