import { describe, it, expect } from "vitest";
import { sway } from "./stage.ts";

describe("mochi stage sway", () => {
  it("is zero at t = 0", () => {
    expect(sway(0)).toEqual({ y: 0, rz: 0 });
  });
  it("stays inside its amplitudes", () => {
    for (let t = 0; t <= 20000; t += 50) {
      const s = sway(t);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(0.045);
      expect(Math.abs(s.rz)).toBeLessThanOrEqual(0.02);
    }
  });
  it("peaks at a quarter period, each axis at its own", () => {
    expect(Math.abs(sway(900 * Math.PI / 2).y - 0.045)).toBeLessThan(1e-9);
    expect(Math.abs(sway(1400 * Math.PI / 2).rz - 0.02)).toBeLessThan(1e-9);
  });
  it("repeats with the bob's and the roll's own periods", () => {
    const a = sway(1234), b = sway(1234 + 2 * Math.PI * 900), c = sway(1234 + 2 * Math.PI * 1400);
    expect(Math.abs(b.y - a.y)).toBeLessThan(1e-9);
    expect(Math.abs(c.rz - a.rz)).toBeLessThan(1e-9);
  });
});
