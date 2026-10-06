import { rgbToHsv, toGray, sobelMagnitude } from "./imageUtils.js";
import { detectHorizon } from "./horizon.js";

/**
 * Sky mask: 1 = sky, 0 = ground/trees/buildings/sea/etc. Starts from
 * "everything above the horizon" then subtracts green (vegetation), dark +
 * high-texture regions (buildings/tree silhouettes), and strong-edge
 * clusters (structures, poles, wires -- occluders.js handles the thin ones
 * specially, this just keeps obviously non-sky structure out of the mask).
 */
export function computeSkyMask(imageData, { horizonOverride = null } = {}) {
  const { data, width, height } = imageData;
  const horizonRow = detectHorizon(imageData, { override: horizonOverride });

  const { gray } = toGray(imageData);
  const edge = sobelMagnitude(gray, width, height);

  const mask = new Uint8Array(width * height);
  const win = 2;

  for (let y = 0; y < horizonRow; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);

      const isGreen = h >= 70 && h <= 170 && s > 0.22 && v < 0.85;

      // local texture: luminance range in a small window around (x, y)
      let lo = Infinity, hi = -Infinity;
      for (let dy = -win; dy <= win; dy++) {
        for (let dx = -win; dx <= win; dx++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const g = gray[yy * width + xx];
          if (g < lo) lo = g;
          if (g > hi) hi = g;
        }
      }
      const texture = hi - lo;
      const isDarkTextured = gray[p] < 90 && texture > 40;
      const isStrongEdgeStructure = edge[p] > 120 && gray[p] < 140;

      mask[p] = isGreen || isDarkTextured || isStrongEdgeStructure ? 0 : 1;
    }
  }
  // below horizon is never sky
  for (let y = horizonRow; y < height; y++) {
    for (let x = 0; x < width; x++) mask[y * width + x] = 0;
  }

  return { mask, width, height, horizonRow };
}
