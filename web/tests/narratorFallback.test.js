import { describe, it, expect } from "vitest";
import { templateCaption } from "../src/narrator/fallback.js";

describe("templateCaption", () => {
  it("says clear sky when nothing is detected", () => {
    expect(templateCaption({ camera: { cirrus: 0, cumulus: 0, stratus: 0, cumulonimbus: 0 }, tension: 0 }))
      .toContain("clear sky");
  });

  it("names the dominant cloud type", () => {
    const text = templateCaption({ camera: { cirrus: 0.1, cumulus: 0.6, stratus: 0.2, cumulonimbus: 0 }, tension: 0.1 });
    expect(text).toContain("cumulus");
  });

  it("describes low tension as calm", () => {
    const text = templateCaption({ camera: { cumulus: 0.5 }, tension: 0.1 });
    expect(text).toMatch(/humming softly/);
  });

  it("describes high tension as tense", () => {
    const text = templateCaption({ camera: { cumulonimbus: 0.5 }, tension: 0.9 });
    expect(text).toMatch(/tension/);
  });

  it("never returns an empty string", () => {
    expect(templateCaption({ camera: {}, tension: 0 }).length).toBeGreaterThan(0);
  });
});
