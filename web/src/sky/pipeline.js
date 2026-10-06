import { toGray } from "./imageUtils.js";
import { computeSkyMask } from "./mask.js";
import { bridgeThinOccluders } from "./occluders.js";
import { segmentClouds } from "./segment.js";
import { shouldUsePatchMode, buildPatches } from "./overcast.js";

/**
 * Runs one frame of analysis (mask -> occluder bridging -> clear-sky
 * segmentation or patch-mode grid) and returns the raw per-frame
 * detections, before tracking or classification.
 */
export function analyzeFrame(imageData, { horizonOverride = null, sensitivity = 0.5 } = {}) {
  const skyMaskRaw = computeSkyMask(imageData, { horizonOverride });
  const skyMask = bridgeThinOccluders(skyMaskRaw);
  const segmentResult = segmentClouds(imageData, skyMask, { sensitivity });

  const overcast = shouldUsePatchMode(imageData, skyMask, segmentResult);

  let detections;
  let mode;
  if (overcast) {
    const { gray } = toGray(imageData);
    detections = buildPatches(imageData, skyMask, gray);
    mode = "patch";
  } else {
    detections = segmentResult.blobs;
    mode = "cloud";
  }

  return { mode, detections, skyMask, horizonRow: skyMask.horizonRow };
}
