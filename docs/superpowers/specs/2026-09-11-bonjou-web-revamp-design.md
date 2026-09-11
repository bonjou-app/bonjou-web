# Bonjou Web revamp: proposed design and baseline findings

Status: approved by the user on 2026-09-11. Implementation and testing authorized.

## Objective

Revamp the marketing page and the complete browser sharing experience. Make
sharing with someone nearby clear, fast, and dependable. Use the existing
shadcn/ui and Radix components, Public Sans, Phosphor controls, and Material
Icon Theme payload icons. Preserve the user's uncommitted work.

## Design direction

Physical scene: two people sharing work across a table in an ordinary,
daylit office, with laptops and phones already open. The interface should
be as understandable as handing over a file, with restrained surfaces and
clear, comfortably sized controls. Support system, light, and dark themes.

Use neutral surfaces, dark readable text, and Bonjou's existing vermilion
as a limited identity and selection accent. Keep Public Sans for interface
text and Geist Mono for literal codes and commands. Avoid decorative badges,
repeated empty cards, artificial gradients, glass effects, generated icons,
and em dashes in all user-facing text, including notifications.

The recommended approach is a practical sharing workspace with one expressive
marketing image. A heavy 3D application would add visual competition and
loading cost. A cosmetic refresh would leave the interaction problems intact.

## Marketing and imagery

- Simplify the masthead to the useful entry points: how sharing works,
  privacy, CLI installation, and Open Bonjou.
- Replace the large empty roster in the hero with a Blender-rendered scene
  of two nearby devices. Model credible materials, proportions, edge detail,
  lighting, and shadows. Show the real redesigned interface on their screens
  as an illustration, never as a fabricated live session.
- Keep the primary action and an explanation of the same-network requirement
  visible in the first viewport. The image should support those elements.
- Render still assets with Blender rather than loading a 3D engine in the
  app. Save the editable source and render script under existing website
  directories. Export responsive optimized images and review them at actual
  display sizes. If the render does not meet the quality bar, revise it.
- Present the sharing sequence through one useful product example. Consolidate
  repeated encryption and privacy explanations. Put detailed technical
  material behind the existing Accordion or links to repository documentation.
- Retain the OS-specific CLI installation recipes and verify them against
  README.md. Make alternatives progressively available instead of presenting
  every installation method at the same visual weight.
- State browser support and direct-connection limits accurately. Do not
  promise infinite file sizes, automatic retries, or confirmed disk writes
  without corresponding implementation evidence.

## Workspace and feature coverage

| Surface | Proposed behavior and component foundation |
| --- | --- |
| Onboarding | A short, clearly labeled name form using Field, Input, and Button. Explain who can see the name. Room links retain their destination through onboarding. |
| People | A focused sidebar of nearby people and the current sharing scope. Use existing Button, Avatar, Badge, and Item components. Search has a useful empty result and keyboard access. |
| Connection state | Distinguish connecting to the coordinator, looking for reachable people, a blocked direct connection, and being offline. Provide relevant next steps where the failure occurs. |
| Everyone | Explain the recipients before sending. Reading the combined timeline should clear the appropriate unread counts only while the conversation is actually visible. |
| Rooms | Use the existing Tabs and Dialog. Creation and joining show pending, success, and inline error states. Keep the code field on a failed join. Provide a clear way to return to nearby sharing. Keep QR codes on a light plate. |
| Chat | Readable message rhythm, sender context, timestamps, wrapping, preserved scroll position, and clear recipient scope. Drafts should not silently move to another recipient or disappear on failed send. |
| Files and folders | Reuse InputGroup and file inputs. Support picking and dropping files and folders, preserve folder paths, show file count and measured progress, and report partial failures accurately. |
| Approval | Show sender, filename, size, and folder context before payload transfer. Use inline actions on desktop and the existing Drawer on mobile. Multiple offers must remain manageable. |
| Transfer status | Distinguish waiting, starting, transferring, checking completion, completed, declined, and failed. History must show text status, not only a colored dot. |
| Received files | A readable session list with truthful download status and clear explanation of what remains after closing the tab. |
| Verification | Retain the fingerprint comparison Dialog. Make the confirmed state visible and readable. Do not imply a verified identity when only a connection key was compared. |
| Settings | Retain the Sheet, Field, ToggleGroup, and Switch primitives. Give explicit name-save feedback and accurate notification permission feedback. |
| Command palette | Retain Command and its keyboard behavior. Disable actions without valid targets and preserve focus when opening another surface. |
| Multiple tabs | Distinguish ownership acquisition from an already-open session. Verify takeover, automatic handover, and navigation between the site and app. |
| Mobile | Separate people and conversation panes, clear back navigation, comfortable touch targets, safe-area spacing, and a composer that stays usable with the keyboard open. |

## Engineering boundaries

Use the existing component library first. New application components are
justified only by reusable product behavior, not by a desire to invent a
second set of controls. Keep layout CSS separate from the library's variants.

