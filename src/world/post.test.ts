import { describe, expect, it } from "vitest";
import { BLOOM_THRESHOLD, POST_PIXELS, bloomStrength, makeBloom, postSize } from "./post";

describe("the bloom's numbers", () => {
  it("pins the design's budget, threshold and strengths", () => {
    expect(POST_PIXELS).toBe(2.1e6);
    expect(BLOOM_THRESHOLD).toBe(1.05);
    expect(bloomStrength("light")).toBe(0.3);
    expect(bloomStrength("dark")).toBeGreaterThan(0);
    expect(bloomStrength("dark")).toBeLessThanOrEqual(1);
  });

  const cases: [string, number, number, number][] = [
    ["4K at dpr 1", 3840, 2160, 1],
    ["1440p at dpr 1", 2560, 1440, 1],
    ["1080p at dpr 2", 1920, 1080, 2],
    ["1080p at dpr 1", 1920, 1080, 1],
    ["phone at dpr 3", 390, 844, 3]
  ];
  for (const [name, w, h, dpr] of cases) {
    it("postSize holds " + name + " to the budget and keeps the aspect ratio", () => {
      const s = postSize(w, h, dpr);
      expect(s.width * s.height).toBeLessThanOrEqual(POST_PIXELS);
      expect(s.width).toBeGreaterThanOrEqual(1);
      const full = w * dpr * h * dpr;
      if (full <= POST_PIXELS) expect(s).toEqual({ width: w * dpr, height: h * dpr });
      else {
        expect(s.width * s.height).toBeGreaterThan(POST_PIXELS * 0.99);
        expect(Math.abs(s.width / s.height - w / h)).toBeLessThan(0.01);
      }
    });
  }

  it("postSize never returns less than one pixel", () => {
    expect(postSize(0, 0, 1)).toEqual({ width: 1, height: 1 });
  });

  it("makeBloom returns null where the renderer cannot draw half float", () => {
    const renderer = { extensions: { has: () => false } };
    expect(makeBloom({}, {}, renderer, {}, {}, { theme: "light", width: 100, height: 100, dpr: 1 })).toBeNull();
  });

  it("makeBloom builds the passes and sizes them within the budget", () => {
    const sizes: number[][] = [];
    class Pass { dispose() { /* nothing */ } }
    const P = {
      EffectComposer: class { setPixelRatio() {} setSize(w: number, h: number) { sizes.push([w, h]); } addPass() {} render() {} dispose() {} },
      RenderPass: Pass, OutputPass: Pass,
      UnrealBloomPass: class extends Pass {
        strength: number; radius: number; threshold: number;
        constructor(_res: unknown, strength: number, radius: number, threshold: number) { super(); this.strength = strength; this.radius = radius; this.threshold = threshold; }
      }
    };
    const T = { Vector2: class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } } };
    const renderer = { extensions: { has: (n: string) => n === "EXT_color_buffer_half_float" } };
    const b = makeBloom(T, P, renderer, {}, {}, { theme: "light", width: 3840, height: 2160, dpr: 1 })!;
    expect(b.passes).toHaveLength(3);
    const bloom = b.passes[1] as { strength: number; threshold: number };
    expect(bloom.strength).toBe(0.3);
    expect(bloom.threshold).toBe(1.05);
    b.setSize(1920, 1080, 1);
    for (const [w, h] of sizes) expect(w * h).toBeLessThanOrEqual(POST_PIXELS);
    b.dispose();
  });
});
