"""FastAPI backend: serves /predict (the tension model), /sensor (the
optional firmware node's Wi-Fi path), and, later, the Earth-mode tile
proxy (Prompt 9).
"""

import sys
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "forecast"))
from predict import predict_tension  # noqa: E402

from db import get_connection, insert_reading

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
COARSE_ROUNDING = 0.5  # degrees -- never use/forward exact GPS

app = FastAPI(title="Nimbus Choir server")


class CameraSummary(BaseModel):
    cirrus: float = Field(0.0, ge=0, le=1)
    cumulus: float = Field(0.0, ge=0, le=1)
    stratus: float = Field(0.0, ge=0, le=1)
    cumulonimbus: float = Field(0.0, ge=0, le=1)


class PredictRequest(BaseModel):
    camera: CameraSummary
    lat: float
    lon: float


class PredictResponse(BaseModel):
    tension: float


def coarse_round(value: float) -> float:
    return round(value / COARSE_ROUNDING) * COARSE_ROUNDING


def fetch_weather(lat: float, lon: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "pressure_msl,relative_humidity_2m",
        "past_hours": 3,
        "forecast_hours": 1,
        "timezone": "UTC",
    }
    resp = requests.get(FORECAST_URL, params=params, timeout=10)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    pressures = hourly["pressure_msl"]
    humidities = hourly["relative_humidity_2m"]
    if len(pressures) < 4:
        raise ValueError("not enough hourly data returned")
    return {
        "pressure_msl": pressures[-1],
        "pressure_3h_ago": pressures[-4],
        "relative_humidity_2m": humidities[-1],
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    lat, lon = coarse_round(req.lat), coarse_round(req.lon)
    try:
        weather = fetch_weather(lat, lon)
    except (requests.RequestException, ValueError, KeyError) as exc:
        raise HTTPException(status_code=502, detail=f"weather lookup failed: {exc}") from exc

    try:
        tension = predict_tension(req.camera.model_dump(), weather)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return PredictResponse(tension=tension)


class SensorReading(BaseModel):
    temp_c: Optional[float] = None
    humidity: Optional[float] = None
    pressure_hpa: Optional[float] = None
    pressure_trend_3h: Optional[float] = None
    wake_count: Optional[int] = None


_db_conn = None


def _db():
    global _db_conn
    if _db_conn is None:
        _db_conn = get_connection()
    return _db_conn


@app.post("/sensor")
def sensor(reading: SensorReading) -> dict:
    insert_reading(_db(), reading.model_dump())
    return {"status": "ok"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
