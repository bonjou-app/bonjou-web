# Bonjou Design System

Derived from what ships in `src/share/`. Update this file when the
shipped design changes, not before.

## Concept

Two surfaces with a shared visual language. `/` introduces nearby sharing;
`/app` opens the workspace; `/r/{code}` opens a room directly.

The landing page has a static headline, a Blender-rendered device scene,
three sharing steps, a plain explanation of privacy and network limits,
CLI installation, and practical questions. It opens no coordinator connection
and takes no session lock. The sharing engine is loaded on first entry to
the workspace. A session and its conversation drafts survive a client-side
trip home and back.

## Theme

Light and dark are both first class, plus following the system. The choice
is resolved in JS and stamped on `<html data-theme>`, so CSS reads one
attribute and "system" costs no duplicated rules. An inline script in
`index.html` applies it before the first paint; without that a dark-mode
visitor gets a white flash for as long as the bundle takes to parse.

## Color

Bonjou tokens use OKLCH. Cool, almost neutral grays keep the surfaces quiet.
Tokens live in `tokens.css`; semantic library variables map to them in
`src/index.css`. White labels on primary controls preserve contrast.

The palette is restrained: neutral surfaces, vermilion
for the Bonjou brand and primary actions, and separate green and amber states. Light mode uses a near-white conversation
surface and a soft gray sidebar. Dark mode uses charcoal surfaces with the
same hierarchy. Both themes are defined in `tokens.css`; avoid copying color
values into components or this document.

Shadcn's semantic variables map to the Bonjou tokens in `src/index.css`.
The cascade order is `theme, base, bonjou, components, utilities`.
Base typography belongs in the base layer. Named page layouts belong in the
Bonjou layer, before the library's utilities. Do not add custom button,
input, tab, or card skins that override shadcn's component variants.

## Typography

**Satoshi** for interface text and headings, with **Geist Mono** only for
literal data. Satoshi is the user's chosen direction after the Public Sans
pass felt too plain. Its variable WOFF2 is self-hosted at
`public/fonts/Satoshi-Variable.woff2`, preloaded once, and licensed in the
same directory. Geist Mono comes from `@fontsource-variable`. Both font
families are shared by the landing, workspace, and Radix portals.

Mono is not decoration. It is used only for things that are literally data:
byte counts, room codes, fingerprints, and shell commands. Filenames,
people, timestamps, labels, and controls use the sans family.

Hierarchy comes from weight and size. The root is 16px; regular UI labels
are 14px, chat and supporting prose are 15–16px, and secondary metadata is
12–13px. Marketing headings are fluid and use weights 650–700. The hero
uses -0.045em tracking, and section headings use -0.04em. Avoid the earlier
cramped -0.075em headline spacing. Workspace headings use fixed rem sizes.
The headline reveals by line without changing its text or its reserved
layout. Body measure caps around 65ch.

## Iconography

### Bonjou logo

The approved mark is a rounded lowercase **b**, with two connected peer shapes
cut out of its bowl. Preserve its silhouette, diagonal connection, and open
negative space. Use a flat vermilion fill (`#F83A27` for exported sRGB assets),
with no gradient, texture, shadow, or extra symbol. UI colors still use the
existing tokens; the logo has a fixed brand color in both themes.

`src/share/brandMark.json` is the canonical geometry and export palette.
`Logo.tsx` reads it directly. Run `npm run generate:brand` after changing it to
regenerate the SVG, transparent PNG, padded avatar, and browser icons under
`public/`. The renderer is a development dependency; normal builds use the
committed assets. The padded avatar uses a charcoal background and fits inside
both square and circular profile crops. The transparent mark works on both
light and dark surfaces. Keep the lowercase Satoshi wordmark beside the UI mark.

The CLI repository's `docs/assets/bonjou-mark.svg` and `docs/assets/logo.png`,
and the organization profile's `profile/assets/`, are copies of these exports.
Update those copies together when the approved mark changes. Check the 16px
and 32px icons, both themes, and the mobile masthead before publishing.



Two sets, doing two different jobs.

**Phosphor** draws every control, including icons inside shadcn and Interior
components. Use regular weight at 16–20px for controls and duotone for larger
empty-state illustrations. Icons are `aria-hidden`, with the label carried
by text or `aria-label`. Import individual icons from the package's supported
`dist/csr` paths so the development server does not traverse the full catalog.
`components.json` uses `iconLibrary: "phosphor"` for future additions.

**Material Icon Theme** draws payloads, and only payloads. These are the
full-colour file-type icons VS Code shows, resolved from the filename the
same way: an exact filename beats an extension, and the longest extension
wins so `archive.tar.gz` reads as an archive rather than as `.gz`.

