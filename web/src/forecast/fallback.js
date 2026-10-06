/**
 * Pure-JS rule-based tension fallback for when /predict is unreachable
 * (no server deployed, or genuinely offline): falling pressure plus
 * thickening high cloud means higher tension. Crude but keeps the app
 * producing some mood signal without a network round trip.
 */
export function estimateTensionFallback({ pressureTrend = 0, highCloudCoverFrac = 0 } = {}) {
  // pressureTrend: hPa change over the last 3h (negative = falling).
  // highCloudCoverFrac: 0-1, fraction of the sky mask reading as high/cirrus-like cloud.
  const fallingPressure = Math.max(0, -pressureTrend) / 6; // ~6 hPa/3h is a strong front
  const thickeningHighCloud = highCloudCoverFrac;

  const tension = 0.5 * Math.min(1, fallingPressure) + 0.5 * Math.min(1, thickeningHighCloud);
  return Math.max(0, Math.min(1, tension));
}
