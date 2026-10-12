/* The learner's form: the avatar that stands for them in the course world and on the
   progress page, in five stages (src/data/forms.ts names them and says which level
   unlocks each; src/core/forms.ts says which a learner has). This file only draws.

   Each stage is a figure made of the world's own primitives, built with the Kit into one
   toon mesh with vertex colours and one set of ink edges (src/world/batch.ts), painted
   with the colour names the world uses (src/world/materials.ts): the body in `accent`,
   paper and stone trims, gold (`hot`) for what shines, `ok` for what grows, and the
   learner's Part hue for the cloak. So a form is the world's material, lit by its light,
   and repaints with the theme as the world does.

   The stages are one figure growing, not one shape scaled: a counting pebble with a
   sprout (Pip); up on legs, head held forward (Sprig); a cloaked walker with a staff
   (Wayfinder); broad-shouldered, with rings and stones in orbit (Surveyor); and a tall,
   crowned beacon-bearer with crossed rings (Luminary). Every stage changes the
   silhouette, the proportions, the posture and the detail.

   The parts that move in idle motion (a breath, a hop, a cloak's sway, rings turning)
   are built as small groups of their own when `live` is on, two draw calls each, for the
   progress page's view. With `live` off, as on the course map, everything is baked into
   the one mesh and one set of edges: two draw calls, the figure's whole-body bob being
   the map's own. idle(t, on) moves the live parts for time t (ms) and, with `on` false,
   puts them at rest, so a form always comes back to the pose it was built in.

   The figure stands with its feet at y = 0, facing +z, in the units of the world
   (an island is about 2.6 across); `height` is its top at rest. A caller scales the
   group as its view needs. buildForm is the one seam: a stage built another way (a
   model file, one day) need only return the same shape. */

import type { Three } from "./three.ts";
import type { BufferGeometry, Group, LineSegments, Matrix4, Mesh, MeshBasicMaterial } from "three";
import { Kit, type Place, type V3 } from "./kit.ts";
import { paint as batchPaint, type Range } from "./batch.ts";
import { lookup, type PaletteMap, type WorldMaterials } from "./materials.ts";
import { prism } from "./shapes.ts";

export const FORM_STAGES = 5;
/** one breath, hop or sway of the idle motion, in ms (the map's marker bobs at this rate too) */
export const BREATH_MS = 2400;
/** one turn of a ring or an orbit, in ms (the Observatory's telescope sways at this rate) */
export const TURN_MS = 9000;

export interface FormLook {
  /** add this to a scene: the figure, feet at y = 0, facing +z */
  group: Group;
  stage: number;
  /** the top of the figure at rest */
  height: number;
  triangles: number;
  /** draw calls: 2 baked, 2 + 2 per live part (+ 1 for the Luminary's halo) when live */
  calls: number;
  /** the live parts at time t of the idle motion; `on` false puts them at rest */
  idle(t: number, on: boolean): void;
  /** repaint from another palette (a theme or panel change) */
  paint(pal: PaletteMap): void;
  dispose(): void;
}

export interface FormOptions {
  /** moving parts as groups of their own (the default), or everything baked into two draws */
  live?: boolean;
}

/* the colour names a stage paints with, resolved once against the palette */
interface Keys { body: string; paper: string; under: string; stone: string; gold: string; grow: string; ink: string; part: string; deep: string }

type Anim = (g: Group, t: number) => void;

/* a live part's rest pose is kept as nine numbers, so idle() allocates nothing per frame */
interface Live { g: Group; rest: Float64Array; anim: Anim; geos: BufferGeometry[]; ranges: Range[][] }

/* what a stage's script builds with */
interface Build {
  T: Three;
  K: Keys;
  /** a static piece, stamped into the main kit */
  put(name: string, at: Place, paint: string, ink?: string | null): void;
  /** a flat prism from a polygon (x, y; convex), stamped static */
  flat(pts: [number, number][], depth: number, at: Place, paint: string, ink?: string | null): void;
  /** a moving part: `build` stamps its pieces (into a kit of its own when live, else into the
      main kit at the rest pose); `anim` moves its group with time */
  part(rest: Place, build: (put: Build["put"], flat: Build["flat"]) => void, anim: Anim): void;
  /** the Luminary's translucent halo, live only */
  halo(at: Place, radius: number): void;
}

