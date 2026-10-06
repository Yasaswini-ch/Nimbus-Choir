"""Loads the trained TabPFN model and exposes predict_tension() for the
FastAPI /predict endpoint, plus a CLI for ad-hoc testing.

Usage:
    python predict.py --cloud-cirrus 0.4 --pressure-msl 1008 --pressure-3h-ago 1012 --humidity 70
"""

import argparse
from pathlib import Path

import joblib
import pandas as pd

from features import FEATURE_COLUMNS, build_feature_row

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "model" / "tension_classifier.joblib"

_model = None


def _load_model(model_path):
    global _model
    if _model is None:
        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"{path} not found -- run train.py first.")
        _model = joblib.load(path)
    return _model


def predict_tension(camera_summary: dict, weather: dict, model_path=DEFAULT_MODEL_PATH) -> float:
    """camera_summary: {"cirrus": frac, "cumulus": frac, "stratus": frac, "cumulonimbus": frac} (0-1 each).
    weather: {"pressure_msl": float, "pressure_3h_ago": float, "relative_humidity_2m": float}.
    Returns a 0-1 tension value."""
    model = _load_model(model_path)
    row = build_feature_row(camera_summary, weather)
    X = pd.DataFrame([row], columns=FEATURE_COLUMNS)
    return float(model.predict_proba(X)[0, 1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cloud-cirrus", type=float, default=0.0)
    parser.add_argument("--cloud-cumulus", type=float, default=0.0)
    parser.add_argument("--cloud-stratus", type=float, default=0.0)
    parser.add_argument("--cloud-cumulonimbus", type=float, default=0.0)
    parser.add_argument("--pressure-msl", type=float, required=True)
    parser.add_argument("--pressure-3h-ago", type=float, required=True)
    parser.add_argument("--humidity", type=float, required=True)
    parser.add_argument("--model-path", default=DEFAULT_MODEL_PATH)
    args = parser.parse_args()

    camera_summary = {
        "cirrus": args.cloud_cirrus,
        "cumulus": args.cloud_cumulus,
        "stratus": args.cloud_stratus,
        "cumulonimbus": args.cloud_cumulonimbus,
    }
    weather = {
        "pressure_msl": args.pressure_msl,
        "pressure_3h_ago": args.pressure_3h_ago,
        "relative_humidity_2m": args.humidity,
    }
    tension = predict_tension(camera_summary, weather, args.model_path)
    print(f"tension: {tension:.3f}")


if __name__ == "__main__":
    main()
