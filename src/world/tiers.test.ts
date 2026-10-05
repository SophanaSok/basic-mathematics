import { describe, expect, it } from "vitest";
import { detectTier, FrameWatch, isSoftware, lower, MIN_SAMPLES, PAUSE_MS, pixelRatio, SAMPLES, SLOW_MS, stepDown, TIERS, WINDOW_MS, type Probe } from "./tiers.ts";

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
    expect(tier({}, { gfx: "high", gfxAuto: "low" }).tier).toBe("high");
  });

  it("keeps the list a world too slow even on low gave back, chosen quality or not, until a new choice clears it", () => {
    /* a learner who chose Low on a device that cannot draw even that does not pay for
       Three.js and the world's chunk again on every visit (setPref clears gfxAuto on any
       choice of quality or of the map, tools/game/rules.test.js) */
    expect(tier({}, { gfx: "low", gfxAuto: "list" })).toEqual({ tier: "list", why: "slow", chosen: false });
    expect(tier({}, { gfx: "high", gfxAuto: "list" }).tier).toBe("list");
    expect(tier({}, { map: "3d", gfxAuto: "list" }).tier).toBe("list");
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

  it("gives a low-end device (2 GB or less) the low tier, not the list: the list is only for no WebGL 2, Save-Data or the learner's choice", () => {
    expect(tier({ lowEnd: true })).toEqual({ tier: "low", why: "low-end", chosen: false });
    expect(tier({ lowEnd: true }, { map: "3d" }).tier).toBe("low");
    expect(tier({ lowEnd: true }, { gfx: "mid" }).tier).toBe("medium");
    expect(tier({ lowEnd: true, renderer: "SwiftShader" }).why).toBe("software");
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
    /* just over SLOW_MS, SAMPLES frames take less than WINDOW_MS: judged by the count */
    const gap = SLOW_MS + 1;
    expect(gap * SAMPLES).toBeLessThan(WINDOW_MS + SAMPLES * 2);
    expect(run(Array(SAMPLES).fill(gap))).toBe(1);
    expect(run(Array(SAMPLES * 2).fill(gap))).toBe(2);
    expect(run(Array(Math.min(SAMPLES, Math.ceil(WINDOW_MS / gap)) - 1).fill(gap))).toBe(0);
  });

  it("says slow after WINDOW_MS of slow frames too, so a few frames a second are judged within a few flights", () => {
    /* five frames a second: four frames to a 700 ms camera flight, the first of which
       starts the clock, so three gaps a flight; judged within four flights, not fifteen */
    const w = new FrameWatch();
    let t = 0, flights = 0, slow = false;
    while (!slow && flights < 20) {
      for (let k = 0; k < 4 && !slow; k++) { t += 200; slow = w.push(t); }
      w.stop();
      t += 2500;
      flights++;
    }
    expect(slow).toBe(true);
    expect(flights).toBeLessThanOrEqual(4);
    /* but never on fewer than MIN_SAMPLES frames */
    expect(run(Array(MIN_SAMPLES - 1).fill(PAUSE_MS - 1))).toBe(0);
    expect(run(Array(MIN_SAMPLES).fill(PAUSE_MS - 1))).toBe(1);
  });

  it("does not judge a fast run early: a window of frames at 60 a second with one long hitch passes", () => {
    const gaps = Array(SAMPLES * 3).fill(1000 / 60);
    gaps.splice(30, 0, PAUSE_MS - 1);
    expect(run(gaps)).toBe(0);
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

  it("does not count a frame seen twice (the same timestamp) as a frame drawn in no time", () => {
    /* slow frames, each handed over twice, as two loops side by side would: still slow */
    const w = new FrameWatch();
    let t = 1000, slow = 0;
    w.push(t);
    const gap = SLOW_MS + 6, n = Math.min(SAMPLES, Math.ceil(WINDOW_MS / gap));
    for (let k = 0; k < n; k++) { t += gap; if (w.push(t)) slow++; if (w.push(t)) slow++; }
    expect(slow).toBe(1);
    expect(w.count).toBe(0);
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