/* a matrix for a Place inside a parent */
function place(k: Kit, parent: Matrix4 | null, at: Place): Matrix4 {
  const m = k.matrix(at);
  return parent ? parent.clone().multiply(m) : m;
}

function shapes(k: Kit): void {
  const T = k.T;
  k.shape("pebble", () => new T.DodecahedronGeometry(0.5, 0));
  k.shape("octa", () => new T.OctahedronGeometry(0.5, 0));
  k.shape("bar", () => new T.CylinderGeometry(0.5, 0.5, 1, 4));
  k.shape("staff", () => new T.CylinderGeometry(0.5, 0.5, 1, 5), 40);
  k.shape("disc", () => new T.CylinderGeometry(0.5, 0.5, 1, 12), 40);
  k.shape("box", () => new T.BoxGeometry(1, 1, 1));
  k.shape("ringS", () => new T.TorusGeometry(0.5, 0.06, 3, 12), 0);
  k.shape("ringM", () => new T.TorusGeometry(0.5, 0.035, 4, 24), 0);
  k.shape("ringL", () => new T.TorusGeometry(0.5, 0.03, 3, 24), 0);
}

const TAU = Math.PI * 2;
const breath = (t: number, phase = 0) => Math.sin((t / BREATH_MS) * TAU + phase);
const turn = (t: number) => (t / TURN_MS) * TAU;

/* ------------------------------------------------------------ the stages ---- */

/* 1. Pip: a counting pebble with one mark, perched on a paper disc, one sprout. Breathes. */
function pip(b: Build): void {
  const K = b.K;
  b.put("disc", { p: [0, 0.025, 0], s: [0.6, 0.05, 0.6] }, K.paper);
  b.part({ p: [0, 0.05, 0] }, (put, flat) => {
    put("pebble", { p: [0, 0.2, 0], s: [0.46, 0.4, 0.44], r: [0, 0.3, 0] }, K.body);
    put("box", { p: [0.03, 0.22, 0.2], s: [0.04, 0.14, 0.03], r: [0, 0, -0.3] }, K.ink, null);
    flat([[0, 0], [0.1, 0.16], [0.02, 0.28], [-0.07, 0.14]], 0.03, { p: [0.02, 0.38, 0], r: [0.25, 0, -0.2] }, K.grow);
  }, (g, t) => {
    g.scale.set(1, 1 + 0.03 * breath(t), 1);
    g.rotation.z = 0.03 * breath(t, 1);
  });
}

/* 2. Sprig: up on two peg legs, a pebble body, an octahedron head held forward, two
   leaves. Hops a little. */
function sprig(b: Build): void {
  const K = b.K;
  b.put("disc", { p: [0, 0.025, 0], s: [0.64, 0.05, 0.64] }, K.paper);
  for (const x of [-0.09, 0.09]) b.put("bar", { p: [x, 0.16, 0], s: [0.07, 0.22, 0.07] }, K.stone);
  b.part({ p: [0, 0.27, 0], r: [0.12, 0, 0] }, (put, flat) => {
    put("pebble", { p: [0, 0.17, 0], s: [0.42, 0.36, 0.4], r: [0, 0.3, 0] }, K.body);
    put("bar", { p: [0, 0.38, 0], s: [0.05, 0.1, 0.05] }, K.stone);
    put("octa", { p: [0, 0.52, 0], s: 0.3, r: [0, Math.PI / 4, 0] }, K.body);
    put("box", { p: [0, 0.52, 0.11], s: [0.03, 0.08, 0.02] }, K.ink, null);
    flat([[0, 0], [0.09, 0.14], [0.01, 0.24], [-0.06, 0.12]], 0.03, { p: [0.03, 0.64, 0], r: [0.2, 0, -0.5] }, K.grow);
    flat([[0, 0], [0.06, 0.12], [-0.01, 0.24], [-0.09, 0.14]], 0.03, { p: [-0.03, 0.64, 0], r: [0.2, 0, 0.5] }, K.grow);
  }, (g, t) => {
    g.position.y = 0.27 + Math.max(0, breath(t)) * 0.04;
    g.rotation.x = 0.12 + 0.04 * breath(t, 0.5);
  });
}

