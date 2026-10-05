# Bonjou Web polish and verification

Recorded on 2026-10-04. This pass polishes the existing web redesign and adds
regressions for the problems found during review. It does not deploy the site,
change a release version, or change protocol v2. The browser workspace still
uses direct WebRTC for application data and a signaling-only coordinator.

## Existing redesign and the scope of this pass

The [2026-09-11 verification report](2026-09-11-bonjou-web-verification.md)
documents the redesigned baseline. Its Satoshi typography, neutral light/dark
surfaces, restrained Bonjou red, Phosphor icons, shadcn/Radix controls, and
original Blender device scene already existed before this polish pass.

The baseline also supplied the landing page's three sharing steps,
network/privacy explanation, separate CLI installation area, and FAQs; a lazy
workspace with people and conversation panes; file approval, history,
verification, room creation/joining, QR/link actions, and mobile navigation.
The staged headline, section reveals, pointer-responsive device scene, and
pause/resume/replay sharing demo also came from that redesign. Reduced-motion
and hidden/offscreen pause behavior were retained and rechecked.

This pass fixes responsive overflow, keyboard/focus behavior, deferred mobile
approvals, unread and draft edge cases, file naming and drop errors, worker
failure propagation, session-route behavior, inaccurate download/install copy,
and a vulnerable development dependency. It adds populated-interface and
transfer-resilience browser coverage. Existing transfer/authentication and
room-isolation engineering from the baseline is credited to that earlier work.

## Reference review

The ratings below are judgments about suitability for Bonjou, not measured
usability scores. Vercel, Hey Clicky, and Apple are visual references. LocalSend
and PairDrop are direct sharing products and more useful for reviewing task
structure and product claims.