The colour is the point. A transfer list is a column of filenames, and a
blue Python glyph or a red PDF is the fastest way to find the one you want
while scrolling. Because those icons are polychrome, the tile behind them
is a neutral plate: a vermilion frame around a blue glyph fights it.

Folders are stateful. A folder payload shows a closed folder at rest and an
open one while its bytes are actually moving, which is a free, honest piece
of progress feedback that costs no space.

`src/share/fileIconMap.ts` is generated by `scripts/build-file-icons.mjs`
from the theme's own manifest: 68 icons covering 610 extensions and 235
exact filenames. Regenerate rather than edit it, and widen the curated list
in the script if a type worth distinguishing is missing.

## Layout

- The marketing page shares a centered content area and consistent
  responsive gutters, with a maximum content width of 1280px. An animated
  headline sits beside the device scene. Content uses prose, ordered steps,
  and disclosure instead of repeated feature cards.
- The workspace has a 288px sidebar at desktop sizes and uses `100dvh`.
  The conversation is a flat, full-height surface with a subtle dividing line.
  Messages and the composer share a maximum width of 896px.
- Below 860px, the people list and conversation swap as separate panes.
  The back control appears only in this layout.
- Marketing navigation becomes a shadcn Sheet at 760px and below. Resizing back
  to desktop closes the sheet instead of hiding an active focus trap.
- Empty conversations have a centered icon, heading, and useful next step.
  Onboarding is a centered shadcn Card with a visible name label.
- Use shadcn's built-in radius and variants. Primary controls are 40–48px;
  room actions and onboarding are at least 44px. Keep settings and dialogs
  aligned with the library's spacing vocabulary.

## Information architecture

The workspace is a conversation, not a dashboard. People on the left, one
thread on the right, one composer beneath it.

**Everyone is a view, not a channel.** Selecting it shows every event from
everybody merged by time, and the composer addresses all reachable peers.

**A room narrows the audience.** Entering a room removes its members from
the open lobby. Only people in the same room and source network become
connection candidates. A code cannot bypass network isolation. Room requests
have pending, error, and timeout states. Leaving starts a fresh lobby
connection. Reconnection preserves confirmed membership and ignores any
intermediate lobby roster while the room is being rejoined.

Messages and transfers are one event type on one timeline. A fan-out to
several people collapses to a single row carrying the aggregate, and the
aggregate reports every state present, because a broadcast is rarely in one
state.

## Components

The component foundation is **shadcn/ui** using the Radix base. Its source
lives in `src/components/ui/`, so the project owns the markup while
keeping the library's keyboard behavior, focus management, ARIA wiring, and
composition patterns. Tailwind maps shadcn's semantic variables back to the
`--bj-*` tokens. Shadcn supplies visual styles as well as behavior and structure;
page CSS is restricted to layout and conversation-specific presentation.

- Button, Input, Input Group, Field, Switch, Toggle Group, and file-input labels
  cover every control. There are no hand-rolled native controls in the React
  surfaces.
- Card (with Header, Content, and Footer), Empty, Item, Badge, Avatar, Alert,
  Progress, and Separator cover repeated content structure and state.
  Use Item for plain lists; do not style a Card back into a plain text row.
- Dialog, Sheet, Drawer, Command, Tabs, Accordion, Tooltip, and Sonner cover
  overlays, navigation, disclosure, hints, and notices.
- Components copied from **Interior** are allowed only when shadcn has no
  equivalent. The current exceptions are `CopyButton` (clipboard feedback
  with a fallback path) and `NewItemsPill` (return-to-latest feedback). They
  live in `src/components/interior/` and use Bonjou tokens plus
  shadcn buttons rather than introducing a second visual system.
- No table is currently rendered. If one is added, start with shadcn Table
  rather than creating a new grid primitive.

- **Rail.** Brand, a live status strip, search, then conversations grouped
  Everyone here / Received files / On your Wi-Fi / Joined by code. Your own name and the room code
  sit at the bottom, where account controls belong.
- **Chip.** One conversation. Avatar or mark, name, and either a source tag
  or an unread count. `aria-current` marks the active one.
- **Transfer card.** File-type icon, name, size, a meter, then a state
  line and explicit approval controls. The meter
  scales rather than changing width, because progress ticks ten times a
  second and animating width would relayout the card on every one.
- **Pending offer.** The only row that asks for a decision. It stays in
  chronological position on a desktop; on a phone it is raised into a bottom
  sheet, because a decision buried in a scrolled thread is one people miss.
