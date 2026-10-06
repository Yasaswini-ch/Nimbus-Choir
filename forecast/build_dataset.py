"""Fetch hourly history for each location from the Open-Meteo historical
archive, compute pressure_trend_3h and the rain-or-pressure-drop label, and
write a balanced, location-tagged CSV for train.py.

Usage:
    python build_dataset.py --dry-run
    python build_dataset.py --out data/dataset.csv
"""

import argparse
import random
from pathlib import Path

import pandas as pd
import requests

from config import (
    BALANCED_DATASET_SIZE,
    END_DATE,
    HOURLY_VARS,
    LABEL_HORIZON_HOURS,
    LOCATIONS,
    PRESSURE_DROP_THRESHOLD_HPA,
    PRESSURE_TREND_WINDOW_HOURS,
    START_DATE,
)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HEADERS = {"User-Agent": "nimbus-choir/0.1 (+https://github.com/; forecast-dataset-script)"}

LICENSE_NOTICE = (
    "Open-Meteo historical archive data is CC BY 4.0 (free to use and redistribute, "
    "including commercially, with attribution). The free API tier itself is restricted "
    "to non-commercial use -- fine for this project, but re-check "
    "https://open-meteo.com/en/terms before any commercial reuse."
)


def fetch_location(name: str, lat: float, lon: float) -> pd.DataFrame:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE.isoformat(),
        "end_date": END_DATE.isoformat(),
        "hourly": ",".join(HOURLY_VARS),
        "timezone": "UTC",
    }
    resp = requests.get(ARCHIVE_URL, params=params, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    df = pd.DataFrame(hourly)
    df["time"] = pd.to_datetime(df["time"])
    df["location"] = name
    df["lat"] = lat
    df["lon"] = lon
    return df


def add_features_and_label(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("time").reset_index(drop=True)
    df["pressure_trend_3h"] = df["pressure_msl"] - df["pressure_msl"].shift(PRESSURE_TREND_WINDOW_HOURS)

    # sum of precipitation over the next LABEL_HORIZON_HOURS hours (t+1 .. t+horizon)
    future_precip = sum(df["precipitation"].shift(-k) for k in range(1, LABEL_HORIZON_HOURS + 1))
    future_pressure_drop = df["pressure_msl"] - df["pressure_msl"].shift(-LABEL_HORIZON_HOURS)

    df["label"] = ((future_precip > 0) | (future_pressure_drop >= PRESSURE_DROP_THRESHOLD_HPA)).astype("Int64")
    return df.dropna(subset=["pressure_trend_3h", "label"])


def balance(df: pd.DataFrame, target_size: int, seed: int = 0) -> pd.DataFrame:
    rng = random.Random(seed)
    pos = df[df["label"] == 1]
    neg = df[df["label"] == 0]
    n_each = min(len(pos), len(neg), target_size // 2)
    pos_sample = pos.sample(n=n_each, random_state=seed)
    neg_sample = neg.sample(n=n_each, random_state=seed)
    out = pd.concat([pos_sample, neg_sample]).sample(frac=1, random_state=seed).reset_index(drop=True)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="data/dataset.csv")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(LICENSE_NOTICE)
    print(f"\n{len(LOCATIONS)} locations, {START_DATE} to {END_DATE} -> {len(LOCATIONS)} archive API calls.")

    if args.dry_run:
        print("[dry-run] would fetch:")
        for name, lat, lon in LOCATIONS:
            print(f"  {name}: {ARCHIVE_URL}?latitude={lat}&longitude={lon}&...")
        return

    frames = []
    for name, lat, lon in LOCATIONS:
        print(f"[fetch] {name} ({lat}, {lon})")
        try:
            raw = fetch_location(name, lat, lon)
        except requests.RequestException as exc:
            print(f"  failed: {exc}, skipping")
            continue
        frames.append(add_features_and_label(raw))

    full = pd.concat(frames, ignore_index=True)
    print(f"\n{len(full)} total labeled hourly rows across {full['location'].nunique()} locations")
    print(f"label balance: {full['label'].value_counts(normalize=True).to_dict()}")

    balanced = balance(full, BALANCED_DATASET_SIZE)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    balanced.to_csv(out_path, index=False)
    print(f"\nWrote {len(balanced)} balanced rows to {out_path}")


if __name__ == "__main__":
    main()
