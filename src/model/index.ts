/* The door of the on-demand model chunk, bundle/form-model.js: what src/ui/form-view.ts
   imports with import() on the progress page, and nowhere else, so no map or chapter page
   fetches it. The Three.js it uses, src/vendor/three-model.js, is the chunk
   bundle/three-model.js, which comes with it (the GLTF loader and the room environment,
   and the core names beyond those of bundle/three.js).

   The kit holds the loader (loader.ts: a form's GLB, fetched once and kept), and makes the
   looks (look.ts: a loaded figure tinted, lit and animated) and the environment (env.ts:
   the room light and the shadow ground). The view (a later card) decides when to ask. */
import type { Group, AnimationClip, WebGLRenderer } from "three";
import type { Quality } from "../world/tiers.ts";
import type { ThreeModel } from "./three.ts";
import { createLoader } from "./loader.ts";
import { makeLook, type ModelLook } from "./look.ts";
import { makeEnv, type ModelEnv } from "./env.ts";

export type { ModelLook, ModelEnv };

export interface ModelAsset { stage: number; scene: Group; clips: AnimationClip[]; triangles: number }
export interface LoadState { stage: number; loaded: number; total: number }

export interface ModelKit {
  readonly three: ThreeModel;
  /** Cached per stage; rejects on a 404, a parse error, an unknown stage or a meshopt file. */
  load(stage: number, root: string, onProgress?: (s: LoadState) => void): Promise<ModelAsset>;
  preload(stage: number, root: string): void;
  /** Disposes the cached assets of every stage not in `keep`. */
  evict(keep: number[]): void;
  makeLook(asset: ModelAsset, still: boolean): ModelLook;
  makeEnv(renderer: WebGLRenderer, tier: Quality): ModelEnv;
  /** Sets the renderer up for the models (sRGB, ACES, soft shadows); returns a function that puts the previous settings back. */
  setupRenderer(renderer: WebGLRenderer): () => void;
  dispose(): void;
}

/** How long the view waits for a load before it shows the drawn form instead. */
export const LOAD_TIMEOUT_MS = 10000;

export async function createModelKit(): Promise<ModelKit> {
  const three = await import("../vendor/three-model.js");
  const M = three;
  const loader = createLoader(three);
  return {
    three,
    load: loader.load,
    preload(stage, root) { loader.load(stage, root).catch(() => { /* the failure is kept; nothing to do */ }); },
    evict: loader.evict,
    makeLook: (asset, still) => makeLook(three, asset, still),
    makeEnv: (renderer, tier) => makeEnv(three, renderer, tier),
    setupRenderer(renderer) {
      const was = {
        out: renderer.outputColorSpace, tone: renderer.toneMapping, exposure: renderer.toneMappingExposure,
        shadows: renderer.shadowMap.enabled, type: renderer.shadowMap.type,
      };
      renderer.outputColorSpace = M.SRGBColorSpace;
      renderer.toneMapping = M.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = M.PCFSoftShadowMap;
      return () => {
        renderer.outputColorSpace = was.out;
        renderer.toneMapping = was.tone;
        renderer.toneMappingExposure = was.exposure;
        renderer.shadowMap.enabled = was.shadows;
        renderer.shadowMap.type = was.type;
      };
    },
    dispose() { loader.evict([]); },
  };
}