/* the walker's body the three later stages share: legs, a trapezoid torso, a belt, arms
   (the right one raised to the staff), a neck and the octahedron head with its mark */
function walker(b: Build, w: { legH: number; legX: number; torso: [number, number][]; depth: number; torsoY: number; neckY: number; headS: number; headY: number; shoulderX: number; shoulderY: number; staffX: number }): void {
  const K = b.K;
  for (const x of [-w.legX, w.legX]) b.put("bar", { p: [x, 0.05 + w.legH / 2, 0], s: [0.085, w.legH, 0.085] }, K.stone);
  b.flat(w.torso, w.depth, { p: [0, w.torsoY, 0] }, K.body);
  b.put("box", { p: [0, w.torsoY + 0.03, 0], s: [w.torso[2][0] * 1.7, 0.05, w.depth + 0.02] }, K.stone);
  /* the left arm hangs; the right reaches up to the staff */
  b.put("bar", { p: [-w.shoulderX - 0.02, w.shoulderY - 0.17, 0], s: [0.06, 0.3, 0.06], r: [0, 0, 0.08] }, K.body);
  b.put("octa", { p: [-w.shoulderX - 0.03, w.shoulderY - 0.34, 0], s: 0.1 }, K.paper);
  b.put("bar", { p: [w.shoulderX + 0.06, w.shoulderY + 0.02, 0.08], s: [0.06, 0.3, 0.06], r: [-0.35, 0, -0.5] }, K.body);
  b.put("octa", { p: [w.staffX, w.shoulderY + 0.12, 0.14], s: 0.1 }, K.paper);
  b.put("bar", { p: [0, w.neckY, 0], s: [0.05, 0.08, 0.05] }, K.stone);
  b.put("octa", { p: [0, w.headY, 0], s: w.headS, r: [0, Math.PI / 4, 0] }, K.body);
  b.put("box", { p: [0, w.headY, w.headS * 0.36], s: [0.03, 0.08, 0.02] }, K.ink, null);
}

/* a cape as two halves folded back round the body: each hangs from the collar at x = 0
   and swings its outer edge forward, so from the front it has depth, not a board's edge */
function cape(flat: Build["flat"], K: Keys, half: number, len: number, wide: number, at: Place = {}): void {
  const p = at.p || [0, 0, 0], r = at.r || [0, 0, 0];
  flat([[-half, 0], [0, 0], [0, -len], [-wide, -len + 0.12]], 0.03, { p, r: [r[0], r[1] + 0.45, r[2]] }, K.part);
  flat([[0, 0], [half, 0], [wide, -len + 0.12], [0, -len]], 0.03, { p, r: [r[0], r[1] - 0.45, r[2]] }, K.part);
}

/* 3. Wayfinder: the walker, a cloak in the Part's hue that sways, a staff with one ring
   that turns. */
function wayfinder(b: Build): void {
  const K = b.K;
  b.put("disc", { p: [0, 0.025, 0], s: [0.7, 0.05, 0.7] }, K.paper);
  walker(b, { legH: 0.3, legX: 0.11, torso: [[-0.17, 0], [0.17, 0], [0.22, 0.42], [-0.22, 0.42]], depth: 0.22, torsoY: 0.35, neckY: 0.8, headS: 0.32, headY: 0.98, shoulderX: 0.25, shoulderY: 0.75, staffX: 0.42 });
  for (const x of [-0.25, 0.25]) b.put("octa", { p: [x, 0.75, 0], s: 0.18 }, K.deep);
  b.part({ p: [0, 0.76, -0.12], r: [-0.22, 0, 0] }, (put, flat) => {
    cape(flat, K, 0.17, 0.74, 0.3);
  }, (g, t) => {
    g.rotation.x = -0.22 + 0.03 * breath(t);
    g.rotation.z = 0.02 * breath(t, 1);
  });
  b.put("staff", { p: [0.42, 0.65, 0.12], s: [0.05, 1.3, 0.05] }, K.stone);
  b.part({ p: [0.42, 1.3, 0.12], r: [0.25, 0, 0] }, (put) => {
    put("ringS", { s: 0.26 }, K.gold, null);
  }, (g, t) => { g.rotation.y = turn(t); });
}

