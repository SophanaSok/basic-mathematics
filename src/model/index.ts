/* The door of the on-demand model chunk, bundle/form-model.js: what src/ui/form-view.ts
   imports with import() on the progress page, and nowhere else, so no map or chapter page
   fetches it. The Three.js it uses, src/vendor/three-model.js, is the chunk
   bundle/three-model.js, which comes with it (the GLTF loader and the room environment,
   and the core names beyond those of bundle/three.js).

   For now this makes the kit and holds Three.js. The loader, the environment, the looks
   and the emotes arrive in later cards (loader.ts, look.ts, env.ts) and are made from here. */

import type { ThreeModel } from "./three.ts";

export interface ModelKit {
  readonly three: ThreeModel;
  dispose(): void;
}

export async function createModelKit(): Promise<ModelKit> {
  const three = await import("../vendor/three-model.js");
  return { three, dispose() { /* nothing made yet */ } };
}
