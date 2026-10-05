/* The world built in Node with the Three.js package itself (no renderer, no DOM): what
   each tier draws stays inside the tier's budget, in the worst state the course can be
   in, and the merged batches keep their colours where they belong. The browser check
   tools/game/map.test.js measures the same budgets on the drawn page. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Object3D } from "three";
import { layout } from "./layout.ts";
import { placeProps } from "./props.ts";
import { makeMaterials, type PaletteMap } from "./materials.ts";
import { buildStatic, puffAt, PUFFS, PUFF_MS } from "./regions.ts";
import { buildMarks, type IsleState } from "./marks.ts";
import { Batch, EdgeBatch, repaint } from "./batch.ts";
import { TIERS, type Quality } from "./tiers.ts";
import { course, motifs } from "./course.test-helper.ts";
import type { Three } from "./three.ts";

const T = THREE as unknown as Three;
const C = course();
const L = layout(C);
const MOT = motifs(C);

/* a palette with a distinct colour per name, so a test can tell them apart */
function palette(): PaletteMap {
  const pal: PaletteMap = new Map();
  const names = ["paper", "under", "stone", "ok", "hot", "accent", "ink", "plotGround"];
  C.parts.forEach((p) => ["part", "deep", "soft", "ground", "rock", "sky", "fog", "glow", "rink", "ahead"].forEach((k) => names.push(k + ":" + p.id)));
  names.forEach((n, i) => pal.set(n, new THREE.Color().setRGB(((i * 37) % 255) / 255, ((i * 91) % 255) / 255, ((i * 13) % 255) / 255)));
  return pal;
}

/* what the renderer would draw: the visible meshes, lines and instanced meshes, each one draw call */
function drawn(objects: Object3D[]): { calls: number; triangles: number } {
  let calls = 0, triangles = 0;
  const visit = (o: Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if ((m.isMesh || (o as THREE.LineSegments).isLineSegments) && m.geometry) {
      calls++;
      if (m.isMesh) {
        const g = m.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        triangles += n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
      }
    }
    o.children.forEach(visit);
  };
  objects.forEach(visit);
  return { calls, triangles };
}

/* every chapter finished with three stars: the most marks the islands can carry */
const finished: IsleState[] = L.isles.map(() => ({ pct: 1, done: true, stars: 3 }));
const untouched: IsleState[] = L.isles.map(() => ({ pct: 0, done: false, stars: 1 }));
const halfway: IsleState[] = L.isles.map((_, i) => ({ pct: (i % 5) / 5, done: false, stars: 1 }));

describe("each tier's budget", () => {
  for (const tier of ["low", "medium", "high"] as Quality[]) {
    it(tier + ": draw calls and triangles inside TIERS." + tier + ", whatever the learner's progress", () => {
      const budget = TIERS[tier];
      const mats = makeMaterials(T);
      const pal = palette();
      const still = buildStatic(T, L, placeProps(L, MOT, budget.detail), mats, pal);
      if (still.puffs) still.puffs.mesh.visible = budget.ambient;
      for (const states of [finished, untouched, halfway]) {
        const marks = buildMarks(T, L, states, mats, pal);
        /* plus the marker (a mesh and its edges) and the selection ring */
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0));
        marker.add(new THREE.LineSegments(new THREE.EdgesGeometry(marker.geometry)));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.03, 4, 28));
        const objects: Object3D[] = [still.mesh, still.edges, marks.mesh, marks.edges, marker, ring];
        if (still.puffs) objects.push(still.puffs.mesh);
        if (still.telescope) objects.push(still.telescope.group);
        const d = drawn(objects);
        expect(d.calls).toBeLessThanOrEqual(budget.calls);
        expect(d.triangles).toBeLessThanOrEqual(budget.triangles);
        marks.dispose();
      }
      still.dispose();
      mats.dispose();
    });
  }

  it("draws today's course in far fewer calls than one mesh per primitive", () => {
    const mats = makeMaterials(T);
    const still = buildStatic(T, L, placeProps(L, MOT, 1), mats, palette());
    /* the still world is two draws however many props and islands it has */
    expect(still.mesh.geometry.attributes.position.count / 3).toBe(still.triangles - (still.puffs ? still.puffs.from.length * PUFFS * 20 : 0) - (still.telescope ? (still.telescope.group.children[0] as THREE.Mesh).geometry.attributes.position.count / 3 : 0));
    expect(still.stones).toBe(70);
    expect(still.pick.length).toBe(17 + 4);
    expect(still.caps.length).toBe(17);
    expect(still.arches.length).toBe(4);
    still.dispose();
    mats.dispose();
  });
});

