import "./style.css";
import { CameraSource } from "./camera.js";
import { analyzeFrame } from "./sky/pipeline.js";
import { CloudTracker } from "./tracking/tracker.js";
import { maybeClassify, dropHistory } from "./sky/classifier.js";
import { drawOverlay } from "./ui/overlay.js";
import { bindControls } from "./ui/controls.js";
import * as engine from "./audio/engine.js";
import { createWakeLockManager } from "./audio/wakeLock.js";
import { estimateTensionFallback } from "./forecast/fallback.js";

const video = document.getElementById("video");
const overlayCanvas = document.getElementById("overlay");
const overlayCtx = overlayCanvas.getContext("2d");
const statusEl = document.getElementById("status");
const goButton = document.getElementById("go");

const camera = new CameraSource(video);
const tracker = new CloudTracker();
const wakeLock = createWakeLockManager({
  onNeedsResume: () => {
    goButton.textContent = "Tap to resume";
    goButton.style.display = "flex";
  },
});

const state = {
  sensitivity: 0.5,
  horizonOverride: null,
  debug: true,
};

let knownIds = new Set();
let started = false;
let latestLiveTracks = [];
let cachedCoords = null;

const PREDICT_URL = "/predict"; // co-hosted FastAPI server; adjust if deployed separately
const PREDICT_INTERVAL_MS = 5 * 60 * 1000;
const PREDICT_TIMEOUT_MS = 5000;

function cameraSummaryFromTracks(tracks) {
  const summary = { cirrus: 0, cumulus: 0, stratus: 0, cumulonimbus: 0 };
  for (const t of tracks) {
    if (t.type && summary[t.type] != null) summary[t.type] += t.area ?? 0;
  }
  for (const key of Object.keys(summary)) summary[key] = Math.min(1, summary[key]);
  return summary;
}

async function getCoords() {
  if (cachedCoords) return cachedCoords;
  if (!("geolocation" in navigator)) return null;
  try {
    cachedCoords = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        reject,
        { timeout: PREDICT_TIMEOUT_MS }
      );
    });
  } catch {
    cachedCoords = null;
  }
  return cachedCoords;
}

async function updateTension() {
  const camera = cameraSummaryFromTracks(latestLiveTracks);
  const coords = await getCoords();

  if (coords) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PREDICT_TIMEOUT_MS);
      const res = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera, lat: coords.lat, lon: coords.lon }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        engine.setTension(data.tension);
        return;
      }
    } catch {
      // server unreachable or slow; fall through to the local rule below
    }
  }

  // Offline/no-server fallback: no network pressure reading available here,
  // so this degrades to "driven by visible high cloud only" (pressureTrend
  // defaults to 0) -- a partial signal, better than none.
  engine.setTension(estimateTensionFallback({ pressureTrend: 0, highCloudCoverFrac: camera.cirrus }));
}

function resizeOverlay() {
  const rect = overlayCanvas.getBoundingClientRect();
  overlayCanvas.width = rect.width;
  overlayCanvas.height = rect.height;
}
window.addEventListener("resize", resizeOverlay);

function updateStatus(mode, tracks) {
  const visible = tracks.filter((t) => !t.lost);
  statusEl.innerHTML = `
    <span>mode</span><span>${mode}</span>
    <span>voices</span><span>${engine.getActiveVoiceCount()} / ${visible.length} detected</span>
    <span>types</span><span>${visible.map((t) => `#${t.id} ${t.type ?? "?"}`).join(", ") || "-"}</span>
  `;
}

async function onFrame(imageData, sourceCanvas) {
  const { mode, detections, horizonRow } = analyzeFrame(imageData, {
    horizonOverride: state.horizonOverride,
    sensitivity: state.sensitivity,
  });

  const { tracks, events } = tracker.update(detections, performance.now());

  const stillHere = new Set(tracks.map((t) => t.id));
  for (const id of knownIds) if (!stillHere.has(id)) dropHistory(id);
  knownIds = stillHere;

  const liveTracks = tracks.filter((t) => !t.lost);
  await Promise.all(liveTracks.map((t) => maybeClassify(t, sourceCanvas)));
  latestLiveTracks = liveTracks;

  for (const event of events) {
    engine.removeCloud(event.id, { mergeIntoId: event.type === "merge" ? event.intoId : null });
  }
  for (const track of liveTracks) {
    engine.upsertCloud({
      id: track.id,
      type: track.type,
      mode: track.mode,
      area: track.area,
      centroid: track.centroid,
      height: track.height,
      brightness: track.brightness,
      texture: track.texture,
      fade: 1,
    });
  }

  drawOverlay(overlayCtx, {
    width: overlayCanvas.width,
    height: overlayCanvas.height,
    horizonRow,
    horizonHeight: imageData.height,
    tracks,
    enabled: state.debug,
  });

  updateStatus(mode, tracks);
}

bindControls({
  onSensitivityChange: (v) => (state.sensitivity = v),
  onHorizonChange: (v) => (state.horizonOverride = v),
  onDebugToggle: (on) => (state.debug = on),
  onVideoFile: async (file) => {
    camera.stop();
    await camera.startFile(file);
    resizeOverlay();
    camera.run(onFrame);
  },
});

goButton.onclick = async () => {
  if (started) {
    // this was the "tap to resume" state
    await wakeLock.resume(engine.getAudioContext());
    goButton.style.display = "none";
    return;
  }
  started = true;
  resizeOverlay();
  engine.start();
  wakeLock.request();
  try {
    await camera.startCamera();
  } catch (err) {
    console.warn("[camera] getUserMedia failed, use 'Load test video' instead:", err);
  }
  goButton.style.display = "none";
  camera.run(onFrame);

  updateTension();
  setInterval(updateTension, PREDICT_INTERVAL_MS);
};
