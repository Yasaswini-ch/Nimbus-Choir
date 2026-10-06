"""Reads JSON lines off the firmware node's serial port and appends each
reading to SQLite. This is the primary ingestion path -- the firmware
always sends over serial, Wi-Fi (app.py's /sensor) is the optional bonus.

Usage:
    python sensor_logger.py --port COM3
    python sensor_logger.py --port /dev/ttyUSB0 --baud 115200
"""

import argparse
import json

import serial

from db import get_connection, insert_reading


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="e.g. COM3 or /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    conn = get_connection()
    print(f"Listening on {args.port} @ {args.baud} baud. Ctrl-C to stop.")

    with serial.Serial(args.port, args.baud, timeout=5) as ser:
        while True:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                reading = json.loads(line)
            except json.JSONDecodeError:
                print(f"[skip] not JSON: {line!r}")
                continue

            if "error" in reading or "wifi_error" in reading:
                print(f"[device] {line}")
                continue

            insert_reading(conn, reading)
            print(f"[logged] {reading}")


if __name__ == "__main__":
    main()