/* 4. Surveyor: broader, with boots, a chest plate, pauldrons and a visor; a longer cloak;
   two rings on the staff; a ring with three gold stones in orbit round the body. */
function surveyor(b: Build): void {
  const K = b.K;
  b.put("disc", { p: [0, 0.015, 0], s: [0.9, 0.03, 0.9] }, K.under);
  b.put("disc", { p: [0, 0.045, 0], s: [0.7, 0.05, 0.7] }, K.paper);
  walker(b, { legH: 0.34, legX: 0.13, torso: [[-0.2, 0], [0.2, 0], [0.27, 0.46], [-0.27, 0.46]], depth: 0.26, torsoY: 0.39, neckY: 0.88, headS: 0.34, headY: 1.07, shoulderX: 0.3, shoulderY: 0.86, staffX: 0.52 });
  for (const x of [-0.13, 0.13]) b.put("box", { p: [x, 0.09, 0.02], s: [0.14, 0.08, 0.18] }, K.deep);
  b.flat([[-0.12, 0.1], [0.12, 0.1], [0.15, 0.4], [-0.15, 0.4]], 0.04, { p: [0, 0.39, 0.14] }, K.deep);
  for (const x of [-0.3, 0.3]) {
    b.put("box", { p: [x, 0.86, 0], s: [0.2, 0.1, 0.22], r: [0, 0, x > 0 ? -0.2 : 0.2] }, K.stone);
    b.put("octa", { p: [x * 1.1, 0.93, 0], s: 0.14 }, K.deep);
  }
  b.put("box", { p: [0, 1.1, 0.1], s: [0.3, 0.04, 0.12] }, K.stone);
  b.put("box", { p: [0, 0.9, -0.12], s: [0.5, 0.06, 0.08] }, K.deep);
  cape(b.flat, K, 0.2, 0.8, 0.36, { p: [0, 0.86, -0.14], r: [-0.2, 0, 0] });
  b.put("staff", { p: [0.52, 0.8, 0.18], s: [0.05, 1.6, 0.05] }, K.stone);
  b.part({ p: [0.52, 1.6, 0.18] }, (put) => {
    put("ringS", { s: 0.26 }, K.gold, null);
    put("ringS", { s: 0.36, r: [Math.PI / 2, 0, 0] }, K.gold, null);
  }, (g, t) => { g.rotation.y = turn(t); });
  b.part({ p: [0, 0.72, 0], r: [0.55, 0, 0] }, (put) => {
    put("ringM", { s: 1.0, r: [Math.PI / 2, 0, 0] }, K.stone, null);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      put("octa", { p: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], s: 0.14, r: [0, a, 0] }, K.gold);
    }
  }, (g, t) => { g.rotation.y = turn(t); });
}

/* 5. Luminary: tall, a gold belt and chest gem, a halo behind the head, a crown of five
   stones that turns and breathes, two crossed rings turning against each other, a long
   cloak, and a beacon staff whose tip turns. */
