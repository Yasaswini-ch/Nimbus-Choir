import "./style.css";
import { CameraSource } from "./camera.js";
import { analyzeFrame } from "./sky/pipeline.js";
import { CloudTracker } from "./tracking/tracker.js";
import { maybeClassify, dropHistory } from "./sky/classifier.js";
import { drawOverlay } from "./ui/overlay.js";
import { bindControls } from "./ui/controls.js";

const video = document.getElementById("video");
const overlayCanvas = document.getElementById("overlay");
const overlayCtx = overlayCanvas.getContext("2d");
const statusEl = document.getElementById("status");
const goButton = document.getElementById("go");

const camera = new CameraSource(video);
const tracker = new CloudTracker();

const state = {
  sensitivity: 0.5,
  horizonOverride: null,
  debug: true,
};

let knownIds = new Set();

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
    <span>voices</span><span>${visible.length}</span>
    <span>types</span><span>${visible.map((t) => `#${t.id} ${t.type ?? "?"}`).join(", ") || "-"}</span>
  `;
}

async function onFrame(imageData, sourceCanvas) {
  const { mode, detections, horizonRow } = analyzeFrame(imageData, {
    horizonOverride: state.horizonOverride,
    sensitivity: state.sensitivity,
  });

  const tracks = tracker.update(detections, performance.now());

  const stillHere = new Set(tracks.map((t) => t.id));
  for (const id of knownIds) if (!stillHere.has(id)) dropHistory(id);
  knownIds = stillHere;

  await Promise.all(tracks.filter((t) => !t.lost).map((t) => maybeClassify(t, sourceCanvas)));

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
  resizeOverlay();
  try {
    await camera.startCamera();
  } catch (err) {
    console.warn("[camera] getUserMedia failed, use 'Load test video' instead:", err);
  }
  goButton.style.display = "none";
  camera.run(onFrame);
};
