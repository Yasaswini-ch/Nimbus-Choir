"""Static config for the tension predictor: locations, date range, label thresholds."""

from datetime import date, timedelta

# ~40 points spread across continents and climate zones (tropical, arid, temperate,
# continental, polar, maritime) so the model sees diverse pressure/cloud regimes.
# Not fetched dynamically -- a fixed, documented sample.
LOCATIONS = [
    ("Reykjavik", 64.15, -21.94), ("Oslo", 59.91, 10.75), ("London", 51.51, -0.13),
    ("Berlin", 52.52, 13.41), ("Moscow", 55.76, 37.62), ("Istanbul", 41.01, 28.98),
    ("Cairo", 30.04, 31.24), ("Nairobi", -1.29, 36.82), ("Lagos", 6.52, 3.38),
    ("Cape Town", -33.92, 18.42), ("Marrakesh", 31.63, -7.99), ("Dubai", 25.20, 55.27),
    ("Mumbai", 19.08, 72.88), ("New Delhi", 28.61, 77.21), ("Bangkok", 13.76, 100.50),
    ("Singapore", 1.35, 103.82), ("Jakarta", -6.21, 106.85), ("Manila", 14.60, 120.98),
    ("Tokyo", 35.68, 139.69), ("Seoul", 37.57, 126.98), ("Beijing", 39.90, 116.41),
    ("Shanghai", 31.23, 121.47), ("Ulaanbaatar", 47.89, 106.91), ("Perth", -31.95, 115.86),
    ("Sydney", -33.87, 151.21), ("Auckland", -36.85, 174.76), ("Honolulu", 21.31, -157.86),
    ("Anchorage", 61.22, -149.90), ("Vancouver", 49.28, -123.12), ("Denver", 39.74, -104.99),
    ("Chicago", 41.88, -87.63), ("New York", 40.71, -74.01), ("Miami", 25.76, -80.19),
    ("Mexico City", 19.43, -99.13), ("Bogota", 4.71, -74.07), ("Lima", -12.05, -77.04),
    ("Sao Paulo", -23.55, -46.63), ("Buenos Aires", -34.60, -58.38), ("Ushuaia", -54.80, -68.30),
    ("Reunion", -21.12, 55.54),
]

END_DATE = date.today() - timedelta(days=7)  # archive data lags a few days behind real-time
START_DATE = END_DATE - timedelta(days=365 * 2 + 180)  # ~2.5 years

HOURLY_VARS = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "pressure_msl",
    "relative_humidity_2m",
    "precipitation",
]

PRESSURE_DROP_THRESHOLD_HPA = 3.0
LABEL_HORIZON_HOURS = 6
PRESSURE_TREND_WINDOW_HOURS = 3

BALANCED_DATASET_SIZE = 3000
HELD_OUT_LOCATION_FRACTION = 0.15  # held out by location, not by row
