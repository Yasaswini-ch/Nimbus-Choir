import "./style.css";
import { CameraSource } from "./camera.js";
import { analyzeFrame } from "./sky/pipeline.js";
import { CloudTracker } from "./tracking/tracker.js";
import { maybeClassify, dropHistory } from "./sky/classifier.js";
import { drawOverlay } from "./ui/overlay.js";
import { bindControls } from "./ui/controls.js";
import * as engine from "./audio/engine.js";
import { createWakeLockManager } from "./audio/wakeLock.js";

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
};
