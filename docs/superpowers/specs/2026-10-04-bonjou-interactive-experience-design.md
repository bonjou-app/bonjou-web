# Bonjou: a site people can use

The user asked for fresh sections and meaningful interactions, then explicitly
selected all three directions: a hands-on sharing lab, a cinematic product
story, and new utilities in the real sharing app. Implementation is authorized
within that scope. Preserve the uncommitted polish work and protocol boundaries.

## Direction

People pass notes, pictures, and project files across a daylit table. The site
should feel like that shared desk: clear objects, direct actions, and a visible
result. Keep the chosen Satoshi typography and Bonjou vermilion, but replace
the previous two-column static introduction with a wide, usable handoff lab.
Use a stronger colored interlude and varied compositions to give the page rhythm.

Three approaches were considered. A cinematic-only page is approximately 6/10
for this request because it stays largely passive. A working product lab with
selectable stories and setup tools is 9/10. New app utilities are 9/10 when they
reduce actual friction. The user chose to combine the latter two with the
cinematic presentation, rather than making motion the main deliverable.

## New experiences

1. **Handoff lab:** choose an original sample or a small local file; offer its
   metadata; approve or decline on the second device view. Approval runs a real
   local WebRTC transfer between two connections in this browser. Progress
   comes from received bytes, SHA-256 verifies the result, and a separate click
   downloads the received copy. Reset, cancellation, unsupported APIs, and
   timeouts have useful outcomes. Load transport code only when needed. No
   coordinator, session ownership, external ICE service, or automatic download.
   Clearly distinguish this sandbox from independent devices and protocol v2.
2. **Sharing stories:** selectable study, creative, and project examples change
   the content and payload context around the original Blender scene. Each has
   a working action to load its sample into the lab. The scene is an illustration;
   no invented users, speed metrics, testimonials, or network discovery.
3. **Connection explorer:** choose browser/CLI, network arrangement, and internet
   availability. A diagram and setup steps change together. Show online browser
   discovery, offline CLI capability, device isolation, and the limits of room
   codes truthfully. An explicit browser check tests local API availability and
   a real cryptographic roundtrip; it does not pretend to diagnose Wi-Fi or prove
   another device is reachable.
4. **File staging tray:** file/folder picks, drops, and pasted clipboard files
   remain local until the sender presses Offer. Review or remove selections,
   choose recipients, then offer metadata through the existing session service.
   Receiver approval remains required. Folder batches retain their paths.
   Staging survives conversation and home navigation, while chat drafts remain
   conversation-specific. Palette file actions use the same staging path.

## Research and adaptation

- [Resend](https://resend.com/): controls with an immediate visible result.
- [Linear demo](https://linear.app/demo): an explorable product before signup.
- [Raycast](https://raycast.com/): selectable examples grounded in visitor tasks.
- [PairDrop](https://github.com/schlagmichdoch/PairDrop): payload-first interaction,
  recipient selection, and approval.
- [Blip](https://blip.net/): demonstrate a handoff rather than only explaining it.
- [LocalSend](https://localsend.org/) and its [web project](https://github.com/localsend/web):
  direct-sharing task structure. Browser access and consent are not unique claims.
- [Apple Continuity](https://www.apple.com/macos/continuity/): paired-device stories.

Borrow the interaction patterns and composition, with original copy and assets.
Bonjou does not acquire competitors' resumable transfers, cross-network rooms,
browser/CLI interoperability, or persistent storage through this UI change.

## Validation

Use TypeScript, unit/protocol tests, production build, and focused browser tests.
Prove actual RTC use, no homepage coordinator/lock acquisition, no payload before
approval, decline without transfer, exact received/downloaded bytes, reset and
cancel cleanup, and supported-browser recovery. Test scenario controls, every
network combination, browser checks, and staged files before/after recipient
selection. Revalidate real file/folder sharing after the new explicit sender
offer action. Check both themes at 320–1440px, keyboard access, reduced motion,
long content, and axe. Inspect real screenshots and refine visually.

Physical devices, actual guest routers, and native notification delivery remain
outside emulated-browser certification. No release or deployment is requested.
