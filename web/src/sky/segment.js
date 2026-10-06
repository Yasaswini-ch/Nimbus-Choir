import { connectedComponents, toGray } from "./imageUtils.js";

/**
 * Clear-sky cloud segmentation: inside the (occluder-bridged) sky mask,
 * clouds are the pixels where blue and red are close together (whitish/gray)
 * rather than clear blue sky (blue much higher than red). `sensitivity`
 * (0-1, from the UI slider) lowers the blue-red gap required to call a
 * pixel "cloud" as it increases, so faint/thin clouds get picked up too.
 */
export function buildCloudMask(imageData, skyMask, sensitivity = 0.5) {
  const { data, width, height } = imageData;
  const threshold = 15 + (1 - sensitivity) * 45; // 15 (sensitive) .. 60 (strict)
  const cloudMask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    if (skyMask.mask[p] !== 1) continue;
    const i = p * 4;
    const blueRedGap = data[i + 2] - data[i]; // b - r
    cloudMask[p] = blueRedGap < threshold ? 1 : 0;
  }
  return cloudMask;
}

/**
 * Segments clouds and drops components under minAreaFrac of the sky-mask
 * area. Returns blobs in normalized (0-1) image coordinates, plus the
 * largest blob's fraction of sky-mask area (overcast.js needs this).
 */
export function segmentClouds(imageData, skyMask, { sensitivity = 0.5, minAreaFrac = 0.0015 } = {}) {
  const { width, height } = imageData;
  const { gray } = toGray(imageData);
  const cloudMask = buildCloudMask(imageData, skyMask, sensitivity);

  let skyMaskArea = 0;
  for (let p = 0; p < skyMask.mask.length; p++) if (skyMask.mask[p] === 1) skyMaskArea++;

  const minArea = Math.max(4, Math.round(width * height * minAreaFrac));
  const components = connectedComponents(cloudMask, width, height, gray).filter((c) => c.area >= minArea);

  let largestArea = 0;
  const blobs = components.map((c) => {
    if (c.area > largestArea) largestArea = c.area;
    const cx = (c.bbox.x0 + c.bbox.x1) / 2 / width;
    const cy = (c.bbox.y0 + c.bbox.y1) / 2 / height;
    return {
      mode: "cloud",
      bbox: {
        x0: c.bbox.x0 / width, y0: c.bbox.y0 / height,
        x1: c.bbox.x1 / width, y1: c.bbox.y1 / height,
      },
      centroid: { x: cx, y: cy },
      area: c.area / (width * height),
      height: 1 - cy, // top of frame = 1
      brightness: c.brightness / 255,
      texture: c.texture / 255,
    };
  });

  return {
    blobs,
    skyMaskAreaFrac: skyMaskArea / (width * height),
    largestBlobFracOfSky: skyMaskArea > 0 ? largestArea / skyMaskArea : 0,
    cloudMask,
  };
}
