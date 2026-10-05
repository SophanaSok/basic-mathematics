import { describe, expect, it } from "vitest";
import { detectTier, FrameWatch, isSoftware, lower, PAUSE_MS, pixelRatio, SAMPLES, SLOW_MS, stepDown, TIERS, type Probe } from "./tiers.ts";

/* a capable desktop: WebGL 2, a mouse, eight cores, a hardware renderer */
const desk: Probe = { supported: true, unsupportedWhy: "", lowEnd: false, coarse: false, cores: 8, renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" };
const tier = (probe: Partial<Probe>, prefs: Record<string, string> = {}) => detectTier({ ...desk, ...probe }, prefs);

describe("the tier a device gets", () => {
  it("is the list without WebGL 2, on Save-Data and with ?3d=off, whatever was chosen", () => {
    for (const why of ["no-webgl", "save-data", "off"]) {
      expect(tier({ supported: false, unsupportedWhy: why }, { gfx: "high" })).toEqual({ tier: "list", why, chosen: false });
    }
  });

  it("is the list when the 3D map switch is off", () => {
    expect(tier({}, { map: "list", gfx: "high" }).tier).toBe("list");
    expect(tier({}, { map: "list" }).why).toBe("list");
  });

  it("is the chosen quality: Low, Medium (stored as mid) or High", () => {
    expect([tier({}, { gfx: "low" }), tier({}, { gfx: "mid" }), tier({}, { gfx: "high" })].map((c) => [c.tier, c.chosen]))
      .toEqual([["low", true], ["medium", true], ["high", true]]);
    /* a choice outranks what the device would get, both ways */
    expect(tier({ renderer: "SwiftShader" }, { gfx: "high" }).tier).toBe("high");
    expect(tier({}, { gfx: "low", gfxAuto: "list" }).tier).toBe("low");
  });

  it("is low for a software renderer, or a coarse pointer with four cores or fewer; medium otherwise; never high unasked", () => {
    expect(tier({ renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" })).toEqual({ tier: "low", why: "software", chosen: false });
    expect(tier({ renderer: "llvmpipe (LLVM 17.0.6, 256 bits)" }).tier).toBe("low");
    expect(tier({ renderer: "Microsoft Basic Render Driver" }).tier).toBe("low");
    expect(tier({ coarse: true, cores: 4 })).toEqual({ tier: "low", why: "coarse", chosen: false });
    expect(tier({ coarse: true, cores: 8 }).tier).toBe("medium");
    /* a browser that does not say how many cores it has is not taken for a weak phone */
    expect(tier({ coarse: true, cores: 0 }).tier).toBe("medium");
    expect(tier({ coarse: false, cores: 2 }).tier).toBe("medium");
    expect(tier({})).toEqual({ tier: "medium", why: "default", chosen: false });
    expect(tier({ cores: 64, renderer: "Apple M3 Max" }).tier).toBe("medium");
  });

  it("keeps the list on a low-end device unless the learner switched the map on", () => {
    expect(tier({ lowEnd: true })).toEqual({ tier: "list", why: "low-end", chosen: false });
    expect(tier({ lowEnd: true }, { map: "3d" }).tier).toBe("medium");
    expect(tier({ lowEnd: true }, { gfx: "low" }).tier).toBe("low");
  });

  it("starts no higher than the tier the watchdog settled on, and a settled tier never lifts one", () => {
    expect(tier({}, { gfxAuto: "low" })).toEqual({ tier: "low", why: "settled", chosen: false });
    expect(tier({}, { gfxAuto: "list" })).toEqual({ tier: "list", why: "slow", chosen: false });
    expect(tier({ renderer: "SwiftShader" }, { gfxAuto: "medium" })).toEqual({ tier: "low", why: "software", chosen: false });
    expect(tier({}, { gfxAuto: "nonsense" }).tier).toBe("medium");
  });
});

describe("the ladder", () => {
  it("steps down one tier at a time and stops at the list", () => {
    expect(["high", "medium", "low", "list"].map((t) => stepDown(t as never))).toEqual(["medium", "low", "list", "list"]);
    expect(lower("high", "low")).toBe("low");
    expect(lower("list", "medium")).toBe("list");
  });

  it("caps each tier's pixel ratio, and its drawing buffer", () => {
    expect(pixelRatio(TIERS.low, 3, 360, 450)).toBe(1);
    expect(pixelRatio(TIERS.medium, 3, 360, 450)).toBe(1.5);
    expect(pixelRatio(TIERS.high, 3, 360, 450)).toBe(2);
    expect(pixelRatio(TIERS.high, 1, 1092, 528)).toBe(1);
    /* a big canvas on a dense screen: fewer device pixels per CSS pixel, not more than the tier's pixels */
    const r = pixelRatio(TIERS.medium, 2, 1600, 900);
    expect(1600 * 900 * r * r).toBeLessThanOrEqual(TIERS.medium.pixels * 1.01);
    /* but never below one device pixel */
    expect(pixelRatio(TIERS.low, 2, 3000, 2000)).toBe(1);
    expect(pixelRatio(TIERS.low, 0.75, 300, 200)).toBe(0.75);
  });

  it("holds each tier to more than the one below it", () => {
    expect(TIERS.low.calls).toBeLessThanOrEqual(TIERS.medium.calls);
    expect(TIERS.low.triangles).toBeLessThan(TIERS.medium.triangles);
    expect(TIERS.medium.triangles).toBeLessThan(TIERS.high.triangles);
    expect([TIERS.low.ambient, TIERS.medium.ambient, TIERS.high.ambient]).toEqual([false, true, true]);
    expect([TIERS.low.detail, TIERS.medium.detail, TIERS.high.detail]).toEqual([0, 1, 2]);
  });

  it("names the renderers that draw on the CPU, and no others", () => {
    expect(["SwiftShader", "llvmpipe (LLVM 15)", "softpipe", "Mesa lavapipe", "Microsoft Basic Render Driver"].every(isSoftware)).toBe(true);
    expect(["Intel(R) UHD Graphics 620", "Mali-G78", "Adreno (TM) 650", "Apple GPU", "WebKit WebGL", ""].some(isSoftware)).toBe(false);
  });
});

describe("the watchdog", () => {
  const run = (gaps: number[]) => {
    const w = new FrameWatch();
    let t = 1000, slow = 0;
    w.push(t);
    for (const g of gaps) { t += g; if (w.push(t)) slow++; }
    return slow;
  };

  it("says slow after SAMPLES frames averaging over SLOW_MS, and starts again", () => {
    expect(run(Array(SAMPLES).fill(SLOW_MS + 6))).toBe(1);
    expect(run(Array(SAMPLES * 2).fill(SLOW_MS + 6))).toBe(2);
    expect(run(Array(SAMPLES - 1).fill(SLOW_MS + 6))).toBe(0);
  });

  it("lets frames at 30 a second and faster pass", () => {
    expect(run(Array(SAMPLES * 3).fill(1000 / 60))).toBe(0);
    expect(run(Array(SAMPLES * 3).fill(1000 / 30))).toBe(0);
  });

  it("does not count a pause (a held frame, a long task) as a frame", () => {
    const gaps = Array(SAMPLES - 1).fill(16);
    gaps.splice(10, 0, PAUSE_MS + 500);
    expect(run(gaps)).toBe(0);
  });

  it("does not count the wait between two runs of motion", () => {
    const w = new FrameWatch();
    let t = 0, slow = false;
    for (let run2 = 0; run2 < 10; run2++) {
      for (let k = 0; k < 10; k++) { t += 16; slow = w.push(t) || slow; }
      w.stop();
      t += 900;
    }
    expect(slow).toBe(false);
    /* nine gaps counted per run (the first frame of a run starts the clock): 90, of which 60 were judged */
    expect(w.count).toBe(90 - SAMPLES);
  });
});
