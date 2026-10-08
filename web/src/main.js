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
import { createNarrator } from "./narrator/narrator.js";
import { segmentSatelliteClouds } from "./earth/satelliteSegment.js";
import { SatelliteSource, fetchRegions } from "./earth/satelliteSource.js";
import { createGlobePicker } from "./earth/globePicker.js";
import { toGray, mean } from "./sky/imageUtils.js";

const video = document.getElementById("video");
const earthViewCanvas = document.getElementById("earth-view");
const earthViewCtx = earthViewCanvas.getContext("2d");
const earthBadge = document.getElementById("earth-badge");
const earthMessageEl = document.getElementById("earth-message");
const openGlobeButton = document.getElementById("open-globe");
const globePickerEl = document.getElementById("globe-picker");
const globeCancelButton = document.getElementById("globe-cancel");
const globeHintEl = document.getElementById("globe-hint");
const overlayCanvas = document.getElementById("overlay");
const overlayCtx = overlayCanvas.getContext("2d");
const statusEl = document.getElementById("status");
const goButton = document.getElementById("go");
const narratorCaptionEl = document.getElementById("narrator-caption");

const camera = new CameraSource(video);
const satellite = new SatelliteSource();
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
  narratorVoiceOn: false,
  earthMode: false,
};

let knownIds = new Set();
let started = false;
let latestLiveTracks = [];
let cachedCoords = null;
let lastPressureTrend = null;
let lastUpwindCloudCover = null;

const narrator = createNarrator({
  intervalMs: 60000,
  captionEl: narratorCaptionEl,
  isVoiceEnabled: () => state.narratorVoiceOn,
  getState: () => ({
    camera: cameraSummaryFromTracks(latestLiveTracks),
    tension: engine.getTension(),
    pressureTrend: lastPressureTrend,
  }),
});

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
      const body = { camera, lat: coords.lat, lon: coords.lon };
      if (state.earthMode && lastUpwindCloudCover != null) body.upwind_cloud_cover = lastUpwindCloudCover;
      const res = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        engine.setTension(data.tension);
        lastPressureTrend = data.pressure_trend;
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

/** Clears every currently-tracked cloud/patch/satellite blob from both the
 * tracker and the sound engine, used when switching between camera and
 * Earth mode so ids from one source never linger as silent engine voices. */
function clearActiveTracks() {
  for (const id of tracker.tracks.keys()) engine.removeCloud(id);
  tracker.tracks.clear();
  knownIds = new Set();
  latestLiveTracks = [];
}

async function onSatelliteFrame(visibleImageData, irImageData, sourceCanvas) {
  const { blobs } = segmentSatelliteClouds(visibleImageData, irImageData);
  const { tracks, events } = tracker.update(blobs, performance.now());

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

  const { gray } = toGray(visibleImageData);
  lastUpwindCloudCover = mean(Array.from(gray)) / 255;

  earthViewCtx.clearRect(0, 0, earthViewCanvas.width, earthViewCanvas.height);
  earthViewCtx.drawImage(sourceCanvas, 0, 0, earthViewCanvas.width, earthViewCanvas.height);

  drawOverlay(overlayCtx, {
    width: overlayCanvas.width,
    height: overlayCanvas.height,
    horizonRow: null,
    horizonHeight: 0,
    tracks,
    enabled: state.debug,
  });

  updateStatus("satellite", tracks);
}

async function startEarthMode(regionId) {
  camera.stop();
  clearActiveTracks();
  earthMessageEl.textContent = "Loading satellite imagery…";
  try {
    await satellite.load(regionId);
  } catch (err) {
    earthMessageEl.textContent = "Earth mode needs internet and couldn't reach the satellite proxy — back to the sky camera.";
    console.warn("[earth mode]", err.message);
    await exitEarthMode();
    return;
  }

  state.earthMode = true;
  earthMessageEl.textContent = `${satellite.satelliteLabel} — 10-minute geostationary frames, looping.`;
  const cols = satellite.tiles ? Math.max(...satellite.tiles.map((t) => t.col)) + 1 : 1;
  const rows = satellite.tiles ? Math.max(...satellite.tiles.map((t) => t.row)) + 1 : 1;
  // internal resolution doesn't matter much (CSS scales it); this just keeps the aspect ratio sane
  earthViewCanvas.width = cols * 256;
  earthViewCanvas.height = rows * 256;

  video.hidden = true;
  earthViewCanvas.hidden = false;
  earthBadge.hidden = false;
  openGlobeButton.hidden = true;
  satellite.run(onSatelliteFrame);
}

/** Back to the sky camera: stops the satellite loop, clears tracked blobs,
 * restarts the live camera feed if the app has already been woken up. */
async function exitEarthMode() {
  state.earthMode = false;
  satellite.stop();
  clearActiveTracks();
  video.hidden = false;
  earthViewCanvas.hidden = true;
  earthBadge.hidden = true;
  openGlobeButton.hidden = false;
  earthMessageEl.textContent = "";

  if (started) {
    if (!video.srcObject) {
      try {
        await camera.startCamera();
      } catch (err) {
        console.warn("[camera] getUserMedia failed, use 'Load test video' instead:", err);
      }
    }
    camera.run(onFrame);
  }
}

const globePicker = createGlobePicker({
  canvas: document.getElementById("globe-canvas"),
  cloudsEl: document.getElementById("globe-clouds"),
  hintEl: globeHintEl,
  cancelEl: globeCancelButton,
  onPick: async (region) => {
    globePicker.close();
    globePickerEl.hidden = true;
    await startEarthMode(region.id);
  },
});

openGlobeButton.onclick = () => {
  globePickerEl.hidden = false;
  globeHintEl.textContent = "Tap a glowing point to listen there";
  globePicker.open();
};

globeCancelButton.onclick = () => {
  globePicker.close();
  globePickerEl.hidden = true;
};

earthBadge.onclick = () => {
  exitEarthMode();
};

fetchRegions()
  .then((regions) => globePicker.setRegions(regions))
  .catch((err) => console.warn("[earth mode] couldn't load region list:", err));

bindControls({
  onSensitivityChange: (v) => (state.sensitivity = v),
  onHorizonChange: (v) => (state.horizonOverride = v),
  onDebugToggle: (on) => (state.debug = on),
  onNarratorToggle: (on) => (state.narratorVoiceOn = on),
  onVideoFile: async (file) => {
    if (state.earthMode) return; // Earth mode owns the stage while it's on
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
  if (!state.earthMode) {
    try {
      await camera.startCamera();
    } catch (err) {
      console.warn("[camera] getUserMedia failed, use 'Load test video' instead:", err);
    }
    camera.run(onFrame);
  }
  goButton.style.display = "none";

  updateTension();
  setInterval(updateTension, PREDICT_INTERVAL_MS);

  narrator.start(); // caption always shown regardless of the voice toggle
};
