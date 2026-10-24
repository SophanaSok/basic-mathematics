/* Mochi's pool (docs/decisions/0015-mochi-pool.md), the lazy `pet` chunk (bundle/pet.js).
   Only src/ui/companion.ts's openPool() imports this module, with import(), and nothing
   fetches the chunk until then. This is the stub with the final signature; card X-5b fills
   it (the dialog and inline pool, the stage, the shop tab). It builds no DOM yet. */
import { createMochiStage } from "../../mochi/index.ts";

export interface PoolHandle { close(): void; dispose(): void }

export function mountPool(host: Element, opts: { mode: "dialog" | "inline" }): PoolHandle {
  void createMochiStage; void opts;   /* X-5b: the stage is made here, so the chunk graph is the real one */
  host.setAttribute("data-pet-state", "stub");
  return { close(): void { /* X-5b */ }, dispose(): void { /* X-5b */ } };
}
