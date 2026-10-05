"""Export responsive WebP files without changing the artwork or its alpha."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets" / "bonjou-visuals"
OUTPUT = ROOT / "public" / "images" / "bonjou"
ARTWORK = {
    "notes": "notes-source.png",
    "studio": "studio-source.png",
    "project": "project-source.png",
    "nearby": "nearby-source.png",
    "received": "received-empty-source.png",
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, source in ARTWORK.items():
        with Image.open(SOURCES / source) as original:
            image = original.convert("RGBA")
            for edge in (256, 512):
                exported = image.resize((edge, edge), Image.Resampling.LANCZOS)
                path = OUTPUT / f"{name}-{edge}.webp"
                exported.save(path, "WEBP", quality=86, method=6, exact=True)
                print(f"{path.relative_to(ROOT)}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
