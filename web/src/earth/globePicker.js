import coastlines from "./coastlines.json";
import { project, unproject, nearestRegion } from "./globe.js";

const ROTATION_SPEED_DEG_PER_SEC = 6;
const PIN_HIT_RADIUS_PX = 16;

/**
 * The "click the Earth icon -> clouds part -> spinning globe -> pick a
 * region" picker. Owns a canvas, an auto-rotation loop, and click-to-pick
 * (snaps to the nearest of the 5 real GIBS-covered regions, per
 * globe.js's nearestRegion). The cloud-parting reveal itself is a CSS
 * transition on `cloudsEl` (toggled by a class here); this module only
 * draws the globe and resolves clicks.
 */
export function createGlobePicker({ canvas, cloudsEl, hintEl, cancelEl, onPick }) {
  const ctx = canvas.getContext("2d");
  let regions = [];
  let rotationLambda = -20;
  let lastFrameAt = null;
  let rafId = null;
  let size = 0;
  let hoveredRegion = null;

  function setRegions(list) {
    regions = list;
  }

  function resize() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      // not laid out yet (e.g. this very frame it just became visible) -- try again next frame
      requestAnimationFrame(resize);
      return;
    }
    // The canvas shares this flex column with the hint text and cancel button below it, so
    // its square size must respect leftover height too, not just width -- otherwise those
    // siblings get pushed to overlap the canvas when the stage is short (see commit history).
    const reservedHeight = (hintEl?.offsetHeight ?? 0) + (cancelEl?.offsetHeight ?? 0) + 24 /* gaps */;
    size = Math.min(rect.width * 0.72, rect.height - reservedHeight, 320);
    if (size <= 0) {
      requestAnimationFrame(resize);
      return;
    }
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toScreen(x, y) {
    const r = size / 2;
    return { sx: r + x * r * 0.96, sy: r + y * r * 0.96 };
  }

  function draw() {
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);

    const gradient = ctx.createRadialGradient(r * 0.65, r * 0.6, r * 0.1, r, r, r);
    gradient.addColorStop(0, "#5a4a9e");
    gradient.addColorStop(1, "#1c1438");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1;
    for (const line of coastlines) {
      ctx.beginPath();
      let drawing = false;
      for (const [lon, lat] of line) {
        const { x, y, visible } = project(lon, lat, rotationLambda);
        if (!visible) { drawing = false; continue; }
        const { sx, sy } = toScreen(x, y);
        if (!drawing) { ctx.moveTo(sx, sy); drawing = true; } else { ctx.lineTo(sx, sy); }
      }
      ctx.stroke();
    }
    ctx.restore();

    for (const region of regions) {
      const { x, y, visible } = project(region.lon, region.lat, rotationLambda);
      if (!visible) continue;
      const { sx, sy } = toScreen(x, y);
      const isHover = hoveredRegion?.id === region.id;

      ctx.beginPath();
      ctx.fillStyle = isHover ? "#ffd27a" : "#ffb545";
      ctx.shadowColor = isHover ? "#ffd27a" : "#ffb545";
      ctx.shadowBlur = isHover ? 14 : 8;
      ctx.arc(sx, sy, isHover ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isHover) {
        ctx.font = "600 13px Quicksand, sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(region.label, sx + 10, sy - 8);
      }
    }
  }

  function tick(now) {
    if (lastFrameAt != null) {
      const dt = (now - lastFrameAt) / 1000;
      rotationLambda = (rotationLambda + ROTATION_SPEED_DEG_PER_SEC * dt) % 360;
    }
    lastFrameAt = now;
    // schedule the next frame FIRST: a draw() error must never silently kill the loop
    rafId = requestAnimationFrame(tick);
    try {
      draw();
    } catch (err) {
      console.error("[globe] draw() failed:", err);
    }
  }

  function pointerToLonLat(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const r = rect.width / 2;
    const x = (clientX - rect.left - r) / (r * 0.96);
    const y = (clientY - rect.top - r) / (r * 0.96);
    return unproject(x, y, rotationLambda);
  }

  function regionAtPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    for (const region of regions) {
      const { x, y, visible } = project(region.lon, region.lat, rotationLambda);
      if (!visible) continue;
      const { sx, sy } = toScreen(x, y);
      const screenX = rect.left + sx, screenY = rect.top + sy;
      if (Math.hypot(clientX - screenX, clientY - screenY) <= PIN_HIT_RADIUS_PX) return region;
    }
    return null;
  }

  function onPointerMove(e) {
    hoveredRegion = regionAtPointer(e.clientX, e.clientY);
    canvas.style.cursor = hoveredRegion ? "pointer" : "grab";
  }

  function onClick(e) {
    const hit = regionAtPointer(e.clientX, e.clientY);
    if (hit) {
      onPick(hit);
      return;
    }
    const lonLat = pointerToLonLat(e.clientX, e.clientY);
    if (!lonLat || !regions.length) return;
    const nearest = nearestRegion(lonLat.lon, lonLat.lat, regions);
    if (hintEl) hintEl.textContent = `No live coverage exactly there — nearest is ${nearest.label}.`;
    onPick(nearest);
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("click", onClick);

  function open() {
    if (cloudsEl) {
      cloudsEl.classList.remove("revealed");
      void cloudsEl.offsetWidth; // force layout so the browser commits the "closed" state before we transition
      // a single rAF can land in the same unpainted frame as the mutation above and skip the
      // transition entirely; nesting two guarantees at least one real paint happens in between
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cloudsEl) cloudsEl.classList.add("revealed");
        });
      });
    }
    lastFrameAt = null;
    resize();
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function close() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (cloudsEl) cloudsEl.classList.remove("revealed");
  }

  window.addEventListener("resize", () => {
    if (rafId) resize();
  });

  return { setRegions, open, close };
}
