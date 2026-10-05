/* The still part of the world, built once per tier: the four terraces with their props,
   the chapter islands, the path's stones and the review gates, as ONE mesh and ONE set of
   ink edges (src/world/batch.ts), plus the two props that move while the world idles
   (the Foundry's smoke and the Observatory's telescope) and the invisible shapes the
   pointer is tested against.

   The regions, by their quest motif (data/quest.js):
     forge   The Foundry      chimneys, a furnace with a glowing mouth, crates, an anvil
     fields  The Fields       tents, low hills, trees
     grid    The Grid         a lattice of posts, axis beams, nodes on posts
     stars   The Observatory  a dome, a telescope, stars on rods, rocks
   and along each terrace's front edge a rim of low pieces: blocks, bushes, posts with
   caps, crystals.
   Every shape is a Three.js primitive; there is no texture and no model file. */

import type { Three } from "./three.ts";
import type { BufferGeometry, CatmullRomCurve3, Group, InstancedMesh, LineSegments, Mesh, Object3D } from "three";
import { Kit, type V3 } from "./kit.ts";
import { paint as batchPaint, type Range } from "./batch.ts";
import { DECK, PLINTH, type WorldLayout } from "./layout.ts";
import type { Prop } from "./props.ts";
import { prism, circle } from "./shapes.ts";
import { lookup, type PaletteMap, type WorldMaterials } from "./materials.ts";

export const STONES = 70;
/** puffs per chimney */
export const PUFFS = 3;

export interface StaticWorld {
  mesh: Mesh;
  edges: LineSegments;
  /** per island, the ranges of its cap (repainted as "part:<id>" or "ahead:<id>") */
  caps: Range[][];
  /** per gate (in layout order), the ranges of its arch ("stone", or "hot" once its chapter is done) */
  arches: Range[][];
  stones: number;
  curve: CatmullRomCurve3;
  /** invisible shapes for the pointer: userData { isle, review? } */
  pick: Object3D[];
  /** the Foundry's smoke: one instance per puff, rising from `from` */
  puffs: { mesh: InstancedMesh; from: V3[] } | null;
  /** the Observatory's telescope, turning about its mount */
  telescope: { group: Group; heading: number } | null;
  triangles: number;
  /** repaint every colour from the palette (a theme or panel change) */
  paint(pal: PaletteMap): void;
  dispose(): void;
}

function shapes(k: Kit): void {
  const T = k.T;
  /* islands */
  k.shape("body", () => new T.CylinderGeometry(1.25, 1.32, PLINTH * 2, 7));
  k.shape("cap", () => new T.CylinderGeometry(1.28, 1.28, 0.1, 7));
  k.shape("stone", () => new T.BoxGeometry(0.34, 0.1, 0.26), 0);
  k.shape("arch", () => new T.TorusGeometry(0.95, 0.11, 6, 12, Math.PI));
  k.shape("box", () => new T.BoxGeometry(1, 1, 1));
  /* props: unit-ish primitives, scaled where they are put */
  k.shape("cyl6", () => new T.CylinderGeometry(0.5, 0.5, 1, 6));
  k.shape("taper6", () => new T.CylinderGeometry(0.37, 0.5, 1, 6));
  k.shape("cyl10", () => new T.CylinderGeometry(0.5, 0.52, 1, 10), 40);
  k.shape("rod", () => new T.CylinderGeometry(0.5, 0.5, 1, 4), 0);
  k.shape("pyramid", () => new T.ConeGeometry(0.5, 1, 4));
  k.shape("cone6", () => new T.ConeGeometry(0.5, 1, 6));
  k.shape("mound", () => new T.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 50);
  k.shape("dome", () => new T.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 50);
  k.shape("octa", () => new T.OctahedronGeometry(0.5, 0));
  k.shape("icosa", () => new T.IcosahedronGeometry(0.5, 0));
}

