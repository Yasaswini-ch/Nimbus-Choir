"""Shared feature logic between build_dataset.py (training) and predict.py
(runtime). Keeping this in one module guarantees the live camera-to-feature
mapping matches exactly what the model was trained on.

The runtime app only ever sees camera-detected cloud types, never the
reanalysis cloud-cover-by-altitude bands TabPFN was trained on, so this
mapping is an approximation documented here rather than hidden in code:
  - cirrus (high, wispy)          -> high cloud cover
  - cumulus / stratus (low)       -> low cloud cover
  - cumulonimbus (towers through
    the whole column)             -> high + mid + low cloud cover

This is a coarse proxy, not a real measurement: a sky with one cirrus patch
isn't the same as a sky where every reanalysis grid cell at that location
reports 80% high cloud. Treat tension as a mood dial, not a forecast.
"""

FEATURE_COLUMNS = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "pressure_msl",
    "relative_humidity_2m",
    "pressure_trend_3h",
]


def pressure_trend_3h(pressure_now: float, pressure_3h_ago: float) -> float:
    return pressure_now - pressure_3h_ago


def camera_summary_to_cloud_cover(camera_summary: dict) -> dict:
    """camera_summary: {"cirrus": frac, "cumulus": frac, "stratus": frac,
    "cumulonimbus": frac} -- each the fraction of the sky mask that type
    covers (0-1), e.g. from the web pipeline's per-track `area` summed by type.
    Returns estimated {cloud_cover, cloud_cover_low, cloud_cover_mid, cloud_cover_high} in 0-100 (%).
    """
    cirrus = camera_summary.get("cirrus", 0.0)
    cumulus = camera_summary.get("cumulus", 0.0)
    stratus = camera_summary.get("stratus", 0.0)
    cb = camera_summary.get("cumulonimbus", 0.0)

    low = cumulus + stratus + cb
    mid = cb * 0.6
    high = cirrus + cb * 0.6
    total = min(1.0, cirrus + cumulus + stratus + cb)

    return {
        "cloud_cover": total * 100,
        "cloud_cover_low": min(1.0, low) * 100,
        "cloud_cover_mid": min(1.0, mid) * 100,
        "cloud_cover_high": min(1.0, high) * 100,
    }


def build_feature_row(camera_summary: dict, weather: dict) -> dict:
    """weather: {"pressure_msl": float, "pressure_3h_ago": float, "relative_humidity_2m": float}."""
    cover = camera_summary_to_cloud_cover(camera_summary)
    return {
        **cover,
        "pressure_msl": weather["pressure_msl"],
        "relative_humidity_2m": weather["relative_humidity_2m"],
        "pressure_trend_3h": pressure_trend_3h(weather["pressure_msl"], weather["pressure_3h_ago"]),
    }
