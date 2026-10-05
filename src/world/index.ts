/* The course world's scene: what assets/map3d.js imports, on demand, once it knows the
   device gets 3D (src/world/tiers.ts) and Three.js is loaded. The build makes this and
   the modules it imports a chunk of their own, bundle/world.js (vite.config.ts
   bundleNames), so the contents page downloads it only when it draws the world, and no
   other page ever does.

   map3d.js keeps the camera, the pointer, the labels, the chapter list and the render
   loop; this file owns what is drawn: the terraces and props (regions.ts), the islands,
   path and gates, the progress marks (marks.ts), the marker, the lights, the sky and the
   fog (lighting.ts), and the colours (materials.ts). */

import type { Three } from "./three.ts";
import type { Mesh, Scene } from "three";
import { layout, rowAt, DECK, ROW_Z, ROW_Y, STEP_X, type CourseShape, type WorldLayout } from "./layout.ts";
import { placeProps } from "./props.ts";
import { makeMaterials, readPalette, type PaletteMap } from "./materials.ts";
import { makeLights, atmosphere } from "./lighting.ts";
import { buildStatic, placePuffs, PUFF_MS, type StaticWorld } from "./regions.ts";
import { buildMarks, type IsleState, type Marks } from "./marks.ts";

export { DECK, ROW_Z, ROW_Y, STEP_X, rowAt };
export type { IsleState, WorldLayout };

export interface WorldScene {
  scene: Scene;
  layout: WorldLayout;
  /** the shapes the pointer is tested against (userData { isle, review? }) */
  pick(): import("three").Object3D[];
  curve(): import("three").CatmullRomCurve3;
  stones(): number;
  /** the "you are here" marker and the selection ring */
  marker: Mesh;
  select: Mesh;
  /** rebuild the still world at another level of detail (a tier change) */
  setDetail(detail: 0 | 1 | 2): void;
  /** the islands' progress, in layout order; which caps are "ahead" (not started) */
  setProgress(states: IsleState[], ahead: boolean[], doneGates: boolean[]): void;
  kinds(): Record<string, string>;
  /** read the tokens again and repaint (theme or panel changed) */
  repaint(): void;
  /** sky and fog for a camera target at depth z, `dist` from the camera */
  atmosphere(z: number, dist: number): void;
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
}

export function createWorld(T: Three, opts: WorldOptions): WorldScene {
  const L = layout(opts.course);
  const parts = opts.course.parts.map((p) => p.id);
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

  const markerGeo = new T.OctahedronGeometry(0.3, 0);
  const markerEdges = new T.EdgesGeometry(markerGeo, 25);
  const marker = new T.Mesh(markerGeo, mats.accent);
  marker.add(new T.LineSegments(markerEdges, mats.ink));
  marker.scale.set(1, 1.45, 1);
  marker.visible = false;
  const selectGeo = new T.TorusGeometry(1.66, 0.03, 4, 28);
  const select = new T.Mesh(selectGeo, mats.inkFill);
  select.rotation.x = -Math.PI / 2;
  select.visible = false;
  scene.add(marker, select);

  /* the marker's edges are plain ink, painted on the line material's vertex colours */
  const markerInk = () => {
    const n = markerEdges.getAttribute("position").count;
    const c = pal.get("ink")!;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    markerEdges.setAttribute("color", new T.BufferAttribute(arr, 3));
  };
  const paintOwn = () => {
    mats.accent.color.copy(pal.get("accent")!);
    mats.inkFill.color.copy(pal.get("ink")!);
    mats.puff.color.copy(pal.get("under")!);
    markerInk();
  };
  paintOwn();
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
      still.paint(pal);
      if (marks) marks.paint(pal);
    },
    atmosphere(z, dist) { atmosphere(T, scene, pal, parts, rowAt(z, parts.length), dist); },
    idle,
    showIdle(on) { idleShown = on; applyIdleShown(); },
    dispose() {
      removeStatic();
      still.dispose();
      if (marks) marks.dispose();
      markerGeo.dispose(); markerEdges.dispose(); selectGeo.dispose();
      mats.dispose();
    }
  };
}
