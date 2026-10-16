/* The bloom's numbers and its composer: a soft glow on colour brighter than white, drawn
   only on the high tier (R2 design 3.14). The build makes this file a chunk of its own,
   bundle/post.js (vite.config.ts bundleNames), and assets/map3d.js imports it with
   import() beside src/vendor/three-post.js (bundle/three-post.js), only when the bloom is
   on. Nothing in the world imports it statically, so a map below the high tier never
   downloads it. Both chunks together are held to 15 KB over the wire by check-dist.

   The render targets never exceed POST_PIXELS, whatever the canvas size: postSize scales
   them down and the final pass stretches the result to the canvas. Targets are half
   float, so a value above 1 survives to the bloom's threshold; a renderer that cannot
   draw to half float gets no bloom (makeBloom returns null). */

/** the most pixels the bloom's render targets hold (2.1 megapixels, a little over 1080p) */
export const POST_PIXELS = 2.1e6;
/** only colour above this glows, so an ordinary toon-shaded surface (at most 1) never does */
export const BLOOM_THRESHOLD = 1.05;
const BLOOM_RADIUS = 0.4;

export type PostTheme = "light" | "dark";

/** the glow's strength: 0.55 on the dark theme, where a glow reads against the sky; 0 on the
 *  light theme, which has no bloom (owner O16: its glow tokens are dark, so lifting them past
 *  white would turn the glow props neon; assets/map3d.js never builds the bloom there). Never above 1 */
export function bloomStrength(theme: PostTheme): number {
  return theme === "dark" ? 0.55 : 0;
}

/** the render-target size in pixels for a canvas of width x height CSS pixels at device
 *  pixel ratio dpr: the canvas's own size, scaled down (aspect kept) until it holds at
 *  most POST_PIXELS, and never less than 1 x 1 */
export function postSize(width: number, height: number, dpr: number): { width: number; height: number } {
  const w = Math.max(1, width * dpr), h = Math.max(1, height * dpr);
  const k = Math.min(1, Math.sqrt(POST_PIXELS / (w * h)));
  let rw = Math.max(1, Math.floor(w * k)), rh = Math.max(1, Math.floor(h * k));
  while (rw * rh > POST_PIXELS && (rw > 1 || rh > 1)) { if (rw >= rh) rw--; else rh--; }
  return { width: rw, height: rh };
}

export interface BloomOptions {
  theme: PostTheme;
  /** the renderer was made with antialias (the high tier): the composer's targets then take 4 samples,
      as the canvas's own would, so the edges stay as crisp with the bloom as without it */
  antialias?: boolean;
  /** the canvas's CSS size and the device pixel ratio it is drawn at */
  width: number;
  height: number;
  dpr: number;
}

export interface Bloom {
  /** draw the scene through the passes, to the canvas */
  render(): void;
  setSize(width: number, height: number, dpr: number): void;
  /** the glow's strength follows the theme */
  setTheme(theme: PostTheme): void;
  dispose(): void;
  /** the render targets' size now, in pixels (never over POST_PIXELS) */
  size(): { width: number; height: number };
  /** the glow's strength now */
  strength(): number;
  /** the passes, and the pixels each draws (for BMMap3D.info().post) */
  passes: unknown[];
}

/* The parts of Three.js's renderer and the three-post namespace makeBloom touches, loosely
   typed: the namespace is handed in (the chunk is imported on demand), not imported. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function makeBloom(T: any, P: any, renderer: any, scene: any, camera: any, opts: BloomOptions): Bloom | null {
  const ext = renderer && renderer.extensions;
  if (!ext || !(ext.has("EXT_color_buffer_half_float") || ext.has("EXT_color_buffer_float"))) return null;
  const size = postSize(opts.width, opts.height, opts.dpr);
  /* the composer's own targets are half float but not multisampled, so with antialias on the
     renderer a target of ours stands in: half float explicitly (the composer clones it), 4 samples */
  let target: any;
  let composer: any;
  const passes: any[] = [];
  /* whatever a failed step already built is disposed, then the error goes on to the caller */
  const undo = () => {
    passes.forEach((p: any) => { try { if (p.dispose) p.dispose(); } catch { /* already gone */ } });
    try { if (target && target.dispose) target.dispose(); } catch { /* already gone */ }
    try { if (composer && composer.dispose) composer.dispose(); } catch { /* already gone */ }
  };
  let bloom: any;
  try {
    target = opts.antialias
      ? new T.WebGLRenderTarget(size.width, size.height, { type: T.HalfFloatType, samples: 4 })
      : undefined;
    composer = new P.EffectComposer(renderer, target);
    composer.setPixelRatio(1);
    composer.setSize(size.width, size.height);
    bloom = new P.UnrealBloomPass(new T.Vector2(size.width, size.height), bloomStrength(opts.theme), BLOOM_RADIUS, BLOOM_THRESHOLD);
    passes.push(new P.RenderPass(scene, camera));
    passes.push(bloom);
    passes.push(new P.OutputPass());
    passes.forEach(p => composer.addPass(p));
  } catch (e) {
    undo();
    throw e;
  }
  let now = size;
  return {
    render() { composer.render(); },
    setSize(width: number, height: number, dpr: number) {
      now = postSize(width, height, dpr);
      composer.setSize(now.width, now.height);
    },
    setTheme(theme: PostTheme) { bloom.strength = bloomStrength(theme); },
    size: () => now,
    strength: () => bloom.strength,
    dispose: undo,
    passes
  };
}
