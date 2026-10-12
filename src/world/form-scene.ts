/* The scene for one form on the progress page: the form of a stage, the world's own
   materials and light, a transparent background (the renderer is alpha, so the page's
   panel shows through) and a camera in front and a little above it that frames the whole
   figure. Three.js is handed in as `T`, as for the rest of src/world/; nothing here
   touches the page but reading the colour tokens from the probe (materials.ts).

   src/ui/form-view.ts owns the renderer and asks for this file once Three.js is in. */

import type { Three } from "./three.ts";
import type { Group, PerspectiveCamera, Scene } from "three";
import { buildForm, type FormLook } from "./forms.ts";
import { makeMaterials, readPalette, type PaletteMap, type WorldMaterials } from "./materials.ts";
import { makeLights } from "./lighting.ts";

/** the camera's field of view (degrees), and how far above level it looks down (radians) */
export const FOV = 30;
export const PITCH = 0.3;
/** the room around the figure: its height times this fits the view */
const MARGIN = 1.3;

export interface FormScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** the figure now shown, if any */
  readonly look: FormLook | null;
  /** show a stage (1..5) in the hue of a Part: the last form is disposed, the new one built live */
  show(stage: number, part: string): void;
  /** the live parts at time t (ms) of the idle motion; `on` false puts them at rest */
  idle(t: number, on: boolean): void;
  /** read the palette again (a theme or panel change) and paint the form with it */
  repaint(): void;
  /** the view is w × h CSS pixels: the aspect, and the camera placed to frame the form */
  frame(w: number, h: number): void;
  dispose(): void;
}

export function createFormScene(T: Three, probe: Element): FormScene {
  const mats: WorldMaterials = makeMaterials(T);
  let pal: PaletteMap = readPalette(T, probe);
  const scene = new T.Scene();
  makeLights(T, scene);
  const camera = new T.PerspectiveCamera(FOV, 4 / 5, 0.1, 100);
  let look: FormLook | null = null;
  let stage = 1, part = "";
  let aspect = 4 / 5;
  const box = new T.Box3();
  const size = new T.Vector3();

  /* the distance at which the figure's height (and its width, in a narrow view) fits */
  let fh = 1, fw = 1, fz = 0;
  function measure(): void {
    if (!look) return;
    box.setFromObject(look.group as Group);
    box.getSize(size);
    fh = Math.max(look.height, size.y, 0.1);
    fw = Math.max(size.x, size.z, 0.1);
    fz = size.z;
  }
  function place(): void {
    if (!look) return;
    const h = fh, w = fw;
    const half = (FOV * Math.PI) / 360;
    const fitH = (h * MARGIN) / 2 / Math.tan(half);
    const fitW = (w * MARGIN) / 2 / (Math.tan(half) * aspect);
    const dist = Math.max(fitH, fitW) + fz / 2;
    const cy = h * 0.5;
    camera.position.set(0, cy + Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
  }

  return {
    scene, camera,
    get look() { return look; },
    show(n, p) {
      stage = n;
      part = p;
      if (look) { scene.remove(look.group); look.dispose(); look = null; }
      look = buildForm(T, stage, mats, pal, part);
      scene.add(look.group);
      measure();
      place();
    },
    idle(t, on) { if (look) look.idle(t, on); },
    repaint() {
      pal = readPalette(T, probe);
      if (look) look.paint(pal);
    },
    frame(w, h) {
      if (!(w > 0 && h > 0)) return;
      aspect = w / h;
      camera.aspect = aspect;
      place();
    },
    dispose() {
      if (look) { scene.remove(look.group); look.dispose(); look = null; }
      mats.dispose();
    }
  };
}
