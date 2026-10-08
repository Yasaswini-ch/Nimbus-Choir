import { toGray, connectedComponents, mean } from "../sky/imageUtils.js";

const CLOUD_BRIGHTNESS_THRESHOLD = 0.35; // visible-band luminance (0-1) above which a pixel counts as cloud
const MIN_AREA_FRAC = 0.002;

/**
 * bright+large -> thick/dense mass (cumulonimbus-like timbre), bright+small -> thin
 * wisp (cirrus-like), dim+large -> flat overcast sheet (stratus-like), dim+small ->
 * cumulus-like. This buckets visible brightness/size into the existing sound
 * engine's 4 timbre presets (web/src/audio/config.js TYPES) -- it is not a real
 * cloud-genus classification and never runs the ground-photo ONNX classifier,
 * matching the "do not use the ground-photo classifier on satellite views" spec.
 */
export function satellitePseudoType(brightness, areaFrac) {
  const bright = brightness > 0.6;
  const large = areaFrac > 0.03;
  if (bright && large) return "cumulonimbus";
  if (bright && !large) return "cirrus";
  if (!bright && large) return "stratus";
  return "cumulus";
}

/**
 * Mean IR-band luminance (0-1) over a bbox region of the IR canvas, as a
 * colder-cloud-top proxy: GIBS's Clean Infrared layer renders through NASA's
 * own colormap where colder tops read brighter, so this is directional, not
 * a radiance decode (documented in /server/README.md's Earth mode section).
 */
function irBrightnessInBbox(irGray, irWidth, irHeight, bbox) {
  const x0 = Math.max(0, Math.round(bbox.x0 * irWidth));
  const x1 = Math.min(irWidth, Math.round(bbox.x1 * irWidth));
  const y0 = Math.max(0, Math.round(bbox.y0 * irHeight));
  const y1 = Math.min(irHeight, Math.round(bbox.y1 * irHeight));
  const vals = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) vals.push(irGray[y * irWidth + x] / 255);
  }
  return vals.length ? mean(vals) : 0.5;
}

/**
 * Satellite-view cloud detection: unlike the ground camera, there's no sky
 * mask or horizon (the whole frame is "sky" seen from above) -- clouds are
 * just bright pixels in the visible band. Returns blobs shaped like
 * sky/segment.js's so they flow through the same tracker/classifier/engine
 * path (mode "satellite" instead of "cloud"/"patch").
 */
export function segmentSatelliteClouds(visibleImageData, irImageData, { minAreaFrac = MIN_AREA_FRAC } = {}) {
  const { width, height } = visibleImageData;
  const { gray: visGray } = toGray(visibleImageData);
  const { gray: irGray } = irImageData ? toGray(irImageData) : { gray: null };
  const irWidth = irImageData?.width ?? width;
  const irHeight = irImageData?.height ?? height;

  const cloudMask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    cloudMask[p] = visGray[p] / 255 > CLOUD_BRIGHTNESS_THRESHOLD ? 1 : 0;
  }

  const minArea = Math.max(4, Math.round(width * height * minAreaFrac));
  const components = connectedComponents(cloudMask, width, height, visGray).filter((c) => c.area >= minArea);

  const blobs = components.map((c) => {
    const cx = (c.bbox.x0 + c.bbox.x1) / 2 / width;
    const cy = (c.bbox.y0 + c.bbox.y1) / 2 / height;
    const bbox = {
      x0: c.bbox.x0 / width, y0: c.bbox.y0 / height,
      x1: c.bbox.x1 / width, y1: c.bbox.y1 / height,
    };
    const areaFrac = c.area / (width * height);
    const brightness = c.brightness / 255;
    const irBrightness = irGray ? irBrightnessInBbox(irGray, irWidth, irHeight, bbox) : brightness;

    return {
      mode: "satellite",
      bbox,
      centroid: { x: cx, y: cy },
      area: areaFrac,
      height: irBrightness, // colder-top proxy drives pitch, same convention as ground mode's frame-height
      brightness,
      texture: c.texture / 255,
      pseudoType: satellitePseudoType(brightness, areaFrac),
    };
  });

  return { blobs };
}
