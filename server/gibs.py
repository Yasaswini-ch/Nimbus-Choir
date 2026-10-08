"""NASA GIBS (Global Imagery Browse Services) proxy for Earth mode: fetches
and caches geostationary satellite tiles. No API key. Tile URLs, layer IDs
and TileMatrixSets below were confirmed directly against GIBS's live WMTS
GetCapabilities document (https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/
1.0.0/WMTSCapabilities.xml), not guessed -- re-verify there if a layer ever
404s, since GIBS does retire/rename layers.

Coverage is geostationary-only: the Americas (GOES-East/West) and the
Asia-Pacific (Himawari-8). There is no NASA GIBS geostationary coverage of
Europe, Africa, or the Atlantic/Indian Ocean gap between satellites --
regions outside REGIONS simply aren't offered, which is itself the honest
answer for "sparse/no coverage" here (the Prompt 9 spec's sparse-coverage
case is about polar orbiters; none of these three satellites are polar, so
cadence is a steady 10 minutes everywhere they do cover).
"""

import math
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import requests

GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt"
CAPABILITIES_URL = f"{GIBS_BASE}/1.0.0/WMTSCapabilities.xml"
CAPABILITIES_TTL_SECONDS = 600  # GIBS updates every ~10 min; no point polling faster
TILE_CACHE_TTL_SECONDS = 600
TILE_CACHE_MAX_ENTRIES = 500
WMTS_NS = "{http://www.opengis.net/wmts/1.0}"
OWS_NS = "{http://www.opengis.net/ows/1.1}"


@dataclass(frozen=True)
class Layer:
    id: str
    tile_matrix_set: str
    format: str  # file extension GIBS serves this layer as


SATELLITES = {
    "goes-east": {
        "label": "GOES-East (Americas, Atlantic)",
        "visible": Layer("GOES-East_ABI_Band2_Red_Visible_1km_v0_NRT", "GoogleMapsCompatible_Level7", "png"),
        "ir": Layer("GOES-East_ABI_Band13_Clean_Infrared_v0_NRT", "GoogleMapsCompatible_Level6", "png"),
    },
    "goes-west": {
        "label": "GOES-West (Pacific, western Americas)",
        "visible": Layer("GOES-West_ABI_Band2_Red_Visible_1km_v0_NRT", "GoogleMapsCompatible_Level7", "png"),
        "ir": Layer("GOES-West_ABI_Band13_Clean_Infrared_v0_NRT", "GoogleMapsCompatible_Level6", "png"),
    },
    "himawari": {
        "label": "Himawari-8 (Asia-Pacific, Australia)",
        "visible": Layer("Himawari_AHI_Band3_Red_Visible_1km_v0_NRT", "GoogleMapsCompatible_Level7", "png"),
        "ir": Layer("Himawari_AHI_Band13_Clean_Infrared_v0_NRT", "GoogleMapsCompatible_Level6", "png"),
    },
}

# Coarse named regions, never exact GPS. lat/lon here only pick a tile grid
# server-side -- the client only ever sends a region id.
REGIONS = {
    "us-east": {"label": "US East Coast", "lat": 38.0, "lon": -78.0, "satellite": "goes-east", "zoom": 4},
    "us-west": {"label": "US West Coast", "lat": 37.0, "lon": -121.0, "satellite": "goes-west", "zoom": 4},
    "central-pacific": {"label": "Hawaii / Central Pacific", "lat": 20.0, "lon": -157.0, "satellite": "goes-west", "zoom": 4},
    "east-asia": {"label": "Japan / East Asia", "lat": 36.0, "lon": 138.0, "satellite": "himawari", "zoom": 4},
    "australia": {"label": "Australia", "lat": -25.0, "lon": 134.0, "satellite": "himawari", "zoom": 4},
}

GRID_SIZE = 2  # NxN tile grid per frame, centered on the region


