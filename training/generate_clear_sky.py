"""One-off script: CCSN has no clear-sky genus and no real clear-sky test
photos are available locally, so this generates synthetic blue/gradient-sky
images (varying hue/brightness for midday/dawn/dusk, plus light noise so the
class isn't a single flat color the model can trivially overfit on) as a
stand-in. Documented as synthetic, not real photography -- replace with real
clear-sky crops for better accuracy. Output: data/extra/clear/*.jpg
"""

import colorsys
import random
from pathlib import Path

from PIL import Image

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "extra" / "clear"
N_IMAGES = 60
SIZE = (480, 360)


def make_sky(hue: float, sat: float, val_top: float, val_bottom: float, noise: int) -> Image.Image:
    img = Image.new("RGB", SIZE)
    px = img.load()
    for y in range(SIZE[1]):
        t = y / SIZE[1]
        v = val_top + (val_bottom - val_top) * t
        r, g, b = colorsys.hsv_to_rgb(hue, sat, v)
        for x in range(SIZE[0]):
            jitter = random.randint(-noise, noise)
            px[x, y] = (
                max(0, min(255, int(r * 255) + jitter)),
                max(0, min(255, int(g * 255) + jitter)),
                max(0, min(255, int(b * 255) + jitter)),
            )
    return img


def main() -> None:
    random.seed(42)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i in range(N_IMAGES):
        kind = i % 3
        if kind == 0:  # midday blue
            img = make_sky(hue=0.58, sat=random.uniform(0.45, 0.7), val_top=0.95, val_bottom=0.75, noise=4)
        elif kind == 1:  # dawn/dusk warm
            img = make_sky(hue=random.uniform(0.05, 0.1), sat=random.uniform(0.3, 0.55), val_top=0.98, val_bottom=0.7, noise=5)
        else:  # pale hazy blue
            img = make_sky(hue=0.56, sat=random.uniform(0.15, 0.3), val_top=0.97, val_bottom=0.85, noise=3)
        img.save(OUT_DIR / f"synthetic_clear_{i:03d}.jpg", quality=88)
    print(f"Wrote {N_IMAGES} synthetic clear-sky images to {OUT_DIR}")


if __name__ == "__main__":
    main()
