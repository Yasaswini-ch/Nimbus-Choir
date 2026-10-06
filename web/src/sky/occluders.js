/**
 * Thin occluders (poles, wires, flags, vehicles) cut mask.js's sky mask into
 * narrow 0-gaps inside what is otherwise one cloud. Bridge any 0-run in a
 * row that's narrower than maxGapWidthFrac of the frame and has sky on both
 * sides, so segmentation never sees the split in the first place.
 */
export function bridgeThinOccluders(skyMask, { maxGapWidthFrac = 0.02 } = {}) {
  const { mask, width, height } = skyMask;
  const bridged = Uint8Array.from(mask);
  const maxGap = Math.max(1, Math.round(width * maxGapWidthFrac));
  const occluderRuns = [];

  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let x = 0;
    while (x < width) {
      if (bridged[rowStart + x] === 1) {
        x++;
        continue;
      }
      const gapStart = x;
      while (x < width && bridged[rowStart + x] === 0) x++;
      const gapEnd = x; // exclusive
      const gapLen = gapEnd - gapStart;
      const hasSkyLeft = gapStart > 0 && bridged[rowStart + gapStart - 1] === 1;
      const hasSkyRight = gapEnd < width && bridged[rowStart + gapEnd] === 1;
      if (gapLen <= maxGap && hasSkyLeft && hasSkyRight) {
        for (let xx = gapStart; xx < gapEnd; xx++) bridged[rowStart + xx] = 1;
        occluderRuns.push({ y, x0: gapStart, x1: gapEnd });
      }
    }
  }

  return { mask: bridged, width, height, horizonRow: skyMask.horizonRow, occluderRuns };
}
