/* The course world's scene: what assets/map3d.js imports, on demand, once it knows the
   device gets 3D (src/world/tiers.ts) and Three.js is loaded. The build makes this and
   the modules it imports a chunk of their own, bundle/world.js (vite.config.ts
   bundleNames), so the contents page downloads it only when it draws the world, and no
   other page ever does.

   map3d.js keeps the camera, the pointer, the labels, the chapter list and the render
   loop; this file owns what is drawn: the terraces and props (regions.ts), the islands,
   path and gates, the progress marks (marks.ts), the marker (the learner's form), the lights, the sky and the
   fog (lighting.ts), and the colours (materials.ts). */

import type { Three } from "./three.ts";
import type { Group, Mesh, Object3D, Scene } from "three";
import { layout, rowAt, worldParts, DECK, ROW_Z, ROW_Y, STEP_X, type CourseShape, type WorldLayout } from "./layout.ts";
import { placeProps } from "./props.ts";
import { makeMaterials, readPalette, type PaletteMap } from "./materials.ts";
import { makeLights, atmosphere } from "./lighting.ts";
import { buildStatic, placePuffs, PUFF_MS, type StaticWorld } from "./regions.ts";
import { buildMarks, type IsleState, type Marks } from "./marks.ts";
import { buildForm, type FormLook } from "./forms.ts";

/** the form on the map stands this much smaller than the figure the progress page shows */
export const MARKER_SCALE = 0.75;

export { DECK, ROW_Z, ROW_Y, STEP_X, rowAt };
export { hubState } from "./state.ts";
export type { IsleState, WorldLayout };

export interface WorldScene {
  scene: Scene;
  layout: WorldLayout;
  /** the shapes the pointer is tested against (userData { isle, review? }) */
  pick(): import("three").Object3D[];
  curve(): import("three").CatmullRomCurve3;
  stones(): number;
  /** the "you are here" marker (a group: the learner's form stands under it, so it is the
      same object for the world's life) and the selection ring */
  marker: Object3D;
  select: Mesh;
  /** the selection ring's ink: the --region-ink of the Part it stands in, so it stands
      3:1 off that region's ground in either theme (tools/contrast-pairs.json) */
  selectIn(part: string): void;
  /** stand the learner's form of this stage (1..5) on the marker, its cloak in the hue of
      the Part: two draw calls, everything baked; a form built before is freed */
  setForm(stage: number, part: string): void;
  /** rebuild the still world at another level of detail (a tier change) */
  setDetail(detail: 0 | 1 | 2): void;
  /** the islands' progress, in layout order; which caps are "ahead" (not started) */
  setProgress(states: IsleState[], ahead: boolean[], doneGates: boolean[]): void;
  kinds(): Record<string, string>;
  /** read the tokens again and repaint (theme or panel changed) */
  repaint(): void;
  /** sky and fog for a camera target at depth z, `dist` from the camera; `fog` false
      draws without the fog (only for the check that it shows) */
  atmosphere(z: number, dist: number, fog?: boolean): void;
  /** the idle props at time t of the idle motion (ms); `on` false puts them at rest */
  idle(t: number, on: boolean): void;
  /** whether idle props are shown at all (not on the low tier) */
  showIdle(on: boolean): void;
  dispose(): void;
}

export interface WorldOptions {
  course: CourseShape;
  /** data/quest.js regions[part].motif, per Part in course order */
  motifs: (string | undefined)[];
  /** the element holding the token probes (one <i data-part> per Part) */
  probe: Element;
  detail: 0 | 1 | 2;
  /** the form the marker starts as (default: stage 1, in the first Part) */
  form?: { stage: number; part: string };
}

