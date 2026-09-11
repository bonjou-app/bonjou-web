# Nearby devices

An original Blender scene for the Bonjou landing page, built from geometry,
physical materials, and actual local Bonjou screenshots. No generated bitmap
artwork, third-party stock photos, or custom generated icons are used.

- `nearby-devices.blend`: editable Blender 5.2 scene with packed screen textures.
- `laptop-screen.png`, `phone-screen.png`: actual local test conversations.
- `../../public/images/nearby-devices*.webp`: responsive delivery assets.

From `website/`, with the app and local coordinator running:

```sh
node scripts/capture-scene-screens.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/render-nearby-scene.py
python3 scripts/optimize-nearby-scene.py
```

Use your platform's Blender executable if it is elsewhere. Screen capture
requires Playwright Chrome; image encoding requires Pillow. The raw PNG and
Blender backup files are ignored. Both scripts rebuild outputs from source.