/* one prop, stamped into the kit; returns where its chimney tops are (for smoke) */
function prop(k: Kit, q: Prop, ground: number, tops: V3[]): { telescope?: { at: V3; heading: number; part: string } } {
  const id = q.part, s = q.size;
  const at = k.matrix({ p: [q.x, ground, q.z], r: [0, q.turn, 0], s });
  /* a prop's ink is its region's --region-ink, which stands 3:1 off the region's ground in
     both themes (the paper ink, --plot-ink, would vanish on a dark ground) */
  const rink = "rink:" + id;
  const put = (name: string, p: V3, size: V3 | number, paint: string, r?: V3, ink: string | null = rink) => k.put(name, at, { p, s: size, r }, paint, ink);
  switch (q.kind) {
    case "chimney":
      put("taper6", [0, 1, 0], [0.55, 2, 0.55], "rock:" + id);
      put("cyl6", [0, 2.06, 0], [0.66, 0.16, 0.66], "deep:" + id);
      tops.push([q.x, ground + 2.15 * s, q.z]);
      break;
    case "furnace":
      put("box", [0, 0.45, 0], [1.2, 0.9, 0.9], "rock:" + id);
      put("box", [0, 0.32, 0.43], [0.55, 0.36, 0.08], "glow:" + id);
      put("taper6", [0.3, 1.25, -0.15], [0.32, 0.8, 0.32], "deep:" + id);
      tops.push([q.x + 0.3 * s * Math.cos(q.turn) - 0.15 * s * Math.sin(q.turn), ground + 1.68 * s, q.z - 0.3 * s * Math.sin(q.turn) - 0.15 * s * Math.cos(q.turn)]);
      break;
    case "crates": {
      const n = 1 + Math.floor(q.size * 3.3) % 3;
      for (let i = 0; i < n; i++) put("box", [i === 1 ? 0.52 : 0, 0.25 + (i === 2 ? 0.5 : 0), 0], 0.5, (i % 2 ? "soft:" : "part:") + id, [0, i * 0.35, 0]);
      break;
    }
    case "anvil":
      put("box", [0, 0.1, 0], [0.55, 0.2, 0.42], "deep:" + id);
      put("box", [0, 0.32, 0], [0.26, 0.25, 0.22], "deep:" + id);
      put("box", [0.04, 0.52, 0], [0.7, 0.16, 0.3], "rock:" + id);
      break;
    case "tent":
      put("pyramid", [0, 0.45, 0], [1.1, 0.9, 1.1], (q.turn > Math.PI ? "soft:" : "part:") + id, [0, Math.PI / 4, 0]);
      put("rod", [0, 1.0, 0], [0.04, 0.3, 0.04], rink, undefined, null);
      break;
    case "hill":
      put("mound", [0, 0, 0], [2.0, 0.9, 1.7], "rock:" + id);
      break;
    case "tree":
      put("rod", [0, 0.25, 0], [0.14, 0.5, 0.14], "deep:" + id, undefined, null);
      put("cone6", [0, 0.95, 0], [0.75, 1.1, 0.75], "part:" + id);
      break;
    case "lattice":
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        put("box", [i * 0.8, 0.6, j * 0.8], [0.1, 1.2, 0.1], "rock:" + id);
        put("box", [i * 0.8, 1.24, j * 0.8], 0.18, "soft:" + id);
      }
      for (let i = -1; i <= 1; i++) {
        put("box", [0, 1.12, i * 0.8], [1.7, 0.06, 0.06], "part:" + id, undefined, null);
        put("box", [i * 0.8, 1.12, 0], [0.06, 0.06, 1.7], "part:" + id, undefined, null);
      }
      break;
    case "beam":
      put("box", [0, 0.12, 0], [2.2, 0.12, 0.12], "part:" + id);
      put("pyramid", [1.25, 0.12, 0], [0.25, 0.35, 0.25], "part:" + id, [0, 0, -Math.PI / 2]);
      put("box", [0, 0.12, 0], [0.12, 0.12, 1.6], "deep:" + id);
      put("box", [0, 0.6, 0], [0.12, 1.1, 0.12], "deep:" + id);
      for (let i = -2; i <= 2; i++) if (i) put("box", [i * 0.4, 0.12, 0], [0.04, 0.24, 0.24], "rock:" + id, undefined, null);
      break;
    case "node":
      put("rod", [0, 0.3, 0], [0.06, 0.6, 0.06], rink, undefined, null);
      put("box", [0, 0.72, 0], 0.3, "part:" + id, [0.6, 0.6, 0]);
      break;
    case "dome":
      put("cyl10", [0, 0.35, 0], [2.2, 0.7, 2.2], "paper");
      put("dome", [0, 0.7, 0], [2.2, 2.2, 2.2], "soft:" + id);
      put("box", [0, 1.1, 0.5], [0.24, 0.7, 1.0], "deep:" + id, [0.55, 0, 0]);
      break;
    case "telescope": {
      put("box", [0, 0.25, 0], [0.4, 0.5, 0.4], "deep:" + id);
      const y = ground + 0.55 * s;
      return { telescope: { at: [q.x, y, q.z], heading: q.turn, part: id } };
    }
    case "starpost":
      put("rod", [0, 0.6, 0], [0.05, 1.2, 0.05], rink, undefined, null);
      put("octa", [0, 1.32, 0], 0.42, "hot");
      break;
    case "rock":
      put("icosa", [0, 0.15, 0], [0.8, 0.5, 0.7], "rock:" + id);
      break;
    /* the front rims */
    case "block":
      put("box", [0, 0.15, 0], [0.55, 0.3, 0.42], (s > 1 ? "deep:" : "rock:") + id);
      break;
    case "bush":
      put("mound", [0, 0, 0], [0.8, 0.6, 0.7], (s > 1 ? "soft:" : "part:") + id);
      break;
    case "post":
      put("box", [0, 0.3, 0], [0.1, 0.6, 0.1], "rock:" + id);
      put("box", [0, 0.64, 0], 0.14, "soft:" + id);
      break;
    case "crystal":
      put("octa", [0, 0.28, 0], [0.32, 0.6, 0.32], "glow:" + id);
      break;
  }
  return {};
}

