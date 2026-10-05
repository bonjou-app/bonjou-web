# Bonjou original artwork

Date: 2026-10-04. Local production preview: `http://127.0.0.1:4173`.

The user requested original small visuals for the website and product after
approving the interactive experience. Five raster illustrations now form a
paper-and-ribbon family: warm ivory sheets, graphite details, vermilion ribbon,
tactile grain, and soft upper-left light. The existing Satoshi interface and
custom Blender desk render remain the visual context.

## Delivered

| Illustration                  | Website/product placement                                         |
| ----------------------------- | ----------------------------------------------------------------- |
| Notes with a binder clip      | After-class story, consent interlude, empty personal conversation |
| Embossed design swatches      | Studio story                                                      |
| Expandable project folder     | Shared-desk story                                                 |
| Two nearby devices and a file | Empty Everyone conversation                                       |
| Empty graphite receiving tray | Empty received-files list                                         |

The three story tabs change their artwork with the selected scenario. The
illustrations are decorative, with empty alt text and hidden image semantics;
the actual headings, status, selected files, Material file icons, and controls
still communicate product state. The empty tray contains no paper or completion
seal. No new decorative animation was added.

## Source and delivery

Generated with the built-in image generator. Three initial generations
established the physical direction; studio and project illustrations used the
tray as a style reference. The receiving tray was refined with a targeted
image edit. The initial tray with a sheet and
seal is retained as an authoring/style reference but is not shipped.

All six source PNGs are 1254 × 1254 RGBA with genuine alpha transparency. These
are retained raster sources, not editable 3D models. Exact prompts, reference
roles, source files, and the export command are recorded in the
[asset README](../../../assets/bonjou-visuals/README.md) and
[prompts](../../../assets/bonjou-visuals/prompts.json).

The export script only resizes and encodes. Ten 256px/512px WebP variants retain
alpha 0–255 and total 151,090 bytes. Individual exports are 6,862–27,594 bytes.
The image component chooses a responsive source, reserves dimensions,
lazy-loads, and decodes asynchronously. Source PNGs are not delivered by the
production site.

The production entry is 462.23 kB JavaScript (140.68 kB gzip); the deferred
workspace is 299.22 kB (94.11 kB gzip), and CSS is 142.23 kB (24.67 kB gzip).
These are build sizes, not load-time benchmarks.

## Verification

- `npm test`: 13 files and 101 tests pass.
- `go test ./...`: passes; Go source is unchanged, with cached package results.
- `npm run build`: TypeScript and production build pass.
- Asset inspection: all source/derived files decode as RGBA with real alpha.
- Live preview: all five artwork kinds decode; decorative semantics and
  selected-story changes checked. Light/dark and mobile screenshots reviewed.
- Chrome and WebKit `e2e:ui`: both pass, light/dark 320–1440px, navigation,
  onboarding, settings, palette, rooms, and mobile controls.
- `e2e:accessibility`: sixteen light/dark axe scans pass.
- Chrome and WebKit `e2e:experience`: both pass, including native WebRTC
  exact-byte/hash checks, approval and recovery, three story actions, twelve
  setup combinations, and eight scoped axe scans per engine.
- Chrome and WebKit `e2e:motion`: both pass, including playback, pause/replay,
  focus, offscreen pause, reduced-motion changes, and pointer tilt.
- Changed source formatting and `git diff --check`: pass.
- React review: the artwork is a small static component, without extra hooks,
  event listeners, network services, or image generation at runtime.

## Captures

- [Full artwork family](2026-10-04-bonjou-artwork-preview/family-preview.png)
- [Study story](2026-10-04-bonjou-artwork-preview/story-notes-light.png)
- [Studio story, dark](2026-10-04-bonjou-artwork-preview/story-studio-dark.png)
- [Project story, mobile](2026-10-04-bonjou-artwork-preview/story-project-mobile.png)
- [Consent section, mobile](2026-10-04-bonjou-artwork-preview/consent-mobile.png)
- [Nearby state, light](2026-10-04-bonjou-artwork-preview/app-nearby-light.png)
- [Nearby state, dark](2026-10-04-bonjou-artwork-preview/app-nearby-dark.png)
- [Nearby state, mobile](2026-10-04-bonjou-artwork-preview/app-nearby-mobile.png)
- [Received state, light](2026-10-04-bonjou-artwork-preview/app-received-light.png)
- [Received state, dark](2026-10-04-bonjou-artwork-preview/app-received-dark.png)

The long mobile story capture temporarily hides the fixed masthead to avoid
its overlay in an element screenshot. This is a capture-only adjustment.

Browser checks use local Chrome/WebKit and emulated mobile viewports. They do
not certify physical phones or manual screen-reader use. No deployment,
release, or protocol change was performed. The previous
[interactive-experience report](2026-10-04-bonjou-interactive-experience-verification.md)
records the broader sharing and reliability checks for that earlier build.
