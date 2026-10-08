# server

FastAPI backend: `POST /predict` (the `/forecast` tension model),
`POST /sensor` (the optional `/firmware` node's Wi-Fi path), `/narrate`
and `/narrate/speech` (the sky narrator), and `/earth/*` (Earth mode's
NASA GIBS satellite tile proxy, Prompt 9).

## /predict
Takes a camera cloud-type summary (`{cirrus, cumulus, stratus, cumulonimbus}`,
each 0-1) and a lat/lon (coarse-rounded to 0.5° before use or storage --
exact GPS never leaves the client), fetches current pressure/trend/humidity
from Open-Meteo's forecast API server-side, and returns `{"tension": 0-1}`
from `/forecast`'s trained TabPFN model. Returns 503 if the model hasn't
been trained yet (`forecast/train.py`), 502 if the weather lookup fails.

`/web/src/main.js` calls this every few minutes while the app is running,
falling back to a local JS rule (`/web/src/forecast/fallback.js`) if it's
unreachable, so the app still gets *some* tension signal offline.

## /sensor
Takes one `/firmware` reading (`temp_c`, `humidity`, `pressure_hpa`,
`pressure_trend_3h`, `wake_count`) and appends it to SQLite via `db.py` --
the same store `sensor_logger.py` (the serial-reading path) writes to, so
it doesn't matter which transport actually got through.

## /narrate and /narrate/speech
`/narrate` sends the camera cloud-type summary and tension to a local Gemma
model (via Ollama) and returns one or two playful caption lines
(`narrator.py`). `/narrate/speech` turns that caption into audio using
Piper (`tts.py`), an open-weight, fully offline TTS -- no API key, no
network call, consistent with the project's "no data leaves the device"
constraint. Returns 503 if no Piper voice model is installed; the web app
falls back to the browser's own `speechSynthesis` when either endpoint is
unreachable.

Download a voice model once:
```
python -m piper.download_voices en_US-lessac-medium
```
It's saved under `server/models/` by default; point `PIPER_MODEL_PATH` at a
different `.onnx` file to use another voice.

## /earth/* (Earth mode, Prompt 9)
A satellite-imagery alternative to the sky camera, using NASA GIBS
(`gibs.py`) -- **this is the one part of the app that uses the network**,
and the web UI must show it clearly as online.

**Layers and satellites.** Confirmed directly against GIBS's live WMTS
`GetCapabilities` document (not guessed -- re-check there if a layer ever
404s, GIBS does retire/rename them):
| satellite | covers | visible layer | IR layer |
|---|---|---|---|
| GOES-East | Americas, Atlantic | `GOES-East_ABI_Band2_Red_Visible_1km_v0_NRT` | `GOES-East_ABI_Band13_Clean_Infrared_v0_NRT` |
| GOES-West | Pacific, western Americas | `GOES-West_ABI_Band2_Red_Visible_1km_v0_NRT` | `GOES-West_ABI_Band13_Clean_Infrared_v0_NRT` |
| Himawari-8 | Asia-Pacific, Australia | `Himawari_AHI_Band3_Red_Visible_1km_v0_NRT` | `Himawari_AHI_Band13_Clean_Infrared_v0_NRT` |

Both bands are served at 10-minute cadence with real gaps (missed scans
aren't backfilled -- `list_frame_times` returns exactly what GIBS reports,
never interpolates). No API key is required.

**Coverage is geostationary-only.** There is no NASA GIBS geostationary
satellite over Europe, Africa, or the Atlantic/Indian Ocean gap between
GOES-West and Himawari-8, so `REGIONS` in `gibs.py` only offers five named
regions within real coverage (US East/West Coast, Hawaii/Central Pacific,
Japan/East Asia, Australia) -- not offering a region *is* the honest
answer for "no coverage" here. The Prompt 9 spec's sparse-coverage case is
about polar orbiters; none of these three satellites are polar, so cadence
is steady everywhere they do cover.

**Regions are coarse and named, never GPS.** The client sends a region id
like `us-east`; `gibs.py` resolves that to a fixed lat/lon internally and
computes a 2x2 tile grid around it via standard Web Mercator tile math
(`latlon_to_tile`). No coordinates ever come from the client's device.

**The clean-infrared layer is colorized, not raw temperature.** GIBS
serves it through NASA's own "Clean Longwave Infrared Window" colormap
baked into the PNG pixels, not a linear grayscale-to-Kelvin encoding. The
web app reads overall pixel brightness as a colder-top proxy (brighter
pixel ≈ colder cloud top in this colormap's convention), which is
directionally right but not a radiance decode -- treat satellite-mode
pitch the same way `/forecast` asks you to treat tension: a mood dial,
not an instrument reading.

**Endpoints:**
- `GET /earth/regions` -- the five region ids/labels above.
- `GET /earth/frames/{region_id}?frame_count=8` -- that region's tile
  grid plus the last `frame_count` valid NRT timestamps, for the time-lapse
  loop.
- `GET /earth/tile/{satellite}/{visible|ir}/{time}/{z}/{x}/{y}.{ext}` --
  proxies and caches (10 min TTL, 500-entry cap) one GIBS tile. Returns 404
  if GIBS has no tile at that position (edge of the satellite's disk) --
  expected at some grid corners, not an error.

**`upwind_cloud_cover`:** `/predict` accepts this optional 0-1 field (mean
visible-band brightness over the Earth-mode tile grid, computed client-side)
and threads it through to `predict_tension()`. It is *not* in
`forecast/features.py`'s `FEATURE_COLUMNS` yet, so the trained model
currently ignores it -- the field is wired end-to-end but inert until
`forecast/train.py` is extended to train on a dataset that includes it.

## Run
```
pip install -r requirements.txt
uvicorn app:app --reload
```

## Tests
```
pytest
```

## Log the optional sensor node over serial
```
python sensor_logger.py --port COM3
```