describe("the merged batches", () => {
  it("paint each range its own colour, and repaint one range alone", () => {
    const pal = palette();
    const b = new Batch();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const a = b.add(box, null, "paper");
    const top = b.add(box, new THREE.Matrix4().makeTranslation(3, 0, 0), (ny) => (ny > 0.5 ? "ground:algebra" : "rock:algebra"));
    const { geometry } = b.build(T, (k) => pal.get(k)!);
    const col = geometry.getAttribute("color");
    /* the attribute is 32-bit, so a colour comes back to seven digits or so */
    const at = (i: number) => [col.getX(i), col.getY(i), col.getZ(i)].map((v) => Math.round(v * 1e5));
    const rgb = (k: string) => { const c = pal.get(k)!; return [c.r, c.g, c.b].map((v) => Math.round(v * 1e5)); };
    expect(at(0)).toEqual(rgb("paper"));
    expect(b.triangles).toBe(24);
    /* the second box: its two up-facing triangles are ground, the rest rock */
    const keys = top.map((r) => r.key);
    expect(keys).toContain("ground:algebra");
    expect(keys).toContain("rock:algebra");
    const ground = top.filter((r) => r.key === "ground:algebra").reduce((n, r) => n + r.count, 0);
    expect(ground).toBe(6);
    /* the first box's range turns hot; the second box keeps its colours */
    a[0].key = "hot";
    repaint(geometry, a[0], (k) => pal.get(k)!);
    expect(at(0)).toEqual(rgb("hot"));
    expect(at(a[0].count)).not.toEqual(rgb("hot"));
    /* flat shading: every vertex of a triangle has that triangle's normal */
    const n = geometry.getAttribute("normal");
    expect([n.getX(0), n.getY(0), n.getZ(0)]).toEqual([n.getX(1), n.getY(1), n.getZ(1)]);
  });

  it("puts edges where the matrix says", () => {
    const e = new EdgeBatch();
    e.add(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.Matrix4().makeTranslation(10, 0, 0), "ink");
    const { geometry } = e.build(T, () => new THREE.Color(0, 0, 0));
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.x).toBeCloseTo(9.5);
    expect(e.vertices).toBe(24);
  });

  it("recolours an island's cap when the chapter is started or not", () => {
    const pal = palette();
    const mats = makeMaterials(T);
    const still = buildStatic(T, L, placeProps(L, MOT, 0), mats, pal);
    const col = still.mesh.geometry.getAttribute("color");
    const r = still.caps[3][0];
    r.key = "ahead:algebra";
    still.paint(pal);
    expect(col.getX(r.start)).toBeCloseTo(pal.get("ahead:algebra")!.r);
    still.dispose();
    mats.dispose();
  });
});

describe("the idle motion", () => {
  it("lifts each puff and shrinks it over one cycle, and repeats exactly", () => {
    const a = puffAt([0, 2, 0], 0, 0), b = puffAt([0, 2, 0], 0, PUFF_MS * 0.5), c = puffAt([0, 2, 0], 0, PUFF_MS);
    expect(b.p[1]).toBeGreaterThan(a.p[1]);
    expect(b.s).toBeLessThan(a.s);
    expect(c).toEqual(a);
  });

  it("marks each island with what its progress shows", () => {
    const mats = makeMaterials(T);
    const marks = buildMarks(T, L, L.isles.map((_, i) => (i === 0 ? { pct: 1, done: true, stars: 2 } : i === 1 ? { pct: 0.5, done: false, stars: 1 } : { pct: 0, done: false, stars: 1 })), mats, palette());
    expect(marks.kinds.ch01).toBe("ring,flag,star,star");
    expect(marks.kinds.ch02).toBe("ring,boss");
    expect(marks.kinds.ch03).toBe("boss");
    marks.dispose();
    mats.dispose();
  });
});
