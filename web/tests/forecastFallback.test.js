import { describe, it, expect } from "vitest";
import { estimateTensionFallback } from "../src/forecast/fallback.js";

describe("estimateTensionFallback", () => {
  it("returns 0 for calm conditions (steady pressure, no high cloud)", () => {
    expect(estimateTensionFallback({ pressureTrend: 0, highCloudCoverFrac: 0 })).toBe(0);
  });

  it("is clamped to [0, 1]", () => {
    const v = estimateTensionFallback({ pressureTrend: -50, highCloudCoverFrac: 5 });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("increases as pressure falls faster", () => {
    const calm = estimateTensionFallback({ pressureTrend: -1, highCloudCoverFrac: 0 });
    const stormy = estimateTensionFallback({ pressureTrend: -5, highCloudCoverFrac: 0 });
    expect(stormy).toBeGreaterThan(calm);
  });

  it("increases as high cloud cover grows", () => {
    const clear = estimateTensionFallback({ pressureTrend: 0, highCloudCoverFrac: 0.1 });
    const overcast = estimateTensionFallback({ pressureTrend: 0, highCloudCoverFrac: 0.8 });
    expect(overcast).toBeGreaterThan(clear);
  });

  it("rising pressure contributes no tension (only falling pressure matters)", () => {
    const rising = estimateTensionFallback({ pressureTrend: 10, highCloudCoverFrac: 0 });
    expect(rising).toBe(0);
  });
});
