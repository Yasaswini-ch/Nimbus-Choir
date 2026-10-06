#include <Adafruit_BME280.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_sleep.h>

#include "config.h"
#include "secrets.h"

// RTC memory survives deep sleep (normal RAM does not), so the 3h pressure
// ring buffer has to live here, not as a plain global.
RTC_DATA_ATTR float pressureRing[RING_BUFFER_SIZE];
RTC_DATA_ATTR int ringIndex = 0;
RTC_DATA_ATTR int ringCount = 0;
RTC_DATA_ATTR unsigned long wakeCount = 0;

Adafruit_BME280 bme;

float pushPressureAndGetTrend(float pressureHpa) {
  // The sample RING_BUFFER_SIZE reads ago is "3 hours ago"; until the ring
  // has filled once, there isn't enough history yet.
  float trend = NAN;
  if (ringCount >= RING_BUFFER_SIZE) {
    float oldest = pressureRing[ringIndex]; // about to be overwritten
    trend = pressureHpa - oldest;
  }
  pressureRing[ringIndex] = pressureHpa;
  ringIndex = (ringIndex + 1) % RING_BUFFER_SIZE;
  if (ringCount < RING_BUFFER_SIZE) ringCount++;
  return trend;
}

String buildReadingJson(float tempC, float humidity, float pressureHpa, float trend3h) {
  JsonDocument doc;
  doc["temp_c"] = tempC;
  doc["humidity"] = humidity;
  doc["pressure_hpa"] = pressureHpa;
  if (isnan(trend3h)) {
    doc["pressure_trend_3h"] = nullptr;
  } else {
    doc["pressure_trend_3h"] = trend3h;
  }
  doc["wake_count"] = wakeCount;
  String out;
  serializeJson(doc, out);
  return out;
}

void maybePostOverWifi(const String &json) {
  if (wakeCount % WIFI_POST_EVERY_N_READS != 0) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("{\"wifi_error\":\"connect timeout\"}");
    WiFi.mode(WIFI_OFF);
    return;
  }

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  int status = http.POST(json);
  if (status < 200 || status >= 300) {
    Serial.printf("{\"wifi_error\":\"post failed, status=%d\"}\n", status);
  }
  http.end();
  WiFi.mode(WIFI_OFF);
}

void setup() {
  Serial.begin(115200);
  delay(100); // let the serial monitor attach after deep-sleep wake

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!bme.begin(BME280_I2C_ADDRESS)) {
    Serial.println("{\"error\":\"BME280 not found -- check wiring and I2C address\"}");
    esp_sleep_enable_timer_wakeup((uint64_t)READ_INTERVAL_SECONDS * 1000000ULL);
    esp_deep_sleep_start();
    return;
  }

  float tempC = bme.readTemperature();
  float humidity = bme.readHumidity();
  float pressureHpa = bme.readPressure() / 100.0f + SEA_LEVEL_PRESSURE_OFFSET_HPA;

  float trend3h = pushPressureAndGetTrend(pressureHpa);
  String json = buildReadingJson(tempC, humidity, pressureHpa, trend3h);

  Serial.println(json); // primary transport -- always sent

  maybePostOverWifi(json); // optional, rate-limited, short-timeout

  wakeCount++;
  esp_sleep_enable_timer_wakeup((uint64_t)READ_INTERVAL_SECONDS * 1000000ULL);
  esp_deep_sleep_start(); // low-power sleep; execution resumes at setup() on wake
}

void loop() {
  // Never reached: esp_deep_sleep_start() in setup() does not return.
}
