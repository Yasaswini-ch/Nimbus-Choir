# server

FastAPI backend. Currently: `POST /predict` (the `/forecast` tension model).
Later (Prompts 5/9): proxies/caches NASA GIBS tiles for Earth mode, and logs
optional firmware sensor readings to SQLite.

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

## Run
```
pip install -r requirements.txt
uvicorn app:app --reload
```