Split marketing, workspace, and infrequently used overlays where that reduces
initial loading without resetting a live session. Review progress update
rendering, long conversations, lazy assets, and unnecessary dependencies.

Preserve the signaling-only coordinator and direct WebRTC payload path.
Preserve metadata-first approval, authentication, framing, and known-answer
vectors. Fix lifecycle and completion behavior without changing the wire
format unless separately justified and reviewed.

## Baseline evidence

Checks performed against the existing working tree on 2026-09-11:

- `go test ./...`: passed.
- `cd website && npm test`: 7 files and 48 tests passed.
- `cd website && npm run build`: passed, with a large-chunk warning.
  JavaScript entry: 906.18 kB minified, 282.11 kB gzip.
- Local app loaded and rendered without an initial Vite overlay or browser
  error in the agent-browser smoke check.
- Existing UI E2E: failed at its immediate dialog-removal assertion after
  selecting a mobile navigation link. A diagnostic run that awaited the
  dialog closing passed its layout, onboarding, settings, palette, room,
  font, and composer checks across light/dark and 320 to 1440 pixels. It
  failed its final console assertion on external HTTP 403 responses.
- Existing LAN E2E: failed waiting for Bob to become visible to Alice.
  Instrumentation confirmed candidates, encrypted signals, successful SDP
  exchange, and accepted ICE candidates. Browser local-network permission
  did not resolve it. A basic same-page WebRTC test connected successfully.
  A diagnostic test-browser launch with
  `--disable-features=WebRtcHideLocalIpsWithMdns` passed the complete LAN
  script: discovery, chat, room isolation, desktop/mobile approval, decline,
  and exact downloaded bytes. This isolates the failing condition to
  cross-context mDNS discovery in this environment. It does not establish
  that normal browser defaults work, and is not a proposed production fix.
- Desktop landing/workspace and mobile settings/rooms were visually reviewed.

These results are a baseline, not verification of the proposed redesign.
No production source changes or Blender assets have been made in this task.

## Findings to resolve

1. **Transfer completion needs stronger evidence.** `finishReceive` marks
   an incoming transfer done after handing the expected ciphertext to the
   worker. `DownloadSink.close()` does not await decryption completion, and
   worker cancellation after opening is not propagated as a durable sink
   failure. Add fault-injection coverage before changing this lifecycle.
2. **Room feedback and navigation are incomplete.** The room dialog has no
   pending/error model, closes immediately on join, and provides no leave
   action after entering a room.
3. **Unread state is inconsistent.** `markRead` updates one thread key, while
   unread counts are computed against peer IDs. The Everyone view therefore
   does not clear the peer counts. Workspace also marks a thread read without
   considering mobile pane visibility or document visibility.
4. **History loses state.** `transferHistory` reduces status to `ok`, and the
   history UI gives all other states the failure indicator. Pending and
   active outgoing transfers need explicit text states.
5. **Send errors can erase a draft.** Composer clears text immediately after
   invoking the asynchronous sender. Preserve a recoverable draft when
   delivery to the intended recipients fails.
6. **Copy overstates outcomes.** The failed incoming-transfer row says
   nothing was written to disk, despite incremental streaming. The offline
   sidebar says half-sent files restart, without an automatic retry path.
   Notification text still contains an em dash.
7. **The landing page is repetitive.** Its empty network card repeats the
   entry action, and several sections repeat the same privacy explanation.
   The current visual hierarchy is approximately 5/10, a subjective design
   assessment based on the reviewed screenshots.
8. **Tests are not yet a release gate.** The UI script races an animation and
   depends on external API responses. The LAN test does not currently reach
   its chat, approval, file integrity, and room-isolation assertions here
   with default browser settings, although those assertions passed in the
   explicitly modified diagnostic browser described above.

## Validation required after implementation

- Go and browser protocol suites, TypeScript, production build, and the
  coordinator smoke suite.
- Real browser discovery and direct chat between separate clients. Exercise
  private and group recipients, room entry/exit, bad codes, reconnects, and
  duplicate-tab takeover.
- Exact downloaded bytes for empty, ordinary, multi-chunk, concurrent, and
  folder payloads. Verify archive paths. Verify no download before approval
  and no payload after decline. Exercise cancellation, mid-transfer peer
  loss, corrupted frames, and worker failure.
- Both themes, 320/390/768/1024/1440 widths, keyboard-only navigation, focus
  return and traps, touch targets, overflow, zoom, reduced motion, and long
  names/messages/filenames. Include populated, empty, busy, and error states.
- Verify Chromium first, then supported Firefox/WebKit flows where available.
  Record browser or operating-system limitations instead of masking them.
- Inspect production assets, image quality, actual fonts, console/network
  failures, initial bundle costs, and session continuity after lazy loading.
- Update DESIGN.md to describe the final shipped result, with a concise
  verification report and screenshots. Do not deploy as part of this scope.
