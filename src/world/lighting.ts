/* One key light and an even ambient term, and the sky and fog of the region the camera
   is over.

   Three.js shades a toon face as (ambient + key × band) / π times its colour (its
   BRDF_Lambert divides by π; node_modules/three/src/renderers/shaders/ShaderChunk/
   lights_toon_pars_fragment.glsl.js), so with AMBIENT + KEY = π a face in the top band
   of the ramp (src/world/materials.ts) shows its token exactly. The key light is high
   (about 54 degrees), so every face turned up is in that band.

   The sky is a flat colour, the region's --region-sky, and the fog its --region-fog:
   between two regions (a flight, a drag along the path) both are mixed by how far the
   camera's target is from one row to the next.

   Fog in Three.js is linear in a point's depth along the view (not its distance), from
   none at `near` to all fog at `far`. The camera looks down at the target at about 43
   degrees (assets/map3d.js DIR), so the terrace it frames lies between about 5 units in
   front of the target's depth and 4 behind it, the islands on the terrace behind stand
   about 5 behind it, and that terrace's back edge 8.5; the one after that, 7.5 to 14.
   So the fog starts FOG_NEAR behind the target, where the framed terrace ends (it keeps
   its colours exactly), and is whole FOG_FAR behind it: the islands of the row behind
   are touched by it, that terrace's back fades by about a third toward --region-fog, and
   what is further back (the next terraces, the Observatory's far hills) by half or more.
   tools/game/map.test.js holds this to it: drawn without the fog, the frame changes, and
   the framed row's islands do not. */

import type { Three } from "./three.ts";
import type { AmbientLight, DirectionalLight, Scene } from "three";
import type { PaletteMap } from "./materials.ts";

export const AMBIENT = 0.3 * Math.PI;
export const KEY = 0.7 * Math.PI;
export const KEY_AT: [number, number, number] = [-4, 10, 6];

export function makeLights(T: Three, scene: Scene): { key: DirectionalLight; ambient: AmbientLight } {
  const ambient = new T.AmbientLight(new T.Color(1, 1, 1), AMBIENT);
  const key = new T.DirectionalLight(new T.Color(1, 1, 1), KEY);
  key.position.set(KEY_AT[0], KEY_AT[1], KEY_AT[2]);
  scene.add(ambient, key);
  return { key, ambient };
}

export const FOG_NEAR = 4;
export const FOG_FAR = 16;

/** where the fog starts and is whole, for a camera `dist` from its target */
export function fogRange(dist: number): [number, number] {
  return [dist + FOG_NEAR, dist + FOG_FAR];
}

/**
 * Sky and fog for a camera whose target is at row `row` (0 at the front; between two
 * integers, between two regions) and `dist` from the camera.
 */
export function atmosphere(T: Three, scene: Scene, pal: PaletteMap, parts: string[], row: number, dist: number, fogOn = true): void {
  if (!parts.length) return;
  const a = Math.max(0, Math.min(parts.length - 1, Math.floor(row)));
  const b = Math.min(parts.length - 1, a + 1);
  const k = Math.max(0, Math.min(1, row - a));
  const mix = (name: string) => {
    const c = (pal.get(name + ":" + parts[a]) || new T.Color(0.5, 0.5, 0.5)).clone();
    const d = pal.get(name + ":" + parts[b]);
    return d ? c.lerp(d, k) : c;
  };
  const sky = mix("sky"), fog = mix("fog");
  if (scene.background && (scene.background as { isColor?: boolean }).isColor) (scene.background as typeof sky).copy(sky);
  else scene.background = sky;
  const [near, far] = fogRange(dist);
  if (!fogOn) {
    scene.fog = null;
  } else if (scene.fog && (scene.fog as { isFog?: boolean }).isFog) {
    scene.fog.color.copy(fog);
    (scene.fog as { near: number; far: number }).near = near;
    (scene.fog as { near: number; far: number }).far = far;
  } else {
    scene.fog = new T.Fog(fog, near, far);
  }
}
