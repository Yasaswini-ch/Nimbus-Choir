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

## Run
```
pip install -r requirements.txt
uvicorn app:app --reload
```

## Log the optional sensor node over serial
```
python sensor_logger.py --port COM3
```
