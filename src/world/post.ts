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

/** the glow's strength: gentle on the light theme (owner default O16), fuller on dark,
 *  where a glow reads better against the sky; never above 1 */
export function bloomStrength(theme: PostTheme): number {
  return theme === "light" ? 0.3 : 0.55;
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
  /** the canvas's CSS size and the device pixel ratio it is drawn at */
  width: number;
  height: number;
  dpr: number;
}

export interface Bloom {
  /** draw the scene through the passes, to the canvas */
  render(): void;
  setSize(width: number, height: number, dpr: number): void;
  dispose(): void;
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
  const composer = new P.EffectComposer(renderer);   /* its targets are half float */
  composer.setPixelRatio(1);
  composer.setSize(size.width, size.height);
  const bloom = new P.UnrealBloomPass(new T.Vector2(size.width, size.height), bloomStrength(opts.theme), BLOOM_RADIUS, BLOOM_THRESHOLD);
  const passes = [new P.RenderPass(scene, camera), bloom, new P.OutputPass()];
  passes.forEach(p => composer.addPass(p));
  return {
    render() { composer.render(); },
    setSize(width: number, height: number, dpr: number) {
      const s = postSize(width, height, dpr);
      composer.setSize(s.width, s.height);
    },
    dispose() {
      passes.forEach((p: any) => { if (p.dispose) p.dispose(); });
      if (composer.dispose) composer.dispose();
    },
    passes
  };
}
