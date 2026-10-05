"""Encode the Blender still for responsive web delivery. Requires Pillow."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
source = Image.open(root / 'assets/nearby-scene/nearby-devices.png').convert('RGB')
output = root / 'public/images'
output.mkdir(parents=True, exist_ok=True)
for width, suffix in [(1600, ''), (800, '-small')]:
    image = source.resize((width, round(source.height * width / source.width)), Image.Resampling.LANCZOS)
    path = output / f'nearby-devices{suffix}.webp'
    image.save(path, 'WEBP', quality=85, method=6)
    print(f'{path.name}: {path.stat().st_size:,} bytes')
