"""Augmentation shared by prep.py (student/teacher training data) and
distill.py (so the teacher is sampled on the same distribution the student
trains on)."""

import random

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def add_haze(img: Image.Image, rng: random.Random, strength: float = 0.35) -> Image.Image:
    amount = rng.uniform(0, strength)
    arr = np.asarray(img, dtype=np.float32)
    white = np.full_like(arr, 255.0)
    return Image.fromarray(((1 - amount) * arr + amount * white).astype(np.uint8))


def tint(img: Image.Image, rng: random.Random, strength: float = 0.25) -> Image.Image:
    """Sunset/sunrise-style warm or cool color tint."""
    warm = rng.random() < 0.5
    color = (255, 180, 120) if warm else (150, 180, 255)
    amount = rng.uniform(0, strength)
    arr = np.asarray(img, dtype=np.float32)
    tint_arr = np.array(color, dtype=np.float32)
    return Image.fromarray(((1 - amount) * arr + amount * tint_arr).astype(np.uint8))


def brightness_contrast(img: Image.Image, rng: random.Random) -> Image.Image:
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.7, 1.3))
    return ImageEnhance.Contrast(img).enhance(rng.uniform(0.7, 1.3))


def random_crop(img: Image.Image, rng: random.Random, min_keep: float = 0.75) -> Image.Image:
    w, h = img.size
    keep = rng.uniform(min_keep, 1.0)
    cw, ch = int(w * keep), int(h * keep)
    x0 = rng.randint(0, w - cw)
    y0 = rng.randint(0, h - ch)
    return img.crop((x0, y0, x0 + cw, y0 + ch)).resize((w, h))


def phone_blur_noise(img: Image.Image, rng: random.Random) -> Image.Image:
    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0, 1.5)))
    arr = np.asarray(img, dtype=np.float32)
    noise = rng.uniform(0, 8) * np.random.randn(*arr.shape)
    return Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))


def augment_image(img: Image.Image, rng: random.Random) -> Image.Image:
    """Apply a random subset of the above, in a fixed sensible order."""
    img = img.convert("RGB")
    if rng.random() < 0.5:
        img = random_crop(img, rng)
    if rng.random() < 0.4:
        img = add_haze(img, rng)
    if rng.random() < 0.4:
        img = tint(img, rng)
    if rng.random() < 0.6:
        img = brightness_contrast(img, rng)
    if rng.random() < 0.3:
        img = phone_blur_noise(img, rng)
    return img
