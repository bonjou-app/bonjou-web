# Bonjou paper-and-ribbon artwork

Five original, project-created raster illustrations. Generated with the built-in
image generation tool, then visually reviewed and exported for the website.
No stock assets, copied competitor graphics, embedded text, or pretend screens.

Warm ivory paper, graphite details, vermilion ribbon, tactile grain, upper-left
studio light, and a three-quarter view make one consistent family. Transparent
backgrounds allow the same artwork to sit on light, dark, and red surfaces.

| Web asset  | Source PNG                  | Placement                                                         |
| ---------- | --------------------------- | ----------------------------------------------------------------- |
| `notes`    | `notes-source.png`          | After-class story, consent interlude, empty personal conversation |
| `studio`   | `studio-source.png`         | Studio story                                                      |
| `project`  | `project-source.png`        | Shared-desk story                                                 |
| `nearby`   | `nearby-source.png`         | Empty Everyone conversation                                       |
| `received` | `received-empty-source.png` | Empty received-files list                                         |

Each source is 1254 × 1254 RGBA with actual alpha transparency. The first
`received-source.png` remains as a material reference and authoring candidate;
it contains a sheet and seal and is not shipped. Its empty-tray edit is used
for the empty state. Notes have more visible sheet layers and a wider ribbon
than the initial prompt requested; the selected sculpture was accepted on its
visual merit, without relying on a specific sheet count.

The exact prompts and reference roles are in [prompts.json](prompts.json).
The tool did not supply a model identifier or random seed. Generations are not
deterministically reproducible; these PNGs are the retained source assets.
They do not include editable 3D geometry.

To reproduce the web exports, from the repository root:

```sh
python3 scripts/optimize-brand-artwork.py
```

Requires Pillow. This only resizes/encodes the images; it preserves the artwork
and its alpha. It writes 256px and 512px WebP files under
`public/images/bonjou/`. Each is 7–28 kB. Browser markup chooses a responsive
source and lazy-loads the art. Source PNGs are not served in the app bundle.

`BrandArtwork` marks the images decorative. The actual app labels, status,
payload icons, approvals, and transfer progress remain the source of truth.
