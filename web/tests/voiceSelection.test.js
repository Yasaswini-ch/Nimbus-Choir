import { describe, it, expect } from "vitest";
import { selectVoices } from "../src/audio/voiceSelection.js";

function cloud(id, area) {
  return { id, mode: "cloud", area, brightness: 0.5, texture: 0.1, lastHeardAt: null };
}

function patch(id, brightness, texture, lastHeardAt = null) {
  return { id, mode: "patch", area: 0.01, brightness, texture, lastHeardAt };
}

describe("selectVoices", () => {
  it("returns everything when at or under the cap", () => {
    const tracked = [cloud(1, 0.1), cloud(2, 0.2)];
    expect(selectVoices(tracked, 8, 0).sort()).toEqual([1, 2]);
  });

  it("caps clear-sky clouds at max, keeping the largest by area", () => {
    const tracked = Array.from({ length: 12 }, (_, i) => cloud(i + 1, i + 1)); // areas 1..12
    const selected = selectVoices(tracked, 8, 0);
    expect(selected.length).toBe(8);
    // the 8 largest areas are ids 5..12
    expect(new Set(selected)).toEqual(new Set([5, 6, 7, 8, 9, 10, 11, 12]));
  });

  it("prioritizes high-contrast patches over uniform ones", () => {
    const uniform = Array.from({ length: 6 }, (_, i) => patch(i + 1, 0.5, 0.05, 0));
    const standout = [patch(100, 0.95, 0.4, 0), patch(101, 0.02, 0.4, 0)];
    const tracked = [...uniform, ...standout];
    const selected = selectVoices(tracked, 2, 0);
    expect(new Set(selected)).toEqual(new Set([100, 101]));
  });

  it("gives an unheard-for-a-while patch a rotation bonus over a recently-heard equal patch", () => {
    const tracked = [
      patch(1, 0.5, 0.1, 90), // heard 10s ago -- only a little stale
      patch(2, 0.5, 0.1, null), // never heard -- maximally stale
      ...Array.from({ length: 6 }, (_, i) => patch(i + 10, 0.5, 0.1, 100)), // just heard, fills the cap
    ];
    const now = 100;
    const selected = selectVoices(tracked, 1, now);
    // id 2 (never heard) should win the single slot over id 1 (only 10s stale) and the just-heard fillers
    expect(selected).toEqual([2]);
  });
});
