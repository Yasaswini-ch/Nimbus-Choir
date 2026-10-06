# Calibration

BME280 pressure sensors vary unit-to-unit (datasheet accuracy is roughly
±1 hPa) and a raw reading isn't automatically "sea-level pressure" (QNH) --
the value `/forecast` and most weather services actually use. Two things to
account for before trusting a reading:

1. **Altitude.** A raw barometric reading drops with elevation (~1 hPa per
   8-10m near sea level). If you're not at sea level, the raw reading isn't
   directly comparable to `pressure_msl` from Open-Meteo/METAR without an
   altitude correction.
2. **Sensor-to-sensor offset.** Even two BME280 units side by side can read
   a few tenths of an hPa apart.

## One-time calibration
1. Find your nearest official station's current QNH/sea-level pressure
   (a METAR for a nearby airport, or a local weather service page).
2. Power on the node and read its raw `pressure_hpa` from the serial output
   at the same moment.
3. `SEA_LEVEL_PRESSURE_OFFSET_HPA = official_QNH - raw_reading` in
   `include/config.h`, then reflash.

This is a one-point calibration (good enough for a mood-dial project, not
metrology-grade) -- redo it if you move the node to a different altitude.
