# Wiring

BME280 breakout (I2C) to a generic ESP32 dev board. Pin numbers match
`include/config.h`'s defaults (GPIO21/22) -- **confirm against your specific
board's silkscreen**, ESP32 dev board pinouts vary between manufacturers.

```
   BME280                      ESP32 dev board
  +--------+                  +------------------+
  |    VIN |------------------| 3V3              |
  |    GND |------------------| GND              |
  |    SCL |------------------| GPIO22 (I2C SCL)  |
  |    SDA |------------------| GPIO21 (I2C SDA)  |
  +--------+                  +------------------+
```

- Power the BME280 from **3.3V**, not 5V -- most breakout boards are 3.3V
  logic and some don't have an onboard regulator.
- If your breakout's I2C address is `0x77` instead of `0x76` (check its
  datasheet / the address your board's SDO pin is wired to), change
  `BME280_I2C_ADDRESS` in `include/config.h`.
- No pull-up resistors needed -- most BME280 breakouts and the ESP32's
  internal I2C pins already have them.
