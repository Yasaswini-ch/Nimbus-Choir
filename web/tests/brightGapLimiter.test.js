import { describe, it, expect } from "vitest";
import { createBrightGapLimiter } from "../src/audio/chime.js";

describe("createBrightGapLimiter", () => {
  it("allows firing immediately the first time", () => {
    const limiter = createBrightGapLimiter(20);
    expect(limiter.canFire(0)).toBe(true);
  });

  it("suppresses firing again before the rate limit elapses", () => {
    const limiter = createBrightGapLimiter(20);
    limiter.markFired(0);
    expect(limiter.canFire(5)).toBe(false);
    expect(limiter.canFire(19.9)).toBe(false);
  });

  it("allows firing again once the rate limit has elapsed", () => {
    const limiter = createBrightGapLimiter(20);
    limiter.markFired(0);
    expect(limiter.canFire(20)).toBe(true);
    expect(limiter.canFire(25)).toBe(true);
  });
});
