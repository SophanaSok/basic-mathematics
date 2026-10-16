import { describe, expect, it } from "vitest";
import { BLOOM_THRESHOLD, POST_PIXELS, bloomStrength, makeBloom, postSize } from "./post";

describe("the bloom's numbers", () => {
  it("pins the design's budget, threshold and strengths", () => {
    expect(POST_PIXELS).toBe(2.1e6);
    expect(BLOOM_THRESHOLD).toBe(1.05);
    expect(bloomStrength("light")).toBe(0); /* no bloom in the light theme (owner O16) */
    expect(bloomStrength("dark")).toBe(0.55);
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

  /* a fake of three's side of it: records what the composer is given and told */
  function fakes() {
    const log: string[] = [], sizes: number[][] = [], disposed: string[] = [], made: { ctor: unknown[] }[] = [];
    class Pass { name: string; constructor(n = "pass") { this.name = n; } dispose() { disposed.push(this.name); } }
    const P = {
      EffectComposer: class {
        constructor(...args: unknown[]) { made.push({ ctor: args }); }
        setPixelRatio(r: number) { log.push("ratio " + r); }
        setSize(w: number, h: number) { log.push("size"); sizes.push([w, h]); }
        addPass() {} render() { log.push("render"); } dispose() { disposed.push("composer"); }
      },
      RenderPass: class extends Pass { constructor() { super("render"); } },
      OutputPass: class extends Pass { constructor() { super("output"); } },
      UnrealBloomPass: class extends Pass {
        strength: number; radius: number; threshold: number;
        constructor(_res: unknown, strength: number, radius: number, threshold: number) { super("bloom"); this.strength = strength; this.radius = radius; this.threshold = threshold; }
      }
    };
    const T = {
      Vector2: class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } },
      HalfFloatType: 1016,
      WebGLRenderTarget: class {
        width: number; height: number; options: { type: number; samples: number };
        constructor(w: number, h: number, o: { type: number; samples: number }) { this.width = w; this.height = h; this.options = o; }
        dispose() { disposed.push("target"); }
      }
    };
    const renderer = { extensions: { has: (n: string) => n === "EXT_color_buffer_half_float" } };
    return { log, sizes, disposed, made, P, T, renderer };
  }

  it("makeBloom builds the passes and sizes them within the budget", () => {
    const f = fakes();
    const b = makeBloom(f.T, f.P, f.renderer, {}, {}, { theme: "dark", width: 3840, height: 2160, dpr: 1 })!;
    expect(b.passes).toHaveLength(3);
    const bloom = b.passes[1] as { strength: number; threshold: number };
    expect(bloom.strength).toBe(0.55);
    expect(bloom.threshold).toBe(1.05);
    b.setSize(1920, 1080, 1);
    for (const [w, h] of f.sizes) expect(w * h).toBeLessThanOrEqual(POST_PIXELS);
    expect(b.size()).toEqual({ width: 1920, height: 1080 });
    b.setTheme("light");
    expect(b.strength()).toBe(0);
    b.setTheme("dark");
    expect(b.strength()).toBe(0.55);
    b.dispose();
  });

  it("sets the composer's pixel ratio to 1 before its first size (a dpr squared guard)", () => {
    const f = fakes();
    makeBloom(f.T, f.P, f.renderer, {}, {}, { theme: "light", width: 800, height: 600, dpr: 2 });
    expect(f.log.indexOf("ratio 1")).toBeGreaterThanOrEqual(0);
    expect(f.log.indexOf("ratio 1")).toBeLessThan(f.log.indexOf("size"));
  });

  it("gives the composer a 4-sample half float target when the renderer antialiases (the high tier), none otherwise", () => {
    const on = fakes();
    makeBloom(on.T, on.P, on.renderer, {}, {}, { theme: "light", antialias: true, width: 800, height: 600, dpr: 1 });
    const target = on.made[0].ctor[1] as { options: { type: number; samples: number }; width: number; height: number };
    expect(target.options).toEqual({ type: on.T.HalfFloatType, samples: 4 });
    expect([target.width, target.height]).toEqual([800, 600]);
    const off = fakes();
    makeBloom(off.T, off.P, off.renderer, {}, {}, { theme: "light", width: 800, height: 600, dpr: 1 });
    expect(off.made[0].ctor[1]).toBeUndefined();
  });

  it("dispose reaches the composer, the target and every pass", () => {
    const f = fakes();
    const b = makeBloom(f.T, f.P, f.renderer, {}, {}, { theme: "dark", antialias: true, width: 800, height: 600, dpr: 1 })!;
    b.dispose();
    expect(f.disposed.sort()).toEqual(["bloom", "composer", "output", "render", "target"]);
  });

  it("disposes what it built, and rethrows, when a step throws", () => {
    const f = fakes();
    const Base = f.P.UnrealBloomPass;
    f.P.OutputPass = class { constructor() { throw new Error("no output pass"); } } as never;
    expect(() => makeBloom(f.T, f.P, f.renderer, {}, {}, { theme: "dark", antialias: true, width: 800, height: 600, dpr: 1 })).toThrow("no output pass");
    expect(f.disposed.sort()).toEqual(["bloom", "composer", "render", "target"]);
  });
});