- **Composer.** Auto-growing textarea, attach controls, the destination
  spelled out, and a drop target across the whole shadcn Input Group. Drafts
  are kept per conversation and cleared only after successful sending. With
  no recipients, the workspace presents invitation and connection help.
- **Rooms.** Create and Join are separate shadcn Tabs. Created rooms show
  the copyable code and QR, plus an explicit Leave room action. Joining
  requires an explicit submit and keeps errors next to the code field.
- **Overlays.** The shadcn Command Dialog powers the palette, Dialog powers
  verification and rooms, Sheet powers the right-hand settings and transfer
  panels, and Drawer raises pending offers on phones. Focus trapping, escape,
  labelling, and scroll locking stay inside the primitives.

## Honesty rules

These are design rules because they are mostly enforced in the UI layer.

- **No invented live data.** The landing page makes no GitHub counter or
  roster requests. The Blender scene uses screenshots of a real local test
  conversation and is presented as an illustration. Session totals are
  summed from actual events.
- **No progress that was not measured.** A direct transfer reports a real
  percentage and a real rate. Before the first payload frame arrives, its bar
  remains indeterminate instead of guessing. Completion is acknowledged
  only after the download worker authenticates and consumes all expected
  bytes. The UI says to check browser downloads; it does not claim proof of
  disk persistence. History distinguishes pending, receiving, checking,
  completed, declined, and failed states.
- **No control that does nothing.** Every switch in settings is wired to
  something, and the notification switch only moves if the browser actually
  grants permission.
- **Install commands are verbatim from README.md.** They are executed as
  written, so they are never paraphrased, shortened, or pointed at a
  nicer-looking domain. If they drift, the README wins.
- **Limits are stated at the same weight as guarantees.**

## Motion

The landing has a more expressive entrance: headline lines reveal in
sequence, the desk settles into place, and sections enter once as they reach
the viewport. Use `cubic-bezier(0.22, 1, 0.36, 1)` without bounce. Hover
feedback moves links and icons a few pixels; a fine pointer tilts the desk
by at most a few degrees. No interaction waits for an animation to finish.

The scene's clearly labelled sharing demo lasts four seconds and plays once
when mostly visible. It illustrates offer, approval, direct transfer, and
receipt. Pause, resume, and replay controls are shadcn buttons. The packet
and Radix progress indicator share a Web Animations timeline. The demo
pauses offscreen or when the browser tab is hidden. It never opens a
connection or fabricates real transfer metrics.

Workspace feedback stays short: 220–450ms for entry, incoming rows, and
completion. Presence indicators stay still; active transfers retain their
existing measured progress. Animate transforms and opacity, not layout.

`prefers-reduced-motion` disables entrances, scroll movement, and pointer
tilt. Changing the preference cancels a demo already running. The static
alternative has working Show result and Reset controls and a textual
explanation of the same sequence. All effect observers, animation frames,
and animation objects are cleaned up when the landing unmounts.

## Rules

- No side-stripe borders wider than a hairline, gradient text, decorative
  glassmorphism, hero metrics, or grids of identical cards.
- No em dashes in interface or marketing copy.
- Visible file inputs are wrapped in a `<label>`, never layered over a button,
  which would produce two controls in the accessibility tree. The palette's
  programmatic file inputs stay visually hidden, carry explicit labels, and
  are activated by ref.
- Never nest a control inside another control. The room row is two buttons
  side by side for exactly this reason.
- **A modal that is `display: none` is still an open modal.** It keeps the
  focus trap and the body's pointer-events lock, which silently freezes the
  page behind it. Anything modal is unmounted at the breakpoint, never
  hidden at it.
- The QR code keeps a light plate in both themes. The format assumes dark
  modules on a light ground and many phone cameras will not read an inverted
  code.
- Sticky surfaces are opaque. A translucent masthead lets body text scroll
  through it and reads as a rendering fault.
- Sections carry `scroll-margin-top` matching the masthead height so anchors
  do not land underneath it.

## Device scene

The landing still is a Blender Cycles render of an aluminium laptop, a phone,
a clothbound notebook, and a ceramic cup on a pale desktop. Both screens are
actual Bonjou conversations captured by `scripts/capture-scene-screens.mjs`.
The scene uses daylight, physical materials, and restrained color. The interactive
annotations use existing Phosphor icons and are explicitly labelled as a
sharing demonstration. The physical render stays the visual foundation.

Editable source, packed textures, and a reproduction guide live in
`assets/nearby-scene/`. `scripts/render-nearby-scene.py` rebuilds the
scene; `scripts/optimize-nearby-scene.py` exports 1600px and 800px WebP assets.
The page reserves image dimensions and chooses a responsive source. The raw
intermediate PNG is ignored; only optimized images ship to the browser.
