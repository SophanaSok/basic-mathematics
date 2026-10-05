/* The quality tiers of the 3D world on the contents page, and which one a device gets.

     list    no 3D: the chapter list stands alone (it is always there, and always the
             accessible version; the canvas only mirrors it)
     low     3D at one device pixel, without antialiasing, with the fewest props and no
             idle motion
     medium  the default: more props, antialiased, up to 1.5 device pixels, a few
             seconds of idle motion after each input
     high    only when the learner chooses it: the most props, up to 2 device pixels

   Chosen automatically (detectTier), unless the learner chose otherwise in the settings
   sheet (bm.prefs.v1 gfx: "low" | "mid" | "high"; the 3D course map switch, map:
   "list", is the way to the list). Each tier caps the pixel ratio, the draw calls and
   the triangles (TIERS; the browser check tools/game/map.test.js holds the world to
   them, through BMMap3D.info()). A watchdog (FrameWatch) steps the world down one tier
   when its frames are slow, and the tier it settles on is kept in bm.prefs.v1 as gfxAuto,
   this device's alone, so the next visit starts there (for a quality the learner chose,
   only the list is kept: the step down from Low).

   This file is imported by the contents page's entry (src/entries/home.js) and by
   assets/map3d.js, before Three.js or the world chunk is asked for: nothing here
   touches Three.js, and nothing runs on import. */

export type Tier = "list" | "low" | "medium" | "high";
export type Quality = Exclude<Tier, "list">;

export interface Budget {
  /** the most device pixels per CSS pixel the canvas is drawn at */
  dpr: number;
  /** and the most pixels the drawing buffer may hold (a big screen gets fewer per CSS pixel) */
  pixels: number;
  /** the most draw calls in a frame */
  calls: number;
  /** the most triangles in the scene */
  triangles: number;
  /** props per region, 0 the fewest (src/world/props.ts) */
  detail: 0 | 1 | 2;
  /** idle motion for AMBIENT_MS after an input */
  ambient: boolean;
  /** asked for when the renderer is made; a step down keeps what it was made with */
  antialias: boolean;
}

/* The caps are what the world measured at each tier (BMMap3D.info() in headless
   Chromium, README "The course world") with room for a state that shows more marks:
   every chapter finished draws a flag, a pole and three stars on each island where an
   untouched course draws one boss. */
export const TIERS: Readonly<Record<Quality, Readonly<Budget>>> = {
  low: { dpr: 1, pixels: 1.2e6, calls: 10, triangles: 9000, detail: 0, ambient: false, antialias: false },
  medium: { dpr: 1.5, pixels: 2.1e6, calls: 12, triangles: 11000, detail: 1, ambient: true, antialias: true },
  high: { dpr: 2, pixels: 4.2e6, calls: 12, triangles: 14000, detail: 2, ambient: true, antialias: true }
};

/** how long idle motion runs after the last input, in ms; then the page asks for no frames */
export const AMBIENT_MS = 5000;
/** the watchdog: frames of animation averaging over SLOW_MS step the world down, judged
    every SAMPLES frames or every WINDOW_MS of frame time, whichever comes first (and not
    on fewer than MIN_SAMPLES), so a device that draws a few frames a second is judged
    within a few camera flights, not after the sixty frames that take it a dozen */
export const SLOW_MS = 34;
export const SAMPLES = 60;
export const WINDOW_MS = 2000;
export const MIN_SAMPLES = 8;
/** a gap between frames this long is a pause (a hidden tab, a long task), not a slow frame */
export const PAUSE_MS = 1000;

const ORDER: Tier[] = ["list", "low", "medium", "high"];

export function isTier(v: unknown): v is Tier { return typeof v === "string" && ORDER.indexOf(v as Tier) !== -1; }
/** one tier down: high, medium, low, list */
export function stepDown(t: Tier): Tier { return ORDER[Math.max(0, ORDER.indexOf(t) - 1)]; }
/** the lower of two tiers */
export function lower(a: Tier, b: Tier): Tier { return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b; }

/** what the page knows about the device; readProbe() gathers it in the browser */
export interface Probe {
  /** BM3D.supported(): WebGL 2, no Save-Data, no ?3d=off */
  supported: boolean;
  /** BM3D.why when it is not: "no-webgl" | "save-data" | "off" */
  unsupportedWhy: string;
  /** BM3D.lowEnd(): 2 GB of memory or less, which gets the low tier */
  lowEnd: boolean;
  /** the primary pointer is coarse (a finger) */
  coarse: boolean;
  /** navigator.hardwareConcurrency, 0 when the browser does not say */
  cores: number;
  /** the WebGL renderer's name, "" when the browser does not say */
  renderer: string;
}

/** the settings that bear on the tier: bm.prefs.v1 as assets/game.js prefs() normalises it */
export interface TierPrefs {
  map?: string;
  gfx?: string;
  gfxAuto?: string;
}

export interface Choice {
  tier: Tier;
  /** why: "chosen", "software", "coarse", "low-end", "default", "settled" for 3D; for the
      list the reason BMMap3D.why() gives: "no-webgl", "save-data", "off", "list", "slow" */
  why: string;
  /** the learner chose this quality in the settings sheet (the watchdog keeps nothing then) */
  chosen: boolean;
}

