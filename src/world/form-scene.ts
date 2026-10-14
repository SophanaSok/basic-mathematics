/* The scene for one form on the progress page: the form of a stage, the world's own
   materials and light, a transparent background (the renderer is alpha, so the page's
   panel shows through) and a camera in front and a little above it that frames the whole
   figure. Three.js is handed in as `T`, as for the rest of src/world/; nothing here
   touches the page but reading the colour tokens from the probe (materials.ts).

   The figure is the drawn one (forms.ts, lit by the world's toon lights) or a loaded model
   (src/model/look.ts, lit by the model environment the view attaches): adopt() swaps a
   model in and hides the toon lights, show() puts the drawn form back and its lights on.
   pose() turns the camera round the figure (the view's Orbit decides the numbers); with
   the default pose the picture is the one the scene always had. The drawn form's
   materials are not tone mapped, so it looks the same under the renderer's ACES.

   src/ui/form-view.ts owns the renderer and asks for this file once Three.js is in. */

import type { Three } from "./three.ts";
import type { Group, Mesh, PerspectiveCamera, Scene, Material, Light } from "three";
import type { ModelLook } from "../model/look.ts";
import { buildForm, type FormLook } from "./forms.ts";
import { makeMaterials, readPalette, type PaletteMap, type WorldMaterials } from "./materials.ts";
import { makeLights } from "./lighting.ts";

/** the camera's field of view (degrees), and how far above level it looks down (radians) */
export const FOV = 30;
export const PITCH = 0.3;
/** the room around the figure: its height times this fits the view */
const MARGIN = 1.3;

/** the figure now shown: the drawn form or a loaded model */
export type Figure = FormLook | ModelLook;
/** where the camera stands: radians round the vertical, radians above level, and a zoom (1 = framed) */
export interface Pose { yaw: number; pitch: number; zoom: number }

const isModel = (f: Figure): f is ModelLook => (f as ModelLook).kind === "model";

export interface FormScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** the figure now shown, if any */
  readonly look: Figure | null;
  /** swap in a loaded model (the last figure is disposed), tinted with the Part's hue and
      framed; `height` is the manifest's, used when the group has no bounds */
  adopt(look: ModelLook, part: string, height: number): void;
  /** the camera round the figure (see Pose); the default pose is the framing show() gives */
  pose(p: Pose): void;
  /** a model is running a clip, a fade or its idle loop: frames are still needed */
  active(): boolean;
  /** show the drawn form of a stage (1..5) in the hue of a Part: the last figure is disposed, the new one built live */
  show(stage: number, part: string): void;
  /** the idle motion at time t (ms): the drawn form's live parts, or a model's clock and idle loop; `on` false puts them at rest */
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
  const lights: Light[] = Object.values(makeLights(T, scene));
  mats.solid.toneMapped = false;
  mats.ink.toneMapped = false;
  const camera = new T.PerspectiveCamera(FOV, 4 / 5, 0.1, 100);
  let look: Figure | null = null;
  let view: Pose = { yaw: 0, pitch: PITCH, zoom: 1 };
  let idleOn = false, lastT = 0;
  let stage = 1, part = "";
  let aspect = 4 / 5;
  const box = new T.Box3();
  const size = new T.Vector3();

  /* the distance at which the figure's height (and its width, in a narrow view) fits */
  let fh = 1, fw = 1, fz = 0, cy = 0.5;
  function measure(fallback: number): void {
    if (!look) return;
    box.setFromObject(look.group as Group);
    if (box.isEmpty()) {
      fh = Math.max(fallback, 0.1);
      fw = fh * 0.5;
      fz = 0; cy = fh * 0.5;
      return;
    }
    box.getSize(size);
    fh = Math.max(look.height, size.y, 0.1);
    fw = Math.max(size.x, size.z, 0.1);
    fz = size.z;
    /* both stand on the origin and the camera turns round its vertical axis there; a
       model's height centre is the box's (a staff must not swing the body off the axis) */
    cy = isModel(look) ? (box.min.y + box.max.y) / 2 : fh * 0.5;
  }
  /* the toon materials of a loaded group are the file's; the drawn form's (the halo's
     included) are made here or in forms.ts, and none is tone mapped */
  function untone(g: Group): void {
    g.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.toneMapped = false; });
    });
  }
  function drop(): void {
    if (!look) return;
    scene.remove(look.group);
    look.dispose();
    look = null;
    idleOn = false;
  }
  function place(): void {
    if (!look) return;
    const h = fh, w = fw;
    const half = (FOV * Math.PI) / 360;
    const fitH = (h * MARGIN) / 2 / Math.tan(half);
    const fitW = (w * MARGIN) / 2 / (Math.tan(half) * aspect);
    const dist = (Math.max(fitH, fitW) + fz / 2) / view.zoom;
    const flat = Math.cos(view.pitch) * dist;
    camera.position.set(Math.sin(view.yaw) * flat, cy + Math.sin(view.pitch) * dist, Math.cos(view.yaw) * flat);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
  }

  return {
    scene, camera,
    get look() { return look; },
    adopt(next, p, height) {
      drop();
      part = p;
      look = next;
      scene.add(next.group);
      lights.forEach((l) => { l.visible = false; });
      const c = pal.get("part:" + part);
      if (c) next.tint(c);
      measure(height);
      place();
    },
    show(n, p) {
      stage = n;
      part = p;
      drop();
      lights.forEach((l) => { l.visible = true; });
      const f = buildForm(T, stage, mats, pal, part);
      look = f;
      scene.add(f.group);
      untone(f.group);
      measure(f.height);
      place();
    },
    pose(p) {
      view = { yaw: p.yaw, pitch: p.pitch, zoom: p.zoom > 0 ? p.zoom : 1 };
      place();
    },
    active() { return !!look && isModel(look) && look.active(); },
    idle(t, on) {
      if (!look) return;
      if (!isModel(look)) { look.idle(t, on); return; }
      if (on !== idleOn) { idleOn = on; look.setIdle(on); lastT = t; }
      look.tick(Math.max(0, t - lastT));
      lastT = t;
    },
    repaint() {
      pal = readPalette(T, probe);
      if (!look) return;
      if (isModel(look)) { const c = pal.get("part:" + part); if (c) look.tint(c); }
      else look.paint(pal);
    },
    frame(w, h) {
      if (!(w > 0 && h > 0)) return;
      aspect = w / h;
      camera.aspect = aspect;
      place();
    },
    dispose() {
      drop();
      mats.dispose();
    }
  };
}
