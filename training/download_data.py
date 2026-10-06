"""Fetch the public CCSN (and optionally SWIMSEG) cloud datasets, merge any
user-supplied /data/extra/<label>/ folders, and lay everything out as
/data/raw/<class>/*.jpg using the CLASSES in common/labels.py.

Usage:
    python download_data.py --dry-run
    python download_data.py --data-dir ../data
"""

import argparse
import shutil
import zipfile
from pathlib import Path

import requests

from common.labels import CCSN_MISSING_CLASSES, CCSN_TO_FIVE, CLASSES

HEADERS = {"User-Agent": "nimbus-choir/0.1 (+https://github.com/; dataset-fetch-script)"}

CCSN_DOI = "10.7910/DVN/CADDPD"
CCSN_API = f"https://dataverse.harvard.edu/api/access/dataset/:persistentId/?persistentId=doi:{CCSN_DOI}"
CCSN_METADATA_API = f"https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:{CCSN_DOI}"


def print_license(name: str, metadata_url: str) -> None:
    print(f"\n[{name}] checking license/terms at {metadata_url}")
    try:
        resp = requests.get(metadata_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        terms = (
            data.get("data", {})
            .get("latestVersion", {})
            .get("termsOfUse")
            or data.get("data", {}).get("license")
            or "not stated in metadata -- check the dataset page manually"
        )
        print(f"[{name}] license/terms: {terms}")
        lowered = str(terms).lower()
        if "non-commercial" in lowered or "no redistribution" in lowered or "restricted" in lowered:
            print(f"[{name}] WARNING: terms may restrict redistribution -- do not bundle raw data in the repo.")
    except requests.RequestException as exc:
        print(f"[{name}] could not fetch metadata ({exc}); check the dataset page manually before using it.")


def fetch_ccsn(dest: Path, dry_run: bool) -> Path:
    print_license("CCSN", CCSN_METADATA_API)
    out_dir = dest / "ccsn_raw"
    if dry_run:
        print(f"[dry-run] would download CCSN zip from {CCSN_API} into {out_dir}")
        return out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest / "ccsn.zip"
    print(f"[CCSN] downloading to {zip_path} ...")
    with requests.get(CCSN_API, headers=HEADERS, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    print(f"[CCSN] extracting into {out_dir} ...")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(out_dir)
    zip_path.unlink()
    return out_dir


def map_ccsn_into_classes(ccsn_dir: Path, raw_dir: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] would map CCSN genus folders under {ccsn_dir} into {raw_dir}/<class>/")
        return
    genus_dirs = {p.name: p for p in ccsn_dir.rglob("*") if p.is_dir() and p.name in CCSN_TO_FIVE}
    if not genus_dirs:
        print(f"[CCSN] no recognizable genus folders found under {ccsn_dir}; check the archive layout.")
        return
    for genus, src_dir in genus_dirs.items():
        target_class = CCSN_TO_FIVE[genus]
        out_dir = raw_dir / target_class
        out_dir.mkdir(parents=True, exist_ok=True)
        images = [p for p in src_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        for img in images:
            shutil.copy2(img, out_dir / f"ccsn_{genus}_{img.name}")
        print(f"[CCSN] {genus} -> {target_class}: {len(images)} images")


def merge_extra(data_dir: Path, raw_dir: Path, dry_run: bool) -> None:
    extra_dir = data_dir / "extra"
    if not extra_dir.exists():
        return
    for class_dir in extra_dir.iterdir():
        if not class_dir.is_dir() or class_dir.name not in CLASSES:
            continue
        out_dir = raw_dir / class_dir.name
        images = [p for p in class_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        if dry_run:
            print(f"[dry-run] would merge {len(images)} extra images for class '{class_dir.name}'")
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        for img in images:
            shutil.copy2(img, out_dir / f"extra_{img.name}")
        print(f"[extra] merged {len(images)} images for class '{class_dir.name}'")


def warn_missing_classes(raw_dir: Path, dry_run: bool) -> None:
    for cls in CCSN_MISSING_CLASSES:
        out_dir = raw_dir / cls
        count = len(list(out_dir.glob("*"))) if out_dir.exists() else 0
        if count == 0 and not dry_run:
            print(
                f"\nWARNING: class '{cls}' has 0 images. CCSN has no clear-sky genus; "
                f"supply /data/extra/{cls}/*.jpg (a small public clear-sky set, e.g. cropped from "
                "your own sunny_cumulus test photos' blue-sky regions) before running prep.py."
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="../data", help="Repo /data directory")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    raw_dir = data_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    ccsn_dir = fetch_ccsn(data_dir, args.dry_run)
    map_ccsn_into_classes(ccsn_dir, raw_dir, args.dry_run)
    merge_extra(data_dir, raw_dir, args.dry_run)
    warn_missing_classes(raw_dir, args.dry_run)

    print("\nNote: SWIMSEG is a sky/cloud *segmentation* dataset (pixel masks, not genus labels); "
          "it isn't merged here since this script builds a classification set. Revisit if a "
          "segmentation-derived signal turns out useful for the classifier.")


if __name__ == "__main__":
    main()
