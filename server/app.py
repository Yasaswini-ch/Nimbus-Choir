"""FastAPI backend: serves /predict (the tension model), /sensor (the
optional firmware node's Wi-Fi path), and /earth/* (Earth mode's NASA GIBS
satellite tile proxy).
"""

import sys
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "forecast"))
from predict import predict_tension  # noqa: E402

import gibs
from db import get_connection, insert_reading
from narrator import narrate
from tts import TTSNotConfigured, synthesize_speech

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
    upwind_cloud_cover: Optional[float] = Field(None, ge=0, le=1)


class PredictResponse(BaseModel):
    tension: float
    pressure_trend: float


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
        tension = predict_tension(req.camera.model_dump(), weather, upwind_cloud_cover=req.upwind_cloud_cover)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    pressure_trend = weather["pressure_msl"] - weather["pressure_3h_ago"]
    return PredictResponse(tension=tension, pressure_trend=pressure_trend)


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


class NarrateRequest(BaseModel):
    camera: CameraSummary
    tension: float = Field(0.0, ge=0, le=1)
    pressure_trend: Optional[float] = None


class NarrateResponse(BaseModel):
    caption: str


@app.post("/narrate", response_model=NarrateResponse)
def narrate_endpoint(req: NarrateRequest) -> NarrateResponse:
    try:
        caption = narrate(req.camera.model_dump(), req.tension, req.pressure_trend)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"narrator model unreachable: {exc}") from exc
    return NarrateResponse(caption=caption)


class NarrateSpeechRequest(BaseModel):
    text: str


@app.post("/narrate/speech")
def narrate_speech_endpoint(req: NarrateSpeechRequest) -> Response:
    try:
        audio = synthesize_speech(req.text)
    except TTSNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")


@app.get("/earth/regions")
def earth_regions() -> dict:
    return {
        "regions": [
            {
                "id": rid,
                "label": r["label"],
                "lat": r["lat"],
                "lon": r["lon"],
                "satellite": r["satellite"],
                "satellite_label": gibs.SATELLITES[r["satellite"]]["label"],
            }
            for rid, r in gibs.REGIONS.items()
        ]
    }


class EarthFramesResponse(BaseModel):
    satellite: str
    satellite_label: str
    tiles: list
    times: list[str]


@app.get("/earth/frames/{region_id}", response_model=EarthFramesResponse)
def earth_frames(region_id: str, frame_count: int = 8) -> EarthFramesResponse:
    if region_id not in gibs.REGIONS:
        raise HTTPException(status_code=404, detail=f"unknown region {region_id!r}")
    region = gibs.REGIONS[region_id]
    satellite = region["satellite"]
    tiles = gibs.region_tile_grid(region_id)
    try:
        times = gibs.list_frame_times(gibs.SATELLITES[satellite]["visible"].id, count=frame_count)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"GIBS capabilities unreachable: {exc}") from exc
    return EarthFramesResponse(
        satellite=satellite, satellite_label=gibs.SATELLITES[satellite]["label"], tiles=tiles, times=times
    )


@app.get("/earth/tile/{satellite}/{band}/{time_str}/{z}/{x}/{y}.{ext}")
def earth_tile(satellite: str, band: str, time_str: str, z: int, x: int, y: int, ext: str) -> Response:
    if satellite not in gibs.SATELLITES or band not in ("visible", "ir"):
        raise HTTPException(status_code=404, detail="unknown satellite or band")
    try:
        content, content_type = gibs.fetch_tile(satellite, band, time_str, z, x, y)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"GIBS tile fetch failed: {exc}") from exc
    if content is None:
        raise HTTPException(status_code=404, detail="no tile at this position (edge of satellite disk)")
    return Response(content=content, media_type=content_type)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