export function createWorld(T: Three, opts: WorldOptions): WorldScene {
  const L = layout(opts.course);
  const parts = worldParts(opts.course).map((p) => p.id);
  const scene = new T.Scene();
  const mats = makeMaterials(T);
  let pal: PaletteMap = readPalette(T, opts.probe);
  makeLights(T, scene);

  let still: StaticWorld = buildStatic(T, L, placeProps(L, opts.motifs, opts.detail), mats, pal);
  let marks: Marks | null = null;
  let states: IsleState[] = [];
  let idleShown = true;
  const addStatic = () => {
    scene.add(still.mesh, still.edges, ...still.pick);
    if (still.puffs) scene.add(still.puffs.mesh);
    if (still.telescope) scene.add(still.telescope.group);
    applyIdleShown();
  };
  const removeStatic = () => {
    scene.remove(still.mesh, still.edges, ...still.pick);
    if (still.puffs) scene.remove(still.puffs.mesh);
    if (still.telescope) scene.remove(still.telescope.group);
  };
  const applyIdleShown = () => { if (still.puffs) still.puffs.mesh.visible = idleShown; };

  const marker = new T.Group();
  marker.visible = false;
  let form: FormLook | null = null;
  const stand = (stage: number, part: string) => {
    if (form) { marker.remove(form.group); form.dispose(); }
    form = buildForm(T, stage, mats, pal, part, { live: false });
    form.group.scale.setScalar(MARKER_SCALE);
    marker.add(form.group);
  };
  const selectGeo = new T.TorusGeometry(1.66, 0.03, 4, 28);
  const select = new T.Mesh(selectGeo, mats.inkFill);
  select.rotation.x = -Math.PI / 2;
  select.visible = false;
  scene.add(marker, select);

  let ringPart = parts[0];
  const paintRing = () => { mats.inkFill.color.copy(pal.get("rink:" + ringPart) || pal.get("ink")!); };
  const paintOwn = () => {
    paintRing();
    mats.puff.color.copy(pal.get("under")!);
  };
  paintOwn();
  stand(opts.form ? opts.form.stage : 1, opts.form ? opts.form.part : parts[0]);
  addStatic();
  idle(0, false);

  function idle(t: number, on: boolean): void {
    if (still.puffs) placePuffs(T, still.puffs, on ? t : PUFF_MS * 0.35);
    if (still.telescope) still.telescope.group.rotation.y = still.telescope.heading + (on ? Math.sin((t / 9000) * Math.PI * 2) * 0.45 : 0);
  }

  let ahead: boolean[] = [], doneGates: boolean[] = [];
  /* a cap is the Part's hue, or faded toward the ground for a chapter not started; an
     arch is stone, or the hot gold once the chapter of its review set is finished */
  function capsAndGates(): void {
    still.caps.forEach((ranges, i) => ranges.forEach((r) => { r.key = (ahead[i] ? "ahead:" : "part:") + L.isles[i].part; }));
    still.arches.forEach((ranges, i) => ranges.forEach((r) => { r.key = doneGates[i] ? "hot" : "stone"; }));
    still.paint(pal);
  }

  return {
    scene, layout: L, marker, select,
    selectIn(part) { ringPart = part; paintRing(); },
    setForm: stand,
    pick: () => still.pick,
    curve: () => still.curve,
    stones: () => still.stones,
    setDetail(detail) {
      removeStatic();
      still.dispose();
      still = buildStatic(T, L, placeProps(L, opts.motifs, detail), mats, pal);
      addStatic();
      capsAndGates();
      idle(0, false);
    },
    setProgress(next, aheadNext, gatesNext) {
      states = next; ahead = aheadNext; doneGates = gatesNext;
      if (marks) { scene.remove(marks.mesh, marks.edges); marks.dispose(); }
      marks = buildMarks(T, L, states, mats, pal);
      scene.add(marks.mesh, marks.edges);
      capsAndGates();
    },
    kinds: () => (marks ? marks.kinds : {}),
    repaint() {
      pal = readPalette(T, opts.probe);
      paintOwn();
      if (form) form.paint(pal);
      still.paint(pal);
      if (marks) marks.paint(pal);
    },
    atmosphere(z, dist, fog = true) { atmosphere(T, scene, pal, parts, rowAt(z, parts.length), dist, fog); },
    idle,
    showIdle(on) { idleShown = on; applyIdleShown(); },
    dispose() {
      removeStatic();
      still.dispose();
      if (marks) marks.dispose();
      if (form) form.dispose();
      selectGeo.dispose();
      mats.dispose();
    }
  };
}
