import { rgbToHsv, toGray, sobelMagnitude, mean } from "./imageUtils.js";

/**
 * Find the horizon row: the strongest long horizontal edge, boosted where a
 * saturation jump separates the band above from the band below (sky vs. sea
 * reads differently in saturation than sky vs. land, but both show a jump).
 * Returns a row index (0 = top). A manual override, if set, always wins.
 */
export function detectHorizon(imageData, { override = null } = {}) {
  const { width, height } = imageData;
  if (override != null) return Math.round(override * (height - 1));

  const { gray } = toGray(imageData);
  const mag = sobelMagnitude(gray, width, height);

  const rowEdge = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) s += mag[y * width + x];
    rowEdge[y] = s / width;
  }

  const rowSat = new Float32Array(height);
  const { data } = imageData;
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      s += rgbToHsv(data[i], data[i + 1], data[i + 2]).s;
    }
    rowSat[y] = s / width;
  }

  // Search the middle 70% of rows (horizon is rarely at the very top/bottom)
  const lo = Math.floor(height * 0.15);
  const hi = Math.ceil(height * 0.85);
  let bestRow = Math.floor(height * 0.6);
  let bestScore = -Infinity;
  const window = 3;
  for (let y = lo; y < hi; y++) {
    const above = mean(rowSat.slice(Math.max(0, y - 10), y));
    const below = mean(rowSat.slice(y, Math.min(height, y + 10)));
    const satJump = Math.abs(below - above);
    let edge = 0;
    for (let k = -window; k <= window; k++) edge += rowEdge[Math.min(height - 1, Math.max(0, y + k))];
    const score = edge + satJump * width * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestRow = y;
    }
  }
  return bestRow;
}