function luminary(b: Build): void {
  const K = b.K;
  b.put("disc", { p: [0, 0.015, 0], s: [1.1, 0.03, 1.1] }, K.under);
  b.put("disc", { p: [0, 0.045, 0], s: [0.8, 0.05, 0.8] }, K.paper);
  walker(b, { legH: 0.4, legX: 0.13, torso: [[-0.2, 0], [0.2, 0], [0.3, 0.55], [-0.3, 0.55]], depth: 0.28, torsoY: 0.45, neckY: 1.03, headS: 0.36, headY: 1.22, shoulderX: 0.34, shoulderY: 1.0, staffX: 0.55 });
  for (const x of [-0.13, 0.13]) b.put("box", { p: [x, 0.09, 0.02], s: [0.14, 0.08, 0.18] }, K.deep);
  b.put("octa", { p: [0, 0.78, 0.16], s: 0.16 }, K.gold);
  b.put("box", { p: [0, 0.48, 0], s: [0.46, 0.06, 0.3] }, K.gold);
  for (const x of [-0.34, 0.34]) {
    b.put("box", { p: [x, 1.0, 0], s: [0.22, 0.1, 0.24], r: [0, 0, x > 0 ? -0.25 : 0.25] }, K.stone);
    b.put("octa", { p: [x * 1.1, 1.08, 0], s: 0.2 }, K.deep);
  }
  b.put("box", { p: [0, 1.04, -0.14], s: [0.56, 0.06, 0.08] }, K.deep);
  cape(b.flat, K, 0.22, 0.96, 0.4, { p: [0, 1.0, -0.16], r: [-0.2, 0, 0] });
  b.put("disc", { p: [0, 1.22, -0.17], s: [0.5, 0.02, 0.5], r: [Math.PI / 2, 0, 0] }, K.paper);
  b.halo({ p: [0, 1.22, -0.2], r: [Math.PI / 2, 0, 0] }, 0.3);
  b.part({ p: [0, 1.5, 0] }, (put) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      put("octa", { p: [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], s: 0.12, r: [0, a, 0] }, K.gold);
    }
  }, (g, t) => {
    g.rotation.y = turn(t) * 0.75;
    g.scale.setScalar(1 + 0.04 * breath(t));
  });
  b.part({ p: [0, 0.95, 0], r: [0.55, 0, 0] }, (put) => { put("ringL", { s: 1.15, r: [Math.PI / 2, 0, 0] }, K.gold, null); }, (g, t) => { g.rotation.y = turn(t); });
  b.part({ p: [0, 0.95, 0], r: [-0.55, 0, 0.35] }, (put) => { put("ringL", { s: 1.15, r: [Math.PI / 2, 0, 0] }, K.stone, null); }, (g, t) => { g.rotation.y = -turn(t); });
  b.put("staff", { p: [0.55, 1.0, 0.2], s: [0.05, 2.0, 0.05] }, K.stone);
  b.part({ p: [0.55, 2.0, 0.2] }, (put) => {
    put("octa", { p: [0, 0.12, 0], s: 0.22 }, K.gold);
    put("ringS", { p: [0, -0.08, 0], s: 0.3 }, K.gold, null);
  }, (g, t) => { g.rotation.y = turn(t); });
}

const STAGES: ((b: Build) => void)[] = [pip, sprig, wayfinder, surveyor, luminary];
/* each stage's size: the natural figure above scaled so the five stand about 0.6, 0.8,
   1.1, 1.35 and 1.75 tall (measured: `height`), visibly growing from one to the next */
const SIZE = [0.85, 0.74, 0.78, 0.77, 0.79];

/* ----------------------------------------------------------- the builder ---- */

/** the stage number held to 1..FORM_STAGES (an infinity to the nearer end); NaN and anything not a number is 1 */
export function clampStage(n: unknown): number {
  const v = typeof n === "number" && !isNaN(n) ? Math.floor(n) : 1;
  return Math.min(FORM_STAGES, Math.max(1, v));
}

/** the colour names for a learner in Part `part`: the Part's hue where the palette has it, else the accent */
export function keysFor(pal: PaletteMap, part: string): Keys {
  const has = (k: string) => pal.has(k);
  return {
    body: "accent", paper: "paper", under: "under", stone: "stone", gold: "hot", grow: "ok", ink: "ink",
    part: has("part:" + part) ? "part:" + part : "accent",
    deep: has("deep:" + part) ? "deep:" + part : "stone"
  };
}

