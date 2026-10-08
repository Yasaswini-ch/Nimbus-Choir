/**
 * Earth mode's satellite image source: fetches a region's tile grid + the
 * last N valid NRT frame times from /server's GIBS proxy, stitches each
 * frame's tiles into visible/IR canvases, and loops through them like a
 * time-lapse -- the satellite-view analog of camera.js's run(onFrame).
 * Every request here goes over the network; this module is never touched
 * unless the user explicitly turns Earth mode on.
 */

const TILE_SIZE = 256;
const FRAME_INTERVAL_MS = 1500;

export async function fetchRegions() {
  const res = await fetch("/earth/regions");
  if (!res.ok) throw new Error(`earth/regions failed: ${res.status}`);
  return (await res.json()).regions;
}

async function loadImageBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tile fetch failed: ${res.status}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

export class SatelliteSource {
  constructor() {
    this._timer = null;
    this._frames = [];
    this._frameIdx = 0;
    this.satellite = null;
    this.satelliteLabel = null;
  }

  /** Fetches the region's tile grid + frame times and preloads every stitched
   * frame up front (frameCount is small, so this stays bounded). Throws on
   * any network failure -- callers should fall back to camera mode. */
  async load(regionId, frameCount = 8) {
    const res = await fetch(`/earth/frames/${regionId}?frame_count=${frameCount}`);
    if (!res.ok) throw new Error(`earth/frames failed: ${res.status}`);
    const { satellite, satellite_label, tiles, times } = await res.json();
    if (!times.length) throw new Error("no frame times available");

    this.satellite = satellite;
    this.satelliteLabel = satellite_label;
    this.tiles = tiles;

    const cols = Math.max(...tiles.map((t) => t.col)) + 1;
    const rows = Math.max(...tiles.map((t) => t.row)) + 1;

    const frames = [];
    for (const time of times) {
      const [visibleCanvas, irCanvas] = await Promise.all([
        this._stitchBand(satellite, "visible", time, tiles, cols, rows),
        this._stitchBand(satellite, "ir", time, tiles, cols, rows),
      ]);
      frames.push({ visibleCanvas, irCanvas, time });
    }
    this._frames = frames;
    this._frameIdx = 0;
  }

  async _stitchBand(satellite, band, time, tiles, cols, rows) {
    const canvas = document.createElement("canvas");
    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    await Promise.all(
      tiles.map(async (t) => {
        const url = `/earth/tile/${satellite}/${band}/${time}/${t.z}/${t.x}/${t.y}.png`;
        try {
          const bitmap = await loadImageBitmap(url);
          ctx.drawImage(bitmap, t.col * TILE_SIZE, t.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } catch {
          // missing tile (edge of the satellite's disk, or that band 404s) -- leave blank
        }
      })
    );
    return canvas;
  }

  /** Calls onFrame(visibleImageData, irImageData, visibleCanvas) once per loop tick. */
  run(onFrame) {
    this.stop();
    if (!this._frames.length) return;
    this._timer = setInterval(() => {
      const frame = this._frames[this._frameIdx];
      this._frameIdx = (this._frameIdx + 1) % this._frames.length;
      const visCtx = frame.visibleCanvas.getContext("2d", { willReadFrequently: true });
      const irCtx = frame.irCanvas.getContext("2d", { willReadFrequently: true });
      const visibleImageData = visCtx.getImageData(0, 0, frame.visibleCanvas.width, frame.visibleCanvas.height);
      const irImageData = irCtx.getImageData(0, 0, frame.irCanvas.width, frame.irCanvas.height);
      onFrame(visibleImageData, irImageData, frame.visibleCanvas);
    }, FRAME_INTERVAL_MS);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}