| Source | Relevance | Patterns worth adapting |
| --- | --- | --- |
| [Vercel](https://vercel.com/) | 7/10, visual | Large editorial type, generous whitespace, one dominant hero object, and a clear primary/secondary action pair. Its enterprise proof and sales structure do not establish evidence for Bonjou. |
| [Hey Clicky](https://www.heyclicky.com/) | 8/10, visual | Playful typography and floating product windows make the product feel specific. Bonjou's real device scene and sharing demonstration can provide that personality while operational controls stay simple. |
| [Apple](https://www.apple.com/) | 8/10, visual | Each full-width chapter presents one benefit, one product image, and consistent actions. This supports a readable sequence from sharing promise to demonstration, network limits, and installation. |
| [LocalSend](https://localsend.org/) | 9/10 for product structure; 6/10 for visual originality | A plain sharing promise, real desktop/phone previews, a short how-it-works sequence, and platform/privacy answers. Its broad feature-card pattern is less useful for Bonjou's distinct visual direction. |
| [PairDrop](https://pairdrop.net/) and [official source](https://github.com/schlagmichdoch/PairDrop) | 9/10 for task flow | Named nearby devices, choosing a recipient, and simple browser sharing make it a useful workflow comparison. Its cross-network options do not imply equivalent Bonjou reachability. |

Desktop captures of Vercel, Hey Clicky, Apple, and LocalSend were made at
1440 × 1000 and inspected as images, including lower-page sections. They are
in `/tmp/bonjou-reference-review/`. PairDrop was reviewed through its official
site/source documentation; it was not part of that screenshot set. No reference
assets, logos, testimonials, or product claims were copied into Bonjou.

## Design decisions and UX reasoning

The landing page keeps one clear entry into sharing and a separate CLI
installation path. Browser sharing needs the online coordinator; the CLI is a
separate offline LAN workflow, with no browser/CLI interoperability promise.
The actual Blender scene and app screenshots explain the product more
concretely than decorative feature illustrations. The workspace prioritizes
people, messages, offers, and transfer state; marketing animation stays on the
landing page.

The current changes make important controls remain usable in populated and
constrained layouts. Mobile approval details scroll independently of their
decision footer. A person can defer an offer and find it again from either
mobile pane. Dialogs return keyboard focus to a visible control, including
dialog-to-dialog navigation. Filenames and conversation regions retain useful
content without widening the page. Long sender names wrap within approval
details, including when multiple offers are pending.

The following principles inform these choices; they are not evidence that a
user study was performed. Definitions are from [Laws of UX](https://lawsofux.com/).

| Principle | Bonjou application |
| --- | --- |
| Hick's Law | Keep the sharing entry clear; separate installation alternatives and secondary settings from the immediate task. |
| Fitts's Law | Keep approval actions available in the drawer footer and usable at narrow widths. |
| Jakob's Law | Use familiar Radix dialogs, drawers, command selection, keyboard navigation, and browser-download language. |
| Proximity and common region | Group the recipient with its thread, and group an offer's details with its approval actions. |
| Aesthetic-usability effect | Use consistent typography, spacing, and real product imagery, while verifying functional behavior separately. |

The review also applies [Nielsen's ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/):

| Heuristic | Concrete application |
| --- | --- |
| Status feedback | Show connection, unread, pending, progress, completion, and terminal failure states. |
| Familiar language | Use recipient names and practical download/network language. |
| Exit and choice | Support decline, cancellation, deferred review, room exit, and navigation back home. |
| Consistent controls | Share controls and focus behavior across desktop, mobile, and themes. |
| Prevent mistakes | Require metadata approval and abort unreadable drops before offering a partial selection. |
| Visible context | Keep pending offers, history, room information, and recipient context visible. |
| Efficient use | Preserve drafts and provide keyboard command/search actions. |
| Focused design | Keep marketing detail outside the focused conversation workspace. |
| Recovery guidance | Preserve failed-send drafts and explain file, worker, and connection failures. |
| Useful help | Explain same-network limits, retry, installation, and browser downloads. |

## Current polish repairs

- **Responsive and keyboard access:** removed the hero scene's extra width;
  made conversation scroll regions keyboard reachable and named; restored
  dialog focus to visible controls; retained focus across command-palette
  transitions to other dialogs. Mobile offers can be dismissed with “Decide
  later,” reopened from either pane, and reviewed with a stable decision footer.
- **Populated conversation behavior:** checked long names/messages/filenames,
  unread counts while hidden or on the landing page, per-thread drafts, and a
  failed send followed by one successful retry. The composer keeps a short
  placeholder while its accessible label identifies the recipient.
- **Files and receiving failures:** filename sanitization has its own limit
  rather than inheriting the short peer-name limit; path separators/control
  characters and unusable names are handled. An unreadable file or folder now
  aborts the entire drop with a specific error. Unsupported, rejected, or
  stalled download-worker preparation sends an abort so both peers reach a
  terminal failure state before payload delivery.
- **Navigation and room scope:** reconnect route updates are scoped to sharing
  routes so a hidden workspace does not replace the landing URL. The final
  workflow rerun also covers the stale historical room URL discovered after
  leaving a room, navigating home, and using browser Back.
- **Honest copy and local preview:** received-file instructions point to browser
  downloads without promising disk persistence. WinGet instructions describe
  upgrades through `winget upgrade`. Preview serves `dist/client`, matching the
  packaged production output.

## Dependency and asset provenance

The initial dependency audit reported 11 vulnerabilities in development tooling
under the shadcn generator CLI. Compatible `npm audit fix` updates still left
the CLI's `fast-glob`/`ts-morph` → `micromatch` → `braces` paths vulnerable. The
official [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
listed no patched release; official npm metadata showed `braces@3.0.3` as the
latest release and the same ancestry in `shadcn@4.21.1` at remediation time.

The app's only build-time import from the generator was `shadcn/tailwind.css`.
Its exact `shadcn@4.21.1` CSS body was vendored unchanged as
[`website/src/lib/shadcn-tailwind.css`](../../../src/lib/shadcn-tailwind.css),
with the complete MIT license, copyright, pinned npm tarball URL, and update
instructions in its header. A byte-equality check against the installed CSS
passed before removal. `index.css` now imports that local file. The generator
CLI was uninstalled; generated components, `components.json`, Radix, and other
runtime foundations remain in place. No forced downgrade or new dependency was
introduced. The final lockfile removes the CLI tree without changing retained
package versions relative to the starting lockfile.

`npm audit --audit-level=moderate` exits successfully with **0 vulnerabilities**.
The final dependency remediation changes `website/package.json`,
`website/package-lock.json`, `website/src/index.css`, and the new vendored CSS.

The existing original Blender scene and packed real app screenshots remain
editable under [`website/assets/nearby-scene/`](../../../assets/nearby-scene/README.md).
No Blender regeneration was needed for this pass. The unmodified self-hosted
Satoshi variable font retains its Fontshare license and
[source/update notes](../../../public/fonts/README.md).

## Verification results

Browser suites use separate browser processes with default networking and run
sequentially against the local production preview and coordinator. Concurrent
suites would discover one another and invalidate empty-network assertions.
No STUN/TURN server, mDNS override, or ICE policy change was added.

| Command/check | Recorded result and stage |
| --- | --- |
| `go test ./...` | Pass during this pass; no Go changes were made. |
| `golangci-lint run ./...` | Pass, 0 issues. |
| `cd website && npm test` | Final source pass after route/wrap fixes: 10 files, 78 tests. |
| `cd website && npm run build` | Final source TypeScript and production build pass. |
| `cd website && npm ci` | Clean lockfile reinstall passes: 166 audited packages, 0 vulnerabilities. |
| `npm audit --audit-level=moderate` | Post-remediation pass, 0 vulnerabilities. |
| `npm run e2e:ui` | Post-dependency Chrome light/dark checks pass at 320–1440px. |
| `PLAYWRIGHT_ENGINE=webkit npm run e2e:ui` | Post-dependency WebKit light/dark checks pass at 320–1440px. |
| `npm run e2e:motion` and WebKit equivalent | Post-dependency pass in both engines. |
| `npm run e2e:lan` | Final production Chrome pass with default networking. |
| `PLAYWRIGHT_ENGINE=webkit npm run e2e:lan` | Final production full run passes with default networking. Earlier in this pass, one Alice-sees-Bob discovery timeout at 20s was followed by a fresh full pass. |
| `npm run e2e:workflows` | Final production pass, including room onboarding, failed approvals, stale room history, same-visible app history, and hidden-home reconnect. |
| `npm run e2e:accessibility` | Post-dependency pass: no axe WCAG A/AA violations on 16 surfaces. |
| `npm run e2e:polish` | Final pass: populated layouts, multiple offers, room focus restoration, approval-footer dimensions, real transfers, and 12 axe scans. |
| `npm run e2e:resilience` | Final production pass: concurrent/queued exact-byte transfers, direct mid-payload loss, and coordinator reconnect scope. |
| `COORDINATOR=http://127.0.0.1:46330 npm run smoke` | Final pass of signaling/privacy boundary and absence of payload routes. |
| `git diff --check` | Final pass. |

The resilience harness injects faults at native browser APIs rather than
replacing application protocol handlers. It holds file-stream reads after
payload progress, closes a real `RTCPeerConnection` during transfer, and delays
the native reconnect join while a temporary lobby roster arrives. It checks
two simultaneous receiver transfers, same-peer queue ordering, exact bytes
for every successful download, terminal failure on both peers after direct
loss, and confirmed room scope throughout reconnect. Coordinator sockets stay
open during the direct-link failure. No application payload HTTP endpoint is
used.

The populated polish harness uses real WebRTC except for explicitly injected
document visibility and one failed chat send. It checks light/dark interfaces
at 320, 390, and 1440px plus a 640 × 450 CSS viewport, representing the reflow
space available at 200% zoom on a 1280 × 900 desktop. That viewport check does
not simulate browser chrome or certify actual browser-zoom behavior.

Final production bundle sizes are 396.83 kB initial JavaScript
(122.35 kB gzip), 363.74 kB deferred workspace JavaScript (114.52 kB gzip), and
120.56 kB CSS (20.72 kB gzip). These are build outputs, not loading-time or
interaction-performance measurements.

Durable preview captures are available beside this report:

- [Light desktop landing](2026-10-04-bonjou-preview/landing-light.png)
- [Dark desktop landing](2026-10-04-bonjou-preview/landing-dark.png)
- [Mobile landing](2026-10-04-bonjou-preview/landing-mobile.png)
- [Mobile approval with a long sender name](2026-10-04-bonjou-preview/approval-mobile.png)
- [Actual direct-sharing workspace](2026-10-04-bonjou-preview/workspace.png)

The light/mobile captures were visually reviewed alongside the earlier dark
review. The mobile approval capture was visually reviewed for full sender-name
wrapping and all three decision buttons. The real sharing workspace capture
was also visually reviewed. Additional current captures are under
`$TMPDIR/bonjou-ui-check/` and
`$TMPDIR/bonjou-polish/`, with a landing review capture at
`/tmp/bonjou-review-landing-fixed.png`. The final workflow, LAN in both engines,
resilience, and smoke reruns all completed successfully. Across the two
accessibility suites, 28 axe scans found no violations for the requested
WCAG A/AA tags. These are scans of tested states, not 28 distinct surfaces or
complete accessibility certification.

## Verification limits

The WebKit discovery failure and subsequent full pass are both retained as
evidence. Source review found no deterministic defect explaining that timeout.
Its cause is unproven; the fresh pass does not establish reliability across
other hosts or networks. A recurrence needs sanitized native signaling/ICE
state and timing diagnostics, without keys, raw SDP, addresses, or payload logs.

Tests use browsers on this Mac and mobile viewport emulation. They do not
certify physical iOS/Android phones, actual routers, VPNs, guest-network
isolation, native notification delivery, or QR scanning with a phone camera.
Automated axe and keyboard checks do not provide full screen-reader
certification. Physical-device and manual assistive-technology checks remain
necessary. Browser transfer completion establishes authenticated stream
consumption, not whether a person retained a downloaded file on disk.

The coordinator invariant was also reviewed in source and dependencies:
`internal/relay` has no `internal/network` dependency, exposes only `/healthz`
and `/ws`, rejects application transfer frames, and scopes rooms/signaling to
the source network. The packaged reverse proxy defaults to 404 for other
paths. This source review and local smoke evidence do not certify a deployed
server configuration. No deployment or release-version change was made.
