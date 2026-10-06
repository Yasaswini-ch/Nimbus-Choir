import "./style.css";
import * as engine from "./audio/engine.js";

const $ = (id) => document.getElementById(id);
const TYPES = ["cirrus", "cumulus", "cumulus", "stratus", "cumulonimbus"];

let clouds = new Map(); // id -> sim state
let nextId = 1;
let patchMode = false;
let lastTick = performance.now();

function spawnCloud() {
  const id = nextId++;
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const fromLeft = Math.random() < 0.6;
  const y = type === "stratus" ? 0.18 + Math.random() * 0.2
    : type === "cirrus" ? 0.7 + Math.random() * 0.25
    : 0.3 + Math.random() * 0.5;
  clouds.set(id, {
    id,
    type,
    mode: patchMode ? "patch" : "cloud",
    x: fromLeft ? -0.1 : 1.1,
    y,
    r: (type === "cumulonimbus" ? 0.11 : type === "stratus" ? 0.1 : 0.08) * (0.8 + Math.random() * 0.5),
    vx: (fromLeft ? 1 : -1) * (0.015 + Math.random() * 0.02),
    born: performance.now(),
    life: 25000 + Math.random() * 30000,
    brightness: patchMode ? Math.random() : 0.5 + Math.random() * 0.4,
    texture: patchMode ? Math.random() * 0.3 : 0.1,
  });
}

function ensureCount(n) {
  while (clouds.size < n) spawnCloud();
  if (clouds.size > n) {
    const extra = [...clouds.keys()].slice(0, clouds.size - n);
    for (const id of extra) {
      engine.removeCloud(id);
      clouds.delete(id);
    }
  }
}

function tick() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  ensureCount(+$("count").value);

  for (const cloud of [...clouds.values()]) {
    cloud.x += cloud.vx * dt;
    const expired = now - cloud.born > cloud.life || cloud.x < -0.15 || cloud.x > 1.15;
    if (expired) {
      engine.removeCloud(cloud.id);
      clouds.delete(cloud.id);
      continue;
    }
    engine.upsertCloud({
      id: cloud.id,
      type: cloud.type,
      mode: cloud.mode,
      area: cloud.r * cloud.r * 4,
      centroid: { x: cloud.x, y: cloud.y },
      height: 1 - cloud.y,
      brightness: cloud.brightness,
      texture: cloud.texture,
    });
  }
}

$("tension").oninput = (e) => {
  const v = +e.target.value;
  $("tv").textContent = v.toFixed(2);
  engine.setTension(v);
};
$("count").oninput = (e) => ($("nv").textContent = e.target.value);
$("scale").onchange = (e) => engine.setScale(e.target.value);
$("root").onchange = (e) => engine.setRoot(+e.target.value);
$("storm").onclick = () => { $("tension").value = 0.9; $("tension").dispatchEvent(new Event("input")); };
$("calm").onclick = () => { $("tension").value = 0; $("tension").dispatchEvent(new Event("input")); };
$("patch").onclick = () => {
  patchMode = !patchMode;
  for (const id of [...clouds.keys()]) {
    engine.removeCloud(id);
    clouds.delete(id);
  }
};
let muted = false;
$("mute").onclick = (e) => {
  muted = !muted;
  engine.setMuted(muted);
  e.target.textContent = muted ? "Unmute" : "Mute";
};

$("go").onclick = () => {
  engine.start();
  $("go").style.display = "none";
  lastTick = performance.now();
  setInterval(tick, 100);
};