def latlon_to_tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    """Standard Web Mercator slippy-map tile index for (lat, lon) at `zoom`."""
    lat_rad = math.radians(lat)
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def region_tile_grid(region_id: str) -> list[dict]:
    """GRID_SIZE x GRID_SIZE tile indices centered on the region, clamped to the valid range."""
    region = REGIONS[region_id]
    zoom = region["zoom"]
    n = 2**zoom
    cx, cy = latlon_to_tile(region["lat"], region["lon"], zoom)
    half = GRID_SIZE // 2
    tiles = []
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            x = max(0, min(n - 1, cx - half + col))
            y = max(0, min(n - 1, cy - half + row))
            tiles.append({"z": zoom, "x": x, "y": y, "row": row, "col": col})
    return tiles


_capabilities_cache: dict[str, tuple[float, str]] = {}  # satellite -> (fetched_at, xml_text)


def _fetch_capabilities_xml(timeout: int = 15) -> str:
    """The NRT WMTS capabilities document covers all satellites/layers at once."""
    now = time.monotonic()
    cached = _capabilities_cache.get("nrt")
    if cached and now - cached[0] < CAPABILITIES_TTL_SECONDS:
        return cached[1]
    resp = requests.get(CAPABILITIES_URL, timeout=timeout)
    resp.raise_for_status()
    _capabilities_cache["nrt"] = (now, resp.text)
    return resp.text


def _parse_time_values(layer_el: ET.Element) -> list[str]:
    """Flattens a WMTS Time Dimension's <Value>start/end/PT10M</Value> ranges
    into individual ISO8601 instants, in document order (oldest first)."""
    instants: list[str] = []
    dimension = layer_el.find(f"{WMTS_NS}Dimension")
    if dimension is None:
        return instants
    for value_el in dimension.findall(f"{WMTS_NS}Value"):
        text = (value_el.text or "").strip()
        parts = text.split("/")
        if len(parts) != 3:
            continue
        start, end, period = parts
        if not period.startswith("PT") or not period.endswith("M"):
            continue
        step_minutes = int(period[2:-1])
        from datetime import datetime, timedelta, timezone

        t = datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        t_end = datetime.strptime(end, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        while t <= t_end:
            instants.append(t.strftime("%Y-%m-%dT%H:%M:%SZ"))
            t += timedelta(minutes=step_minutes)
    return instants


def list_frame_times(layer_id: str, count: int = 8) -> list[str]:
    """Last `count` valid NRT timestamps for a layer, oldest first (so the
    client can play them forward as a time-lapse). Raises requests.RequestException
    if GIBS is unreachable."""
    xml_text = _fetch_capabilities_xml()
    root = ET.fromstring(xml_text)
    for layer_el in root.iter(f"{WMTS_NS}Layer"):
        identifier = layer_el.find(f"{OWS_NS}Identifier")
        if identifier is not None and identifier.text == layer_id:
            times = _parse_time_values(layer_el)
            return times[-count:]
    return []


_tile_cache: dict[tuple, tuple[float, bytes, str]] = {}  # key -> (fetched_at, bytes, content_type)


def fetch_tile(satellite: str, band: str, time_str: str, z: int, x: int, y: int, timeout: int = 15):
    """band: 'visible' or 'ir'. Returns (bytes, content_type), or (None, None)
    if GIBS has no tile at this position (e.g. edge of the satellite's disk)."""
    layer: Layer = SATELLITES[satellite][band]
    key = (satellite, band, time_str, z, x, y)
    now = time.monotonic()

    cached = _tile_cache.get(key)
    if cached and now - cached[0] < TILE_CACHE_TTL_SECONDS:
        return cached[1], cached[2]

    url = (
        f"{GIBS_BASE}/{layer.id}/default/{time_str}/{layer.tile_matrix_set}/{z}/{y}/{x}.{layer.format}"
    )
    resp = requests.get(url, timeout=timeout)
    if resp.status_code == 404:
        return None, None
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", f"image/{layer.format}")
    if len(_tile_cache) >= TILE_CACHE_MAX_ENTRIES:
        oldest_key = min(_tile_cache, key=lambda k: _tile_cache[k][0])
        del _tile_cache[oldest_key]
    _tile_cache[key] = (now, resp.content, content_type)
    return resp.content, content_type
