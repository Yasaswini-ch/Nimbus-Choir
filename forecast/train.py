"""Fit TabPFN on the balanced dataset, evaluate held-out-by-location, save
the fitted estimator for predict.py.

TabPFN does in-context learning (fit() hands it the context rows rather than
training weights), so "training" here is: 1) fit on most locations, measure
how well it generalizes to locations it's never seen, 2) re-fit on
everything for the model that actually ships.

First run needs a TabPFN login (browser) or TABPFN_TOKEN env var to fetch
the open, non-commercially-licensed model weights -- free, but not something
to run without you knowing it'll prompt for that.

Usage:
    python train.py --dataset data/dataset.csv
"""

import argparse
import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import accuracy_score

from features import FEATURE_COLUMNS


def location_split(df: pd.DataFrame, held_out_fraction: float, seed: int = 0):
    locations = df["location"].unique()
    rng = np.random.default_rng(seed)
    rng.shuffle(locations)
    n_held_out = max(1, int(len(locations) * held_out_fraction))
    held_out_locations = set(locations[:n_held_out])
    held_out = df[df["location"].isin(held_out_locations)]
    fit_rows = df[~df["location"].isin(held_out_locations)]
    return fit_rows, held_out, sorted(held_out_locations)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="data/dataset.csv")
    parser.add_argument("--held-out-fraction", type=float, default=0.15)
    parser.add_argument("--out-dir", default="model")
    args = parser.parse_args()

    from tabpfn import TabPFNClassifier  # imported late so --help works without the dependency installed

    df = pd.read_csv(args.dataset)
    fit_rows, held_out, held_out_locations = location_split(df, args.held_out_fraction)
    print(f"fit on {fit_rows['location'].nunique()} locations ({len(fit_rows)} rows), "
          f"held out {len(held_out_locations)} locations ({len(held_out)} rows): {held_out_locations}")

    clf = TabPFNClassifier()
    clf.fit(fit_rows[FEATURE_COLUMNS], fit_rows["label"])

    probs = clf.predict_proba(held_out[FEATURE_COLUMNS])[:, 1]
    preds = (probs >= 0.5).astype(int)
    acc = accuracy_score(held_out["label"], preds)
    print(f"held-out-by-location accuracy: {acc:.3f}")

    frac_pos, mean_pred = calibration_curve(held_out["label"], probs, n_bins=10)
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], "--", color="gray", label="perfectly calibrated")
    ax.plot(mean_pred, frac_pos, marker="o", label="TabPFN")
    ax.set_xlabel("mean predicted probability")
    ax.set_ylabel("fraction positive")
    ax.set_title(f"Calibration (held-out-by-location acc={acc:.3f})")
    ax.legend()
    fig.tight_layout()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_dir / "calibration.png")
    print(f"Saved calibration plot to {out_dir / 'calibration.png'}")

    # Re-fit on everything for the model that actually ships.
    clf_final = TabPFNClassifier()
    clf_final.fit(df[FEATURE_COLUMNS], df["label"])
    joblib.dump(clf_final, out_dir / "tension_classifier.joblib")
    print(f"Saved deployed model to {out_dir / 'tension_classifier.joblib'}")

    (out_dir / "metrics.json").write_text(json.dumps({
        "held_out_accuracy": acc,
        "held_out_locations": held_out_locations,
        "n_fit_rows": len(fit_rows),
        "n_held_out_rows": len(held_out),
    }, indent=2))


if __name__ == "__main__":
    main()
