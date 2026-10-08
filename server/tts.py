"""Local text-to-speech for the sky narrator's optional voice, via Piper
(open-weight ONNX voice models, no API key, no network). Caches by exact
text, since narrator lines often repeat similar sky-state phrasing.
"""

import io
import os
import wave
from pathlib import Path

PIPER_MODEL_PATH_ENV = "PIPER_MODEL_PATH"
DEFAULT_MODEL_PATH = Path(__file__).parent / "models" / "en_US-lessac-medium.onnx"

_cache: dict[str, bytes] = {}
_voice = None


class TTSNotConfigured(RuntimeError):
    pass


def _load_voice():
    global _voice
    if _voice is not None:
        return _voice

    from piper import PiperVoice

    model_path = Path(os.environ.get(PIPER_MODEL_PATH_ENV, DEFAULT_MODEL_PATH))
    if not model_path.exists():
        raise TTSNotConfigured(
            f"Piper voice model not found at {model_path}. Download one with "
            f"`python -m piper.download_voices en_US-lessac-medium` and set "
            f"{PIPER_MODEL_PATH_ENV} if it's not under server/models/."
        )
    _voice = PiperVoice.load(str(model_path))
    return _voice


def synthesize_speech(text: str) -> bytes:
    """Returns WAV bytes for `text`. Raises TTSNotConfigured if no voice
    model is available."""
    if text in _cache:
        return _cache[text]

    voice = _load_voice()

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)
    audio = buffer.getvalue()

    _cache[text] = audio
    return audio
