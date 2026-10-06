"""SQLite storage for the firmware sensor node's readings, shared by
sensor_logger.py (serial) and app.py's /sensor endpoint (Wi-Fi)."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "sensor_readings.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    temp_c REAL,
    humidity REAL,
    pressure_hpa REAL,
    pressure_trend_3h REAL,
    wake_count INTEGER
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


def insert_reading(conn: sqlite3.Connection, reading: dict) -> None:
    conn.execute(
        "INSERT INTO readings (temp_c, humidity, pressure_hpa, pressure_trend_3h, wake_count) "
        "VALUES (:temp_c, :humidity, :pressure_hpa, :pressure_trend_3h, :wake_count)",
        {
            "temp_c": reading.get("temp_c"),
            "humidity": reading.get("humidity"),
            "pressure_hpa": reading.get("pressure_hpa"),
            "pressure_trend_3h": reading.get("pressure_trend_3h"),
            "wake_count": reading.get("wake_count"),
        },
    )
    conn.commit()
