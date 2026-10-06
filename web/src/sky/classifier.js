/**
 * onnxruntime-web wrapper for the cloud-type classifier exported by
 * /training/export.py. Throttled to once per second per track id, with
 * majority voting over the last 5 results for stability. Patch-mode
 * pseudo-clouds skip the model entirely (their type is already derived from
 * brightness/texture in overcast.js).
 */

const MODEL_URL = "/models/cloud-classifier.onnx";
const CLASSES_URL = "/models/classes.json";
const VOTE_WINDOW = 5;
const THROTTLE_MS = 1000;
const INPUT_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ortModulePromise = null;
let session = null;
let classes = null;
let loadFailed = false;
const history = new Map(); // track id -> { lastRun, votes: string[] }

async function loadOrt() {
  if (!ortModulePromise) ortModulePromise = import("onnxruntime-web");
  return ortModulePromise;
}

async function ensureModel() {
  if (session || loadFailed) return;
  try {
    const ort = await loadOrt();
    const [s, c] = await Promise.all([
      ort.InferenceSession.create(MODEL_URL),
      fetch(CLASSES_URL).then((r) => r.json()),
    ]);
    session = s;
    classes = c;
  } catch (err) {
    loadFailed = true;
    console.warn("[classifier] model not available (run training/export.py and copy it into /web/public/models):", err);
  }
}

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

function cropToTensor(ort, sourceCanvas, bbox) {
  const sw = sourceCanvas.width, sh = sourceCanvas.height;
  const sx = Math.round(bbox.x0 * sw), sy = Math.round(bbox.y0 * sh);
  const sWidth = Math.max(1, Math.round((bbox.x1 - bbox.x0) * sw));
  const sHeight = Math.max(1, Math.round((bbox.y1 - bbox.y0) * sh));

  const off = document.createElement("canvas");
  off.width = INPUT_SIZE;
  off.height = INPUT_SIZE;
  const ctx = off.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sWidth, sHeight, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const chw = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let p = 0; p < plane; p++) {
    const i = p * 4;
    chw[p] = (data[i] / 255 - MEAN[0]) / STD[0];
    chw[plane + p] = (data[i + 1] / 255 - MEAN[1]) / STD[1];
    chw[2 * plane + p] = (data[i + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function applyVote(track, h) {
  if (h.votes.length === 0) return;
  const counts = new Map();
  for (const v of h.votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = h.votes[h.votes.length - 1], bestCount = 0;
  for (const [k, v] of counts) if (v > bestCount) { best = k; bestCount = v; }
  track.type = best;
}

/** Mutates and returns `track` with `.type` (and `.confidence` for real clouds) set. */
export async function maybeClassify(track, sourceCanvas, now = performance.now()) {
  if (track.mode === "patch") {
    track.type = track.pseudoType;
    track.confidence = 1;
    return track;
  }

  await ensureModel();
  if (!session) return track;

  const h = history.get(track.id) ?? { lastRun: 0, votes: [] };
  if (now - h.lastRun < THROTTLE_MS) {
    applyVote(track, h);
    return track;
  }
  h.lastRun = now;

  const ort = await loadOrt();
  const input = cropToTensor(ort, sourceCanvas, track.bbox);
  const output = await session.run({ pixel_values: input });
  const logitsKey = Object.keys(output)[0];
  const probs = softmax(Array.from(output[logitsKey].data));
  const idx = argmax(probs);

  h.votes.push(classes[idx]);
  if (h.votes.length > VOTE_WINDOW) h.votes.shift();
  history.set(track.id, h);

  applyVote(track, h);
  track.confidence = probs[idx];
  return track;
}

export function dropHistory(id) {
  history.delete(id);
}
