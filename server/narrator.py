"""Sky narrator caption: summarizes the current sky state numerically and
has a local Gemma model (via Ollama) write one or two playful lines. Never
touches camera images -- only the same numeric camera summary /predict uses.
"""

import os

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.environ.get("NARRATOR_MODEL", "gemma3:4b")

SYSTEM_PROMPT = (
    "You are the gentle field-guide voice of an ambient sound installation called "
    "Nimbus Choir. Every detected cloud hums a pad and drops chimes as it drifts. "
    "Given a numeric summary of the sky, write one or two playful lines, under 25 "
    "words total, describing what the sky is humming or chiming right now. No "
    "hashtags, no emoji, no quotation marks around the output -- just the line(s)."
)


def build_summary_text(camera_summary: dict, tension: float, pressure_trend: float | None) -> str:
    types = ", ".join(f"{k} {v * 100:.0f}%" for k, v in camera_summary.items() if v > 0) or "clear sky"
    trend = "unknown" if pressure_trend is None else f"{pressure_trend:+.1f} hPa/3h"
    return (
        f"Sky state: {types}. Tension: {tension:.2f} (0=calm, 1=stormy). "
        f"Pressure trend: {trend}."
    )


def narrate(camera_summary: dict, tension: float, pressure_trend: float | None = None, timeout: int = 20) -> str:
    """Returns a short caption line. Raises requests.RequestException if Ollama is unreachable."""
    summary_text = build_summary_text(camera_summary, tension, pressure_trend)
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "system": SYSTEM_PROMPT,
            "prompt": summary_text,
            "stream": False,
            "options": {"temperature": 0.8, "num_predict": 60},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    caption = resp.json()["response"].strip().strip('"')
    return caption
