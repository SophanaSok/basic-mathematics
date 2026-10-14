/* The model loader: one GLTFLoader for the progress page, the form's GLB files read by
   stage and kept, so a form met twice is fetched and parsed once. A failure is kept too,
   for the page's life: a form that did not load is not asked for again in a loop (the
   view shows its drawn form instead, and a reload is the retry).

   The file is public/models/forms/form-<stage>.glb, the name tools/gen-forms.js gives it
   (this chunk does not hold the manifest, src/data/form-models.ts: tools/check-dist.js keeps
   that out of it, and the view, which has the manifest, only asks for stages it lists; a
   stage outside 1 to 5 is refused here). A file compressed with meshopt is refused, because
   its decoder is WebAssembly and the site's content security policy has not been opened
   for that: with no decoder set, GLTFLoader rejects it, and the reason says so. The loader's progress comes as bytes, with a total of 0 when the server does
   not say how long the file is. evict() frees what a form held on the graphics card and in
   memory: geometries, materials and their maps, and a skeleton's bone texture. */
import type { Group, Mesh, Material, Texture, BufferGeometry, SkinnedMesh } from "three";
import type { ThreeModel } from "./three.ts";
import type { ModelAsset, LoadState } from "./index.ts";

/** Frees every geometry, material, map and bone texture under `root`. Safe to call twice. */
export function disposeTree(root: Group): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if ((m as { isMesh?: boolean }).isMesh) {
      (m.geometry as BufferGeometry | undefined)?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat: Material | undefined) => {
        if (!mat) return;
        Object.values(mat).forEach((v) => { if (v && (v as Texture).isTexture) (v as Texture).dispose(); });
        mat.dispose();
      });
    }
    const sk = (o as SkinnedMesh).skeleton;
    if (sk) { sk.boneTexture?.dispose(); sk.dispose(); }
  });
}

function countTriangles(root: Group): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!(m as { isMesh?: boolean }).isMesh || !m.geometry) return;
    const g = m.geometry;
    n += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return Math.round(n);
}

export interface Loader {
  load(stage: number, root: string, onProgress?: (s: LoadState) => void): Promise<ModelAsset>;
  evict(keep: number[]): void;
}

export function createLoader(M: ThreeModel): Loader {
  const gltf = new M.GLTFLoader();
  const cache = new Map<number, Promise<ModelAsset>>();
  const done = new Map<number, ModelAsset>();

  function load(stage: number, root: string, onProgress?: (s: LoadState) => void): Promise<ModelAsset> {
    const have = cache.get(stage);
    if (have) return have;
    let p: Promise<ModelAsset>;
    if (!Number.isInteger(stage) || stage < 1 || stage > 5) p = Promise.reject(new Error("no model for stage " + stage));
    else {
      p = new Promise<ModelAsset>((resolve, reject) => {
        gltf.load(
          String(root || "") + "models/forms/form-" + stage + ".glb",
          (g) => {
            const asset: ModelAsset = { stage, scene: g.scene, clips: g.animations || [], triangles: countTriangles(g.scene) };
            done.set(stage, asset);
            resolve(asset);
          },
          (e) => { if (onProgress) onProgress({ stage, loaded: e.loaded || 0, total: e.total || 0 }); },
          (err) => {
            const why = err instanceof Error ? err.message : "";
            reject(/meshopt/i.test(why) ? new Error("the model for stage " + stage + " is meshopt-compressed, which this page cannot decode (the content security policy has no room for the decoder)") : err instanceof Error ? err : new Error("the model for stage " + stage + " did not load"));
          },
        );
      });
    }
    cache.set(stage, p);
    return p;
  }

  function evict(keep: number[]): void {
    done.forEach((asset, stage) => {
      if (keep.includes(stage)) return;
      disposeTree(asset.scene);
      done.delete(stage);
      cache.delete(stage);
    });
  }

  return { load, evict };
}
