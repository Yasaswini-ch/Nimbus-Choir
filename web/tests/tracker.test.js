import { describe, it, expect } from "vitest";
import { CloudTracker } from "../src/tracking/tracker.js";

function blob(x, y, size = 0.05, overrides = {}) {
  return {
    mode: "cloud",
    centroid: { x, y },
    bbox: { x0: x - size, y0: y - size, x1: x + size, y1: y + size },
    area: size * size * 4,
    height: 1 - y,
    brightness: 0.8,
    texture: 0.1,
    ...overrides,
  };
}

describe("CloudTracker", () => {
  it("keeps a stable id for a blob moving in a straight line", () => {
    const tracker = new CloudTracker();
    let t = 0;
    let lastId = null;
    for (let step = 0; step < 10; step++) {
      t += 100;
      const { tracks } = tracker.update([blob(0.1 + step * 0.02, 0.5)], t);
      expect(tracks.length).toBe(1);
      if (lastId == null) lastId = tracks[0].id;
      expect(tracks[0].id).toBe(lastId);
    }
  });

  it("reports nonzero velocity for a moving blob", () => {
    const tracker = new CloudTracker();
    tracker.update([blob(0.1, 0.5)], 0);
    const { tracks } = tracker.update([blob(0.3, 0.5)], 1000);
    expect(tracks[0].velocity.x).toBeCloseTo(0.2, 5);
  });

  it("assigns a new id to an unrelated blob appearing elsewhere", () => {
    const tracker = new CloudTracker();
    tracker.update([blob(0.1, 0.5)], 0);
    const { tracks } = tracker.update([blob(0.1, 0.5), blob(0.9, 0.9)], 100);
    expect(tracks.length).toBe(2);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2);
  });

  it("keeps an id through a brief disappearance under the grace period", () => {
    const tracker = new CloudTracker();
    const first = tracker.update([blob(0.5, 0.5)], 0).tracks[0];
    const duringGap = tracker.update([], 800).tracks; // gone, but < 1.5s
    expect(duringGap.length).toBe(1);
    expect(duringGap[0].lost).toBe(true);
    const reappeared = tracker.update([blob(0.5, 0.5)], 1200).tracks;
    expect(reappeared.length).toBe(1);
    expect(reappeared[0].id).toBe(first.id);
  });

  it("drops a track once the grace period expires", () => {
    const tracker = new CloudTracker();
    tracker.update([blob(0.5, 0.5)], 0);
    tracker.update([], 800); // first frame it's missing; lostSince = 800
    const { tracks, events } = tracker.update([], 2400); // 1600ms after lostSince > 1.5s grace
    expect(tracks.length).toBe(0);
    expect(events.some((e) => e.type === "expired")).toBe(true);
  });

  it("merges two tracks into one when their blobs collapse together, with a merge event for the absorbed id", () => {
    const tracker = new CloudTracker();
    const initial = tracker.update([blob(0.3, 0.5), blob(0.37, 0.5)], 0).tracks;
    expect(initial.length).toBe(2);
    const survivorCentroid = { x: 0.335, y: 0.5 };
    const { tracks: merged, events } = tracker.update([blob(survivorCentroid.x, survivorCentroid.y, 0.08)], 100);
    // one of the two original tracks survives (claims the merged blob),
    // the other is absorbed rather than entering a grace period.
    expect(merged.length).toBe(1);
    expect(initial.map((t) => t.id)).toContain(merged[0].id);

    const mergeEvent = events.find((e) => e.type === "merge");
    expect(mergeEvent).toBeDefined();
    expect(mergeEvent.intoId).toBe(merged[0].id);
    expect(initial.map((t) => t.id)).toContain(mergeEvent.id);
    expect(mergeEvent.id).not.toBe(mergeEvent.intoId);
  });

  it("splits into two tracks when one blob becomes two nearby blobs", () => {
    const tracker = new CloudTracker();
    const initial = tracker.update([blob(0.5, 0.5, 0.08)], 0).tracks;
    expect(initial.length).toBe(1);
    const { tracks: split } = tracker.update([blob(0.46, 0.5), blob(0.54, 0.5)], 100);
    expect(split.length).toBe(2);
    expect(split.map((t) => t.id)).toContain(initial[0].id);
  });
});