export function buildStatic(T: Three, L: WorldLayout, props: Prop[], mats: WorldMaterials, pal: PaletteMap): StaticWorld {
  const k = new Kit(T);
  shapes(k);
  const ground = (p: number) => L.regions[p].top;

  /* the terraces: ground on top, rock on the sides; the front rock of each stands one step tall */
  L.regions.forEach((r) => {
    k.put("box", null, { p: [(r.x0 + r.x1) / 2, (r.top + r.base) / 2, (r.z0 + r.z1) / 2], s: [r.x1 - r.x0, r.top - r.base, r.z1 - r.z0] },
      (ny) => (ny > 0.5 ? "ground:" : "rock:") + r.id, "rink:" + r.id);
  });

  /* the islands: a plinth of paper and a cap in the Part's hue, turned a little each so a row does not look stamped */
  const ring = circle(T, 1.45, 28);
  const caps: Range[][] = [];
  const pick: Object3D[] = [];
  const proxyGeo = new T.CylinderGeometry(1.28, 1.32, 0.75, 7);
  const proxyMat = new T.MeshBasicMaterial();
  L.isles.forEach((s, i) => {
    const at = k.matrix({ p: [s.x, s.y, s.z], r: [0, (i * 0.9) % (Math.PI * 2 / 7), 0] });
    k.put("body", at, {}, "paper");
    caps.push(k.put("cap", at, { p: [0, PLINTH + 0.05, 0] }, "part:" + s.part));
    k.line(ring, null, { p: [s.x, s.y + DECK + 0.1, s.z] }, "stone");
    const proxy = new T.Mesh(proxyGeo, proxyMat);
    proxy.position.set(s.x, s.y + 0.05, s.z);
    proxy.visible = false;
    proxy.userData.isle = i;
    pick.push(proxy);
  });

  /* the path: a curve through every island and bend, with stones where it is in the open */
  const curve = new T.CatmullRomCurve3(L.path.map((v) => new T.Vector3(v[0], v[1], v[2])), false, "centripetal");
  const N = 900, sp = curve.getSpacedPoints(N), open: boolean[] = [];
  let openLen = 0;
  for (let i = 0; i <= N; i++) {
    const q = sp[i];
    let free = true;
    for (const s of L.isles) {
      const dx = q.x - s.x, dy = q.y - s.y, dz = q.z - s.z;
      if (dx * dx + dy * dy * 4 + dz * dz < 1.36 * 1.36) { free = false; break; }
    }
    open.push(free);
    if (i && free && open[i - 1]) openLen += q.distanceTo(sp[i - 1]);
  }
  const gap = openLen / STONES;
  let acc = gap / 2, stones = 0;
  for (let i = 1; i <= N; i++) {
    if (!(open[i] && open[i - 1])) continue;
    acc += sp[i].distanceTo(sp[i - 1]);
    if (acc < gap) continue;
    acc -= gap;
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N, i + 1)];
    k.put("stone", null, { p: [sp[i].x, sp[i].y - PLINTH + 0.06, sp[i].z], r: [0, Math.atan2(b.x - a.x, b.z - a.z) + (stones % 2 ? 0.12 : -0.08), 0] }, "stone", null);
    stones++;
  }

  /* the review gates: an arch where the path turns after a Part's last chapter, on a landing where that is up the cliff */
  const arches: Range[][] = [];
  const hitGeo = new T.BoxGeometry(2.2, 1.2, 0.6);
  L.gates.forEach((g) => {
    const floor = g.at[1] - PLINTH + 0.06;
    const below = L.regions[g.p].top;
    if (floor - below > 0.1) {
      const top = floor - 0.04;
      k.put("box", null, { p: [g.at[0], (top + below) / 2, g.at[2]], s: [2.8, top - below, 1.8] }, (ny) => (ny > 0.5 ? "ground:" : "rock:") + g.part, "rink:" + g.part);
    }
    const o = new T.Object3D();
    o.position.set(g.at[0], floor, g.at[2]);
    o.lookAt(g.at[0] + g.along[0], floor + g.along[1], g.at[2] + g.along[2]);
    o.updateMatrix();
    arches.push(k.put("arch", o.matrix, {}, "stone"));
    const hit = new T.Mesh(hitGeo, proxyMat);
    hit.position.copy(o.position);
    hit.quaternion.copy(o.quaternion);
    hit.translateY(0.5);
    hit.visible = false;
    hit.userData.isle = g.isle;
    hit.userData.review = true;
    pick.push(hit);
  });

  /* the props, and what of them moves */
  const tops: V3[] = [];
  let scope: { at: V3; heading: number; part: string } | null = null;
  props.forEach((q) => {
    const r = prop(k, q, ground(q.p), tops);
    if (r.telescope && !scope) scope = r.telescope;
  });

  const P = lookup(pal);
  const solid = k.solids.build(T, P);
  const edge = k.edges.build(T, P);
  const mesh = new T.Mesh(solid.geometry, mats.solid);
  const edges = new T.LineSegments(edge.geometry, mats.ink);
  const triangles = k.solids.triangles;

  /* smoke: small puffs over each chimney, drawn as one instanced mesh */
  let puffs: StaticWorld["puffs"] = null;
  const puffGeo = new T.IcosahedronGeometry(0.17, 0);
  if (tops.length) {
    const im = new T.InstancedMesh(puffGeo, mats.puff, tops.length * PUFFS);
    puffs = { mesh: im, from: tops };
  }

  /* the telescope: a tube on a pivot, its own small mesh so it can turn */
  let telescope: StaticWorld["telescope"] = null;
  const tk = new Kit(T);
  if (scope) {
    const sc: { at: V3; heading: number; part: string } = scope;
    tk.shape("tube", () => new T.CylinderGeometry(0.13, 0.18, 1.3, 7));
    tk.shape("lens", () => new T.CylinderGeometry(0.2, 0.2, 0.1, 7));
    const tilt = tk.matrix({ r: [-0.75, 0, 0] });
    tk.put("tube", tilt, { p: [0, 0.45, 0] }, "paper", "rink:" + sc.part);
    tk.put("lens", tilt, { p: [0, 1.1, 0] }, "rink:" + sc.part, "rink:" + sc.part);
    const group = new T.Group();
    group.add(new T.Mesh(tk.solids.build(T, P).geometry, mats.solid), new T.LineSegments(tk.edges.build(T, P).geometry, mats.ink));
    group.position.set(sc.at[0], sc.at[1], sc.at[2]);
    group.rotation.y = sc.heading;
    telescope = { group, heading: sc.heading };
  }

  const extras = (): BufferGeometry[] => telescope
    ? telescope.group.children.map((c) => (c as Mesh).geometry)
    : [];
  return {
    mesh, edges, caps, arches, stones, curve, pick, puffs, telescope,
    triangles: triangles + (puffs ? tops.length * PUFFS * 20 : 0) + (telescope ? tk.solids.triangles : 0),
    paint(pal2) {
      const Q = lookup(pal2);
      batchPaint(solid.geometry, solid.ranges, Q);
      batchPaint(edge.geometry, edge.ranges, Q);
      if (telescope) {
        const [m, e] = telescope.group.children as [Mesh, LineSegments];
        batchPaint(m.geometry, tk.solids.ranges, Q);
        batchPaint(e.geometry, tk.edges.ranges, Q);
      }
      mats.puff.color.copy(Q("under"));
    },
    dispose() {
      [solid.geometry, edge.geometry, proxyGeo, hitGeo, ring, puffGeo].forEach((g) => g.dispose());
      /* an InstancedMesh's own buffer (its instance matrices) is freed only on its own
         dispose event, so without this each rebuild (a tier change) would leave one behind */
      if (puffs) puffs.mesh.dispose();
      extras().forEach((g) => g.dispose());
      proxyMat.dispose();
      k.dispose();
      tk.dispose();
    }
  };
}

/** a puff's place and size at time t (ms) of the idle motion: each rises and shrinks over PUFF_MS, one after another */
export const PUFF_MS = 2400;
export function puffAt(from: V3, n: number, t: number): { p: V3; s: number } {
  const k = (((t / PUFF_MS) + n / PUFFS) % 1 + 1) % 1;
  return { p: [from[0] + Math.sin((k + n) * 2.1) * 0.12, from[1] + 0.1 + k * 1.1, from[2]], s: 1 - k * 0.7 };
}

/** places every puff for time t */
export function placePuffs(T: Three, puffs: NonNullable<StaticWorld["puffs"]>, t: number): void {
  const o = new T.Object3D();
  let i = 0;
  puffs.from.forEach((from) => {
    for (let n = 0; n < PUFFS; n++) {
      const a = puffAt(from, n, t);
      o.position.set(a.p[0], a.p[1], a.p[2]);
      o.scale.setScalar(a.s);
      o.updateMatrix();
      puffs.mesh.setMatrixAt(i++, o.matrix);
    }
  });
  puffs.mesh.instanceMatrix.needsUpdate = true;
}