export function buildForm(T: Three, stageIn: unknown, mats: WorldMaterials, pal: PaletteMap, part: string, opts: FormOptions = {}): FormLook {
  const stage = clampStage(stageIn);
  const live = opts.live !== false;
  const size = SIZE[stage - 1];
  const P = lookup(pal);
  const K = keysFor(pal, part);
  const k = new Kit(T);
  shapes(k);
  /* the size: the root group's scale when live (the moving parts' places are inside it),
     else baked into every matrix of the one mesh */
  const base = live ? null : k.matrix({ s: size });
  const root = new T.Group();
  const lives: Live[] = [];
  const own: BufferGeometry[] = [];
  let halo: Mesh | null = null, haloMat: MeshBasicMaterial | null = null;
  let haloRanges = 0;

  const putIn = (kit: Kit, parent: Matrix4 | null): Build["put"] =>
    (name, at, paintKey, ink = K.ink) => { kit.put(name, parent, at, paintKey, ink); };
  const flatIn = (kit: Kit, parent: Matrix4 | null): Build["flat"] =>
    (pts, depth, at, paintKey, ink = K.ink) => {
      const name = "flat:" + depth + ":" + pts.map((p) => p.join(",")).join(";");
      kit.shape(name, () => prism(T, pts, depth));
      kit.put(name, parent, at, paintKey, ink);
    };

  const b: Build = {
    T, K,
    put: putIn(k, base),
    flat: flatIn(k, base),
    part(rest, build, anim) {
      if (!live) {
        const m = place(k, base, rest);
        build(putIn(k, m), flatIn(k, m));
        return;
      }
      const k2 = new Kit(T);
      shapes(k2);
      build(putIn(k2, null), flatIn(k2, null));
      const solid = k2.solids.build(T, P), edge = k2.edges.build(T, P);
      k2.dispose();
      const g = new T.Group();
      g.add(new T.Mesh(solid.geometry, mats.solid), new T.LineSegments(edge.geometry, mats.ink));
      root.add(g);
      const l: Live = { g, rest: restOf(rest), anim, geos: [solid.geometry, edge.geometry], ranges: [solid.ranges, edge.ranges] };
      lives.push(l);
      atRest(l);
    },
    halo(at, radius) {
      if (!live) return;
      haloMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide });
      haloMat.color.copy(P(K.gold));
      const geo = new T.CylinderGeometry(radius, radius, 0.01, 12);
      own.push(geo);
      halo = new T.Mesh(geo, haloMat);
      halo.position.set(...(at.p || [0, 0, 0]));
      halo.rotation.set(...(at.r || [0, 0, 0]));
      root.add(halo);
      haloRanges = 12 * 4;
    }
  };

  STAGES[stage - 1](b);
  const solid = k.solids.build(T, P), edge = k.edges.build(T, P);
  k.dispose();
  const mesh = new T.Mesh(solid.geometry, mats.solid);
  const edges = new T.LineSegments(edge.geometry, mats.ink);
  root.add(mesh, edges);
  if (live) root.scale.setScalar(size);
  /* the top of the figure at rest, measured */
  root.updateMatrixWorld(true);
  const height = new T.Box3().setFromObject(root).max.y;

  function restOf(at: Place): Float64Array {
    const p = at.p || [0, 0, 0], r = at.r || [0, 0, 0], s = at.s === undefined ? 1 : at.s;
    const sc = typeof s === "number" ? [s, s, s] : s;
    return new Float64Array([p[0], p[1], p[2], r[0], r[1], r[2], sc[0], sc[1], sc[2]]);
  }
  function atRest(l: Live): void {
    const r = l.rest;
    l.g.position.set(r[0], r[1], r[2]);
    l.g.rotation.set(r[3], r[4], r[5]);
    l.g.scale.set(r[6], r[7], r[8]);
  }

  let triangles = solid.geometry.getAttribute("position").count / 3 + haloRanges;
  for (const l of lives) triangles += l.geos[0].getAttribute("position").count / 3;

  return {
    group: root, stage,
    height,
    triangles,
    calls: 2 + lives.length * 2 + (halo ? 1 : 0),
    idle(t, on) {
      for (const l of lives) { atRest(l); if (on) l.anim(l.g, t); }
    },
    paint(pal2) {
      const Q = lookup(pal2);
      batchPaint(solid.geometry, solid.ranges, Q);
      batchPaint(edge.geometry, edge.ranges, Q);
      for (const l of lives) { batchPaint(l.geos[0], l.ranges[0], Q); batchPaint(l.geos[1], l.ranges[1], Q); }
      if (haloMat) haloMat.color.copy(Q(K.gold));
    },
    dispose() {
      solid.geometry.dispose(); edge.geometry.dispose();
      for (const l of lives) l.geos.forEach((g) => g.dispose());
      own.forEach((g) => g.dispose());
      if (haloMat) haloMat.dispose();
    }
  };
}
