# firmware

Optional. The app works fully without this. An ESP32 + BME280 node that
reads temperature/humidity/pressure every 30s, keeps a 3-hour pressure
trend in RTC memory (survives deep sleep, unlike normal RAM), and reports
each reading as a JSON line -- always over serial, and optionally over
Wi-Fi (rate-limited to every `WIFI_POST_EVERY_N_READS`-th wake) to the
`/server` `/sensor` endpoint.

## Build
```
pip install platformio
cp include/secrets.h.example include/secrets.h   # fill in Wi-Fi + server URL
pio run                 # compile
pio run -t upload       # flash
pio device monitor      # watch serial output
```

## Wiring & calibration
See `WIRING.md` (BME280 -> ESP32 I2C pins) and `CALIBRATION.md`
(one-time sea-level-pressure offset).

## Reading the data
- **Serial (always on, required):** `/server/sensor_logger.py --port COM3`
  tails the serial port and logs every reading to SQLite.
- **Wi-Fi (optional):** `/server/app.py`'s `POST /sensor` endpoint, same
  SQLite database, so both transports converge on one store.

## Tunables
Every tunable (read interval, ring buffer size, Wi-Fi post frequency,
timeouts, calibration offset) lives in `include/config.h`.
