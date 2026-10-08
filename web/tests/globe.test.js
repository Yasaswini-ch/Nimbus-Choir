import { describe, it, expect } from "vitest";
import { project, unproject, angularDistance, nearestRegion } from "../src/earth/globe.js";

describe("project", () => {
  it("places the rotation center at the origin, facing the viewer", () => {
    const { x, y, visible } = project(0, 0, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(visible).toBe(true);
  });

  it("the north pole projects to the top of the circle", () => {
    const { x, y, visible } = project(0, 90, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(-1, 5);
    expect(visible).toBe(true);
  });

  it("a point 180deg away from the rotation center is on the far hemisphere", () => {
    const { visible } = project(180, 0, 0);
    expect(visible).toBe(false);
  });

  it("a point just past 90deg from the rotation center is on the far side", () => {
    const { x, visible } = project(90.01, 0, 0);
    expect(x).toBeCloseTo(1, 2);
    expect(visible).toBe(false);
  });
});

describe("unproject", () => {
  it("round-trips a visible point back to its original (lon, lat)", () => {
    const lon = 37, lat = 22, rotation = 10;
    const { x, y } = project(lon, lat, rotation);
    const back = unproject(x, y, rotation);
    expect(back.lon).toBeCloseTo(lon, 4);
    expect(back.lat).toBeCloseTo(lat, 4);
  });

  it("returns null for a click outside the unit circle", () => {
    expect(unproject(1.5, 0, 0)).toBeNull();
  });

  it("the globe's center unprojects to the rotation longitude at the equator", () => {
    const back = unproject(0, 0, 123);
    expect(back.lon).toBeCloseTo(123, 5);
    expect(back.lat).toBeCloseTo(0, 5);
  });
});

describe("angularDistance", () => {
  it("is zero for the same point", () => {
    expect(angularDistance(10, 20, 10, 20)).toBeCloseTo(0, 5);
  });

  it("is 90 for two points a quarter-sphere apart on the equator", () => {
    expect(angularDistance(0, 0, 90, 0)).toBeCloseTo(90, 5);
  });

  it("is 180 for antipodal points", () => {
    expect(angularDistance(0, 0, 180, 0)).toBeCloseTo(180, 5);
  });
});

describe("nearestRegion", () => {
  const regions = [
    { id: "us-east", lon: -78, lat: 38 },
    { id: "east-asia", lon: 138, lat: 36 },
    { id: "australia", lon: 134, lat: -25 },
  ];

  it("picks the closest region by great-circle distance", () => {
    expect(nearestRegion(-80, 40, regions).id).toBe("us-east");
    expect(nearestRegion(140, 35, regions).id).toBe("east-asia");
    expect(nearestRegion(130, -20, regions).id).toBe("australia");
  });

  it("returns null for an empty region list", () => {
    expect(nearestRegion(0, 0, [])).toBeNull();
  });
});
