import { mean, stdDev } from "./imageUtils.js";

const GRAY_SATURATION_THRESHOLD = 0.12;
const DOMINANT_BLOB_FRACTION = 0.7;

/** Decide clear-sky vs. patch (overcast) mode for this frame. */
export function shouldUsePatchMode(imageData, skyMask, segmentResult) {
  const { data, width } = imageData;
  const sats = [];
  for (let p = 0; p < skyMask.mask.length; p++) {
    if (skyMask.mask[p] !== 1) continue;
    const i = p * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    sats.push(max === 0 ? 0 : (max - min) / max);
  }
  const meanSat = mean(sats);
  const isGray = meanSat < GRAY_SATURATION_THRESHOLD;
  const isDominant = segmentResult.largestBlobFracOfSky > DOMINANT_BLOB_FRACTION;
  return isGray || isDominant;
}

/** dark+lumpy -> cumulonimbus-like, dark+flat -> stratus-like, bright+wispy -> cirrus-like, else cumulus-like. */
export function patchPseudoType(brightness, texture) {
  const dark = brightness < 0.45;
  const lumpy = texture > 0.12;
  if (dark && lumpy) return "cumulonimbus";
  if (dark && !lumpy) return "stratus";
  if (!dark && lumpy) return "cirrus";
  return "cumulus";
}

/**
 * Split the sky mask's bounding box into a cols x rows grid. Each cell with
 * enough sky pixels becomes a pseudo-cloud patch.
 */
export function buildPatches(imageData, skyMask, gray, { cols = 6, rows = 4, minSkyFrac = 0.3 } = {}) {
  const { width, height } = imageData;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  let any = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skyMask.mask[y * width + x] !== 1) continue;
      any = true;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!any) return [];

  const cellW = (x1 - x0 + 1) / cols;
  const cellH = (y1 - y0 + 1) / rows;
  const patches = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx0 = Math.round(x0 + col * cellW), cx1 = Math.round(x0 + (col + 1) * cellW);
      const cy0 = Math.round(y0 + row * cellH), cy1 = Math.round(y0 + (row + 1) * cellH);
      const lums = [];
      let skyPixels = 0, total = 0;
      for (let y = cy0; y < cy1; y++) {
        for (let x = cx0; x < cx1; x++) {
          total++;
          const p = y * width + x;
          if (skyMask.mask[p] !== 1) continue;
          skyPixels++;
          lums.push(gray[p] / 255);
        }
      }
      if (total === 0 || skyPixels / total < minSkyFrac) continue;

      const brightness = mean(lums);
      const texture = stdDev(lums);
      patches.push({
        mode: "patch",
        cell: { row, col },
        bbox: { x0: cx0 / width, y0: cy0 / height, x1: cx1 / width, y1: cy1 / height },
        centroid: { x: (cx0 + cx1) / 2 / width, y: (cy0 + cy1) / 2 / height },
        area: skyPixels / (width * height),
        height: 1 - (row + 0.5) / rows,
        brightness,
        texture,
        pseudoType: patchPseudoType(brightness, texture),
      });
    }
  }
  return patches;
}
