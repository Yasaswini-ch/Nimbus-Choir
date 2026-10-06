#pragma once

// Every tunable number for the sensor node, in one place.

constexpr int READ_INTERVAL_SECONDS = 30;

// 3h of history at one sample per READ_INTERVAL_SECONDS.
constexpr int RING_BUFFER_SIZE = (3 * 3600) / READ_INTERVAL_SECONDS; // 360

// I2C pins -- confirm against your specific ESP32 board's silkscreen; these
// are the common defaults (see WIRING.md).
constexpr int I2C_SDA_PIN = 21;
constexpr int I2C_SCL_PIN = 22;
constexpr uint8_t BME280_I2C_ADDRESS = 0x76; // 0x77 on some breakout boards

// Reconnecting Wi-Fi every 30s costs real battery; only attempt a post every
// Nth wake. 1 = every wake, 10 = roughly every 5 minutes.
constexpr int WIFI_POST_EVERY_N_READS = 10;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 8000;
constexpr unsigned long HTTP_TIMEOUT_MS = 5000;

// See CALIBRATION.md -- offset added to every raw pressure reading once
// you've compared this specific sensor against a nearby official QNH.
constexpr float SEA_LEVEL_PRESSURE_OFFSET_HPA = 0.0f;
