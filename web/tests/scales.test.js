import { describe, it, expect } from "vitest";
import { fAt, pool, noteFor } from "../src/audio/scales.js";

describe("fAt", () => {
  it("maps A4 (midi 69) to 440Hz", () => {
    expect(fAt(69)).toBeCloseTo(440, 5);
  });
  it("maps an octave up to double the frequency", () => {
    expect(fAt(81)).toBeCloseTo(880, 5);
  });
});

describe("pool", () => {
  it("only returns chord tones (degrees 1, 3, 5) when calm", () => {
    const notes = pool(60, 84, "penta", 0, true);
    // penta = [0,2,4,7,9]; calm keeps indices [0,2,4] -> scale degrees 0,4,9
    const allowedMod12 = new Set([0, 4, 9]);
    for (const m of notes) expect(allowedMod12.has(((m - 0) % 12 + 12) % 12)).toBe(true);
  });

  it("uses the full scale when not calm", () => {
    const calmNotes = pool(60, 84, "penta", 0, true);
    const fullNotes = pool(60, 84, "penta", 0, false);
    expect(fullNotes.length).toBeGreaterThan(calmNotes.length);
  });

  it("stays within [lo, hi]", () => {
    const notes = pool(60, 72, "dorian", 2, false);
    for (const m of notes) {
      expect(m).toBeGreaterThanOrEqual(60);
      expect(m).toBeLessThanOrEqual(72);
    }
  });

  it("falls back to [lo] when nothing matches", () => {
    const notes = pool(61, 61, "penta", 0, false); // narrow range unlikely to hit a scale tone
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("noteFor", () => {
  it("picks a low note for height near 0 and a high note for height near 1", () => {
    const low = noteFor(50, 70, 0, "penta", 0, 0);
    const high = noteFor(50, 70, 1, "penta", 0, 0);
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
