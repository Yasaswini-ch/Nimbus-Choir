/** Debug overlay: sky-mask outline, per-track boxes, ids, and type labels. */

const TRACK_COLOR = "rgba(255, 255, 255, 0.9)";
const LOST_COLOR = "rgba(255, 255, 255, 0.35)";
const HORIZON_COLOR = "rgba(255, 200, 120, 0.8)";

export function drawOverlay(ctx, { width, height, horizonRow, horizonHeight, tracks, enabled }) {
  ctx.clearRect(0, 0, width, height);
  if (!enabled) return;

  if (horizonRow != null && horizonHeight) {
    const y = (horizonRow / horizonHeight) * height;
    ctx.strokeStyle = HORIZON_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (const track of tracks) {
    const x0 = track.bbox.x0 * width, y0 = track.bbox.y0 * height;
    const bw = (track.bbox.x1 - track.bbox.x0) * width;
    const bh = (track.bbox.y1 - track.bbox.y0) * height;
    ctx.strokeStyle = track.lost ? LOST_COLOR : TRACK_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, bw, bh);

    const label = `#${track.id} ${track.type ?? "?"}`;
    ctx.font = "12px Quicksand, sans-serif";
    ctx.fillStyle = "rgba(20, 10, 40, 0.65)";
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x0, Math.max(0, y0 - 16), textWidth + 8, 16);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x0 + 4, Math.max(12, y0 - 4));
  }
}
