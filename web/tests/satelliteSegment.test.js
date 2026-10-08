import { describe, it, expect } from "vitest";
import { satellitePseudoType, segmentSatelliteClouds } from "../src/earth/satelliteSegment.js";

function solidImageData(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255;
  }
  return { data, width, height };
}

/** Dark background with one bright square cloud blob painted into it. */
function imageWithBlob(width, height, blobRect, brightness = 240) {
  const img = solidImageData(width, height, [20, 20, 20]);
  const { data } = img;
  for (let y = blobRect.y0; y < blobRect.y1; y++) {
    for (let x = blobRect.x0; x < blobRect.x1; x++) {
      const p = (y * width + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = brightness;
    }
  }
  return img;
}

describe("satellitePseudoType", () => {
  it("bright + large -> cumulonimbus-like", () => {
    expect(satellitePseudoType(0.8, 0.1)).toBe("cumulonimbus");
  });
  it("bright + small -> cirrus-like", () => {
    expect(satellitePseudoType(0.8, 0.005)).toBe("cirrus");
  });
  it("dim + large -> stratus-like", () => {
    expect(satellitePseudoType(0.3, 0.1)).toBe("stratus");
  });
  it("dim + small -> cumulus-like", () => {
    expect(satellitePseudoType(0.3, 0.005)).toBe("cumulus");
  });
});

describe("segmentSatelliteClouds", () => {
  it("finds no blobs over a uniformly dark (clear) frame", () => {
    const img = solidImageData(64, 64, [10, 10, 10]);
    const { blobs } = segmentSatelliteClouds(img, null);
    expect(blobs).toHaveLength(0);
  });

  it("detects one bright blob as a satellite-mode cloud", () => {
    const img = imageWithBlob(64, 64, { x0: 10, y0: 10, x1: 30, y1: 30 });
    const { blobs } = segmentSatelliteClouds(img, null);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].mode).toBe("satellite");
    expect(blobs[0].brightness).toBeGreaterThan(0.8);
    expect(blobs[0].centroid.x).toBeGreaterThan(0);
    expect(blobs[0].centroid.y).toBeGreaterThan(0);
  });

  it("drops blobs smaller than minAreaFrac", () => {
    const img = imageWithBlob(64, 64, { x0: 10, y0: 10, x1: 11, y1: 11 });
    const { blobs } = segmentSatelliteClouds(img, null);
    expect(blobs).toHaveLength(0);
  });

  it("samples IR brightness within the blob's bbox for the height field", () => {
    const visible = imageWithBlob(64, 64, { x0: 10, y0: 10, x1: 30, y1: 30 }, 240);
    const ir = solidImageData(64, 64, [200, 200, 200]); // uniformly "cold" (bright) IR frame
    const { blobs } = segmentSatelliteClouds(visible, ir);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].height).toBeCloseTo(200 / 255, 1);
  });

  it("falls back to visible brightness for height when no IR frame is given", () => {
    const visible = imageWithBlob(64, 64, { x0: 10, y0: 10, x1: 30, y1: 30 }, 240);
    const { blobs } = segmentSatelliteClouds(visible, null);
    expect(blobs[0].height).toBeCloseTo(blobs[0].brightness, 5);
  });
});
