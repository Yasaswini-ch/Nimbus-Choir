# server

FastAPI backend. Currently: `POST /predict` (the `/forecast` tension model)
and `POST /sensor` (the optional `/firmware` node's Wi-Fi path). Later
(Prompt 9): proxies/caches NASA GIBS tiles for Earth mode.

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

## Run
```
pip install -r requirements.txt
uvicorn app:app --reload
```

## Log the optional sensor node over serial
```
python sensor_logger.py --port COM3
```
