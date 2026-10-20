import { describe, it, expect } from "vitest";
import { isVariation, clipOf, pickFade, interval, drawDue } from "./avatar.ts";

describe("mochi avatar helpers", () => {
  it("classifies clips and the neutral alias", () => {
    expect(isVariation("idle_look")).toBe(true);
    expect(isVariation("idle")).toBe(false);
    expect(isVariation("happy")).toBe(false);
    expect(clipOf("neutral")).toBe("idle");
    expect(clipOf("sad")).toBe("sad");
  });
  it("picks the fade: asked, else still, else usual", () => {
    expect(pickFade(false, undefined, 0.35, 0.9)).toBe(0.35);
    expect(pickFade(true, undefined, 0.35, 0.9)).toBe(0.9);
    expect(pickFade(true, 0, 0.35, 0.9)).toBe(0);
    expect(pickFade(false, 0.2, 0.35, 0.9)).toBe(0.2);
  });
  it("spreads the idle interval over its range", () => {
    expect(interval([5, 10], 0)).toBe(5);
    expect(interval([5, 10], 0.5)).toBe(7.5);
  });
  it("draws every tick when busy, else every gap", () => {
    expect(drawDue(true, 1, 33)).toBe(true);
    expect(drawDue(false, 20, 33)).toBe(false);
    expect(drawDue(false, 33, 33)).toBe(true);
  });
});
