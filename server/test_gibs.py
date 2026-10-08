import xml.etree.ElementTree as ET

import gibs


def test_latlon_to_tile_known_values():
    # zoom 0: whole world is one tile
    assert gibs.latlon_to_tile(0, 0, 0) == (0, 0)
    # equator/prime-meridian at zoom 2 should land in the middle of a 4x4 grid
    x, y = gibs.latlon_to_tile(0, 0, 2)
    assert (x, y) == (2, 2)
    # clamps out-of-range longitude instead of raising
    x, y = gibs.latlon_to_tile(0, 179.9, 2)
    assert 0 <= x < 4


def test_region_tile_grid_shape_and_bounds():
    for region_id, region in gibs.REGIONS.items():
        tiles = gibs.region_tile_grid(region_id)
        assert len(tiles) == gibs.GRID_SIZE * gibs.GRID_SIZE
        n = 2 ** region["zoom"]
        for t in tiles:
            assert 0 <= t["x"] < n
            assert 0 <= t["y"] < n


def test_parse_time_values_single_range():
    xml = f"""<Layer xmlns="{gibs.WMTS_NS[1:-1]}" xmlns:ows="{gibs.OWS_NS[1:-1]}">
      <Dimension><ows:Identifier>Time</ows:Identifier><UOM>ISO8601</UOM>
        <Value>2026-01-01T00:00:00Z/2026-01-01T00:30:00Z/PT10M</Value>
      </Dimension>
    </Layer>"""
    layer_el = ET.fromstring(xml)
    times = gibs._parse_time_values(layer_el)
    assert times == [
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:10:00Z",
        "2026-01-01T00:20:00Z",
        "2026-01-01T00:30:00Z",
    ]


def test_parse_time_values_multiple_ranges_with_gaps():
    xml = f"""<Layer xmlns="{gibs.WMTS_NS[1:-1]}" xmlns:ows="{gibs.OWS_NS[1:-1]}">
      <Dimension><ows:Identifier>Time</ows:Identifier><UOM>ISO8601</UOM>
        <Value>2026-01-01T00:00:00Z/2026-01-01T00:10:00Z/PT10M</Value>
        <Value>2026-01-01T01:00:00Z/2026-01-01T01:10:00Z/PT10M</Value>
      </Dimension>
    </Layer>"""
    layer_el = ET.fromstring(xml)
    times = gibs._parse_time_values(layer_el)
    # the gap between 00:10 and 01:00 (a real missed-scan gap) must not be filled in
    assert times == [
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:10:00Z",
        "2026-01-01T01:00:00Z",
        "2026-01-01T01:10:00Z",
    ]


def test_parse_time_values_no_dimension_returns_empty():
    layer_el = ET.fromstring(f'<Layer xmlns="{gibs.WMTS_NS[1:-1]}"/>')
    assert gibs._parse_time_values(layer_el) == []