/* a renderer that draws on the CPU: SwiftShader (Chrome's fallback, and headless
   Chromium's), llvmpipe and softpipe (Mesa), WARP ("Microsoft Basic Render Driver") */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;
export function isSoftware(renderer: string): boolean { return SOFTWARE.test(renderer || ""); }

const CHOSEN: Record<string, Quality> = { low: "low", mid: "medium", high: "high" };

/**
 * The tier for this device and these settings. In order: no WebGL 2, Save-Data or
 * ?3d=off is the list; so is the 3D course map switch off, and a world that was too slow
 * even on the low tier on an earlier visit (gfxAuto "list", whether or not the quality
 * was the learner's choice: a new choice clears it); then a quality the learner chose;
 * then a software renderer, a coarse pointer with four cores or fewer, or a low-end
 * device (2 GB of memory or less) is low, and everything else medium (high is never
 * chosen for the learner); and never above the tier the watchdog settled on, on an
 * earlier visit.
 */
export function detectTier(probe: Probe, prefs: TierPrefs): Choice {
  if (!probe.supported) return { tier: "list", why: probe.unsupportedWhy || "no-webgl", chosen: false };
  if (prefs.map === "list") return { tier: "list", why: "list", chosen: true };
  if (prefs.gfxAuto === "list") return { tier: "list", why: "slow", chosen: false };
  const chosen = prefs.gfx ? CHOSEN[prefs.gfx] : undefined;
  if (chosen) return { tier: chosen, why: "chosen", chosen: true };
  let found: Choice = { tier: "medium", why: "default", chosen: false };
  if (isSoftware(probe.renderer)) found = { tier: "low", why: "software", chosen: false };
  else if (probe.coarse && probe.cores > 0 && probe.cores <= 4) found = { tier: "low", why: "coarse", chosen: false };
  else if (probe.lowEnd) found = { tier: "low", why: "low-end", chosen: false };
  const settled = prefs.gfxAuto;
  if (isTier(settled) && lower(settled, found.tier) === settled && settled !== found.tier) {
    return { tier: settled, why: settled === "list" ? "slow" : "settled", chosen: false };
  }
  return found;
}

/**
 * The pixel ratio to draw a w × h (CSS pixels) canvas at: the device's, held to the
 * tier's, and lowered further where the drawing buffer would pass the tier's pixel count,
 * but never below one device pixel per CSS pixel (or the device's own, if that is less).
 */
export function pixelRatio(budget: Budget, device: number, w: number, h: number): number {
  const dev = device > 0 ? device : 1;
  let r = Math.min(budget.dpr, dev);
  if (w > 0 && h > 0 && w * h * r * r > budget.pixels) r = Math.sqrt(budget.pixels / (w * h));
  return Math.max(Math.min(1, dev), Math.round(r * 100) / 100);
}

/**
 * The watchdog. push() is given the time of each frame drawn while something moves;
 * once it holds SAMPLES of them, or MIN_SAMPLES or more that add up to WINDOW_MS, it
 * answers whether their average was slower than SLOW_MS, and starts again. Counting time
 * as well as frames matters on the low tier, which has no idle motion: only camera
 * flights reach the watchdog there, and a 700 ms flight at five frames a second is four
 * frames, so sixty frames would take fifteen flights. A gap over PAUSE_MS (a frame held
 * while the tab was hidden, a long task) is not a frame time and is left out; stop()
 * marks the end of a run of motion, so the wait until the next one is not counted either
 * (the frames already gathered are kept for the next run).
 */
export class FrameWatch {
  private last = 0;
  private samples: number[] = [];
  private sum = 0;
  push(t: number): boolean {
    let slow = false;
    /* the same timestamp twice is one frame seen twice, not a frame drawn in no time */
    if (this.last && t === this.last) return false;
    if (this.last && t - this.last < PAUSE_MS) {
      this.samples.push(t - this.last);
      this.sum += t - this.last;
      const n = this.samples.length;
      if (n >= SAMPLES || (n >= MIN_SAMPLES && this.sum >= WINDOW_MS)) {
        slow = this.sum / n > SLOW_MS;
        this.samples = [];
        this.sum = 0;
      }
    }
    this.last = t;
    return slow;
  }
  stop(): void { this.last = 0; }
  reset(): void { this.last = 0; this.samples = []; this.sum = 0; }
  get count(): number { return this.samples.length; }
}

/* ------------------------------------------------------------ the browser ---- */

interface Loader {
  supported(): boolean;
  lowEnd?: () => boolean;
  why?: string;
  renderer?: string;
}

/** what this device is, read in the browser (the loader's own tests, then the pointer, the cores and the renderer) */
export function readProbe(loader: Loader, win: Window = window): Probe {
  const supported = !!loader.supported();
  let lowEnd = false;
  try { lowEnd = !!(loader.lowEnd && loader.lowEnd()); } catch { /* assume not */ }
  const coarse = !!(win.matchMedia && win.matchMedia("(pointer: coarse)").matches);
  const nav = win.navigator;
  return {
    supported,
    unsupportedWhy: supported ? "" : loader.why || "no-webgl",
    lowEnd,
    coarse,
    cores: (nav && nav.hardwareConcurrency) || 0,
    renderer: loader.renderer || ""
  };
}
