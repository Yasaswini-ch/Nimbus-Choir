"""Dedupe, resize, stratified-split the raw class folders, and write
train/val/test manifests. Also materializes augmented copies of the train
split so the Tinker teacher and the local student see the same distribution.

Usage:
    python prep.py --data-dir ../data --image-size 256 --augment-per-image 2
"""

import argparse
import csv
import random
from pathlib import Path

import imagehash
from PIL import Image

from common.augment import augment_image
from common.labels import CLASSES


def dedupe(paths: list[Path]) -> list[Path]:
    seen: dict[imagehash.ImageHash, Path] = {}
    kept = []
    for p in paths:
        try:
            h = imagehash.phash(Image.open(p))
        except Exception:
            continue
        if any(h - seen_h <= 4 for seen_h in seen):
            continue
        seen[h] = p
        kept.append(p)
    return kept


def stratified_split(paths: list[Path], rng: random.Random) -> dict[str, list[Path]]:
    shuffled = paths[:]
    rng.shuffle(shuffled)
    n = len(shuffled)
    n_train = int(n * 0.8)
    n_val = int(n * 0.1)
    return {
        "train": shuffled[:n_train],
        "val": shuffled[n_train : n_train + n_val],
        "test": shuffled[n_train + n_val :],
    }


def write_manifest(rows: list[tuple[str, str, str]], out_path: Path) -> None:
    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["path", "label", "split"])
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="../data")
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--augment-per-image", type=int, default=2, help="extra augmented copies per train image")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    data_dir = Path(args.data_dir).resolve()
    raw_dir = data_dir / "raw"
    prepped_dir = data_dir / "prepped"
    prepped_dir.mkdir(parents=True, exist_ok=True)

    rows: list[tuple[str, str, str]] = []
    for cls in CLASSES:
        src_dir = raw_dir / cls
        if not src_dir.exists():
            print(f"[{cls}] no raw images found at {src_dir}, skipping")
            continue
        images = [p for p in src_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        deduped = dedupe(images)
        print(f"[{cls}] {len(images)} raw -> {len(deduped)} after dedupe")

        splits = stratified_split(deduped, rng)
        for split, split_paths in splits.items():
            out_dir = prepped_dir / split / cls
            out_dir.mkdir(parents=True, exist_ok=True)
            for src in split_paths:
                img = Image.open(src).convert("RGB").resize((args.image_size, args.image_size))
                out_path = out_dir / src.name
                img.save(out_path)
                # relative to prepped_dir, not absolute: an absolute path baked in here only
                # works on the machine that ran prep.py, breaking the moment the whole
                # prepped/ folder + manifest.csv get zipped and moved elsewhere (e.g. Colab).
                # .as_posix() (not str()) so it's forward-slash on every OS -- a Windows-style
                # backslash path is read back as one bogus path component on Linux.
                rows.append((out_path.relative_to(prepped_dir).as_posix(), cls, split))

                if split == "train":
                    for i in range(args.augment_per_image):
                        aug = augment_image(img, rng)
                        aug_path = out_dir / f"aug{i}_{src.name}"
                        aug.save(aug_path)
                        rows.append((aug_path.relative_to(prepped_dir).as_posix(), cls, split))

    write_manifest(rows, prepped_dir / "manifest.csv")
    print(f"\nWrote {len(rows)} rows to {prepped_dir / 'manifest.csv'}")


if __name__ == "__main__":
    main()
