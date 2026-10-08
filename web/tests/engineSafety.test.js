import { describe, it, expect } from "vitest";
import * as engine from "../src/audio/engine.js";

describe("engine safety outside a browser / before start()", () => {
  it("duckMasterGain is a no-op (does not throw) before start()", () => {
    expect(() => engine.duckMasterGain(0.35, 3000)).not.toThrow();
  });

  it("getTension defaults to 0", () => {
    expect(engine.getTension()).toBe(0);
  });

  it("setTension clamps to [0, 1]", () => {
    engine.setTension(5);
    expect(engine.getTension()).toBe(1);
    engine.setTension(-5);
    expect(engine.getTension()).toBe(0);
    engine.setTension(0.4);
    expect(engine.getTension()).toBe(0.4);
  });
});
