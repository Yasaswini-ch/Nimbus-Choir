import * as engine from "../audio/engine.js";
import { templateCaption } from "./fallback.js";

const NARRATE_URL = "/narrate";
const SPEECH_URL = "/narrate/speech";
const DUCK_FRACTION = 0.35;
const WORD_SPEAK_MS = 350; // rough speechSynthesis duration estimate, words/min-ish

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function speakOffline(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const approxMs = Math.max(2000, text.split(/\s+/).length * WORD_SPEAK_MS);
  engine.duckMasterGain(DUCK_FRACTION, approxMs + 500);
  window.speechSynthesis.speak(utterance);
}

async function speak(text) {
  try {
    const res = await fetchWithTimeout(
      SPEECH_URL,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) },
      10000
    );
    if (!res.ok) throw new Error(`narrate/speech failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise((resolve) => {
      audio.addEventListener("loadedmetadata", () => {
        engine.duckMasterGain(DUCK_FRACTION, Math.ceil((audio.duration || 4) * 1000));
      });
      audio.addEventListener("ended", resolve);
      audio.addEventListener("error", resolve);
      audio.play().catch(resolve);
    });
    URL.revokeObjectURL(url);
  } catch {
    speakOffline(text);
  }
}

/**
 * getState() -> { camera: {cirrus,cumulus,stratus,cumulonimbus}, tension, pressureTrend }
 * isVoiceEnabled() -> bool (the narrator UI toggle; caption always shows regardless)
 */
export function createNarrator({ intervalMs = 60000, captionEl, getState, isVoiceEnabled }) {
  let timer = null;

  async function tick() {
    const { camera, tension, pressureTrend } = getState();
    let caption;
    try {
      const res = await fetchWithTimeout(
        NARRATE_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ camera, tension, pressure_trend: pressureTrend }),
        },
        8000
      );
      if (!res.ok) throw new Error(`narrate failed: ${res.status}`);
      caption = (await res.json()).caption;
    } catch {
      caption = templateCaption({ camera, tension });
    }

    if (captionEl) captionEl.textContent = caption;
    if (isVoiceEnabled()) await speak(caption);
  }

  return {
    start() {
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
