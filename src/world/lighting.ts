/* One key light and an even ambient term, and the sky and fog of the region the camera
   is over.

   Three.js shades a toon face as (ambient + key × band) / π times its colour (its
   BRDF_Lambert divides by π; node_modules/three/src/renderers/shaders/ShaderChunk/
   lights_toon_pars_fragment.glsl.js), so with AMBIENT + KEY = π a face in the top band
   of the ramp (src/world/materials.ts) shows its token exactly. The key light is high
   (about 54 degrees), so every face turned up is in that band.

   The sky is a flat colour, the region's --region-sky, and the fog its --region-fog:
   between two regions (a flight, a drag along the path) both are mixed by how far the
   camera's target is from one row to the next. The fog starts a little beyond what the
   camera looks at, so what is in view keeps its colours and the far terraces fade. */

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

/**
 * Sky and fog for a camera whose target is at row `row` (0 at the front; between two
 * integers, between two regions) and `dist` from the camera.
 */
export function atmosphere(T: Three, scene: Scene, pal: PaletteMap, parts: string[], row: number, dist: number): void {
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
  const near = dist + 6, far = dist + 46;
  if (scene.fog && (scene.fog as { isFog?: boolean }).isFog) {
    scene.fog.color.copy(fog);
    (scene.fog as { near: number; far: number }).near = near;
    (scene.fog as { near: number; far: number }).far = far;
  } else {
    scene.fog = new T.Fog(fog, near, far);
  }
}
