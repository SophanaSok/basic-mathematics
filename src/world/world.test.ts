/* The world built in Node with the Three.js package itself (no renderer, no DOM): what
   each tier draws stays inside the tier's budget, in the worst state the course can be
   in, and the merged batches keep their colours where they belong. The browser check
   tools/game/map.test.js measures the same budgets on the drawn page. */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Object3D } from "three";
import { createWorld, MARKER_SCALE } from "./index.ts";
import { buildForm } from "./forms.ts";
import { layout } from "./layout.ts";
import { placeProps } from "./props.ts";
import { GLOW_LUMA, GLOW_MAX, glowFactor, luminance, makeMaterials, readPalette, type PaletteMap } from "./materials.ts";
import { buildStatic, puffAt, PUFFS, PUFF_MS } from "./regions.ts";
import { buildMarks, type IsleState } from "./marks.ts";
import { buildLinks, ARC_SEGMENTS } from "./links.ts";
import { hollowCount, TRIS } from "./solids.ts";
import { Batch, EdgeBatch, repaint } from "./batch.ts";
import { TIERS, type Quality } from "./tiers.ts";
import { course, motifs } from "./course.test-helper.ts";
import type { Three } from "./three.ts";

const T = THREE as unknown as Three;
const C = course();
/* the world draws the four Parts of the course; the real Part V (pack A) is beside them and has no region */
const PARTS = C.parts.filter((p) => !p.beside);
const L = layout(C);
const MOT = motifs(C);

/* a palette with a distinct colour per name, so a test can tell them apart */
function palette(): PaletteMap {
  const pal: PaletteMap = new Map();
  const names = ["paper", "under", "stone", "ok", "hot", "accent", "ink", "plotGround"];
  PARTS.forEach((p) => ["part", "deep", "soft", "ground", "rock", "sky", "fog", "glow", "rink", "ahead"].forEach((k) => names.push(k + ":" + p.id)));
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

/* the states hubState makes, built by hand: a boss in the Part's solid, a beacon when a section is due */
const SOLIDS = ["cube", "tetra", "octa", "icosa"] as const;
const MASTERY = { strong: 0, building: 0, weak: 0, none: 0 };
const mk = (i: number, pct: number, done: boolean, stars: number, boss: boolean, due: boolean): IsleState => ({
  pct, done, stars, mastery: MASTERY,
  boss: boss ? { solid: SOLIDS[L.isles[i].p], hollow: pct } : null,
  due: { arena: due ? ["x#y"] : [], page: [] }
});
/* every chapter finished with three stars (and a beacon each): the most flags the islands can carry */
const finished: IsleState[] = L.isles.map((_, i) => mk(i, 1, true, 3, false, true));
const untouched: IsleState[] = L.isles.map((_, i) => mk(i, 0, false, 1, true, false));
const halfway: IsleState[] = L.isles.map((_, i) => mk(i, (i % 5) / 5, false, 1, true, false));
/* every island unfinished with a boss (the largest solid, the icosa, in every Part) AND a beacon */
const worst: IsleState[] = L.isles.map((_, i) => ({ ...mk(i, 0.5, false, 1, true, true), boss: { solid: "icosa" as const, hollow: 0.5 } }));
const worstMixed: IsleState[] = L.isles.map((_, i) => mk(i, (i % 5) / 5, false, 1, true, true));

describe("each tier's budget", () => {
  for (const tier of ["low", "medium", "high"] as Quality[]) {
    it(tier + ": draw calls and triangles inside TIERS." + tier + ", whatever the learner's progress", () => {
      const budget = TIERS[tier];
      const mats = makeMaterials(T);
      const pal = palette();
      const still = buildStatic(T, L, placeProps(L, MOT, budget.detail), mats, pal);
      if (still.puffs) still.puffs.mesh.visible = budget.ambient;
      for (const states of [finished, untouched, halfway, worst, worstMixed]) {
        const marks = buildMarks(T, L, states, mats, pal);
        /* plus the marker (the largest form, two draws) and the selection ring */
        const form = buildForm(T, 5, mats, pal, "algebra", { live: false });
        form.group.scale.setScalar(MARKER_SCALE);
        const marker = form.group;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.03, 4, 28));
        /* and the selected chapter's links (one mesh) */
        const links = buildLinks(T, L, 10, [8, 9], pal);
        const objects: Object3D[] = [still.mesh, still.edges, marks.mesh, marks.edges, marker, ring, links.mesh];
        if (still.puffs) objects.push(still.puffs.mesh);
        if (still.telescope) objects.push(still.telescope.group);
        const d = drawn(objects);
        expect(d.calls).toBeLessThanOrEqual(budget.calls);
        expect(d.triangles).toBeLessThanOrEqual(budget.triangles);
        marks.dispose();
        form.dispose();
        links.dispose();
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

describe("the links ribbon", () => {
  it("repaints the ink with the palette and leaves the halo", () => {
    const pal = palette();
    const links = buildLinks(T, L, 10, [8, 9], pal);
    const col = links.mesh.geometry.attributes.color;
    expect(col.count).toBe(links.segments * 12);
    const rgb = (i: number) => [col.getX(i), col.getY(i), col.getZ(i)];
    const halo0 = rgb(0), ink0 = rgb(6);
    expect(halo0[0]).toBeCloseTo(pal.get("paper")!.r, 5);
    expect(ink0).not.toEqual(halo0);
    const pal2: PaletteMap = new Map(pal);
    pal2.set("rink:" + L.isles[10].part, new THREE.Color(0.01, 0.02, 0.03));
    links.paint(pal2);
    expect(rgb(6)[0]).toBeCloseTo(0.01, 5);
    expect(rgb(0)).toEqual(halo0);
    links.dispose();
  });
});

describe("the marker", () => {
  it("draws the links as one ribbon mesh, clears them, and frees them with the world", () => {
    vi.stubGlobal("window", { getComputedStyle: () => ({ getPropertyValue: () => "" }) });
    try {
      const probe = { querySelectorAll: () => [] } as unknown as Element;
      const world = createWorld(T, { course: C, motifs: MOT, probe, detail: 0 });
      const count = () => world.scene.children.filter((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (o as THREE.Mesh).renderOrder === 5).length;
      expect(count()).toBe(0);
      world.setLinks(10, [8, 9]);
      expect(count()).toBe(1);
      const mesh = world.scene.children.find((o) => (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (o as THREE.Mesh).renderOrder === 5) as THREE.Mesh;
      const verts = 2 * (ARC_SEGMENTS / 2) * 2 * 6;
      expect(mesh.geometry.attributes.position.count).toBe(verts);
      expect(mesh.geometry.attributes.color.array.length).toBe(verts * 3);
      world.setLinks(11, [10]);
      expect(count()).toBe(1);
      world.setLinks(-1, []);
      expect(count()).toBe(0);
      world.setLinks(10, [9]);
      let freed = false;
      (world.scene.children.find((o) => (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (o as THREE.Mesh).renderOrder === 5) as THREE.Mesh).geometry.addEventListener("dispose", () => { freed = true; });
      world.dispose();
      expect(count()).toBe(0);
      expect(freed).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is the learner's form: one mesh and one set of edges under it, freed with the world", () => {
    /* the tokens are read from a probe element; Node has neither, so a stand-in answers with none */
    vi.stubGlobal("window", { getComputedStyle: () => ({ getPropertyValue: () => "" }) });
    try {
      const probe = { querySelectorAll: () => [] } as unknown as Element;
      const world = createWorld(T, { course: C, motifs: MOT, probe, detail: 0 });
      world.setForm(3, "geometry");
      expect(world.marker.children.length).toBe(1);
      const group = world.marker.children[0];
      expect(group.children.filter((o) => (o as THREE.Mesh).isMesh).length).toBe(1);
      expect(group.children.filter((o) => (o as THREE.LineSegments).isLineSegments).length).toBe(1);
      const geos = group.children.map((o) => (o as THREE.Mesh).geometry);
      let freed = 0;
      geos.forEach((g) => g.addEventListener("dispose", () => { freed++; }));
      world.dispose();
      expect(freed).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("the ink and the teardown", () => {
  /* how many edge vertices are painted `key` */
  const inked = (still: ReturnType<typeof buildStatic>, pal: PaletteMap, key: string) => {
    const col = still.edges.geometry.getAttribute("color"), c = pal.get(key)!;
    let n = 0;
    for (let i = 0; i < col.count; i++) if (col.getX(i) === Math.fround(c.r) && col.getY(i) === Math.fround(c.g) && col.getZ(i) === Math.fround(c.b)) n++;
    return n;
  };

  it("inks every prop in its region's --region-ink, never the paper's ink, so its edges show on a dark ground", () => {
    const pal = palette();
    const mats = makeMaterials(T);
    const few = buildStatic(T, L, placeProps(L, MOT, 0), mats, pal);
    const many = buildStatic(T, L, placeProps(L, MOT, 2), mats, pal);
    /* more props add no paper ink (the islands' own edges are the same in both) */
    expect(inked(many, pal, "ink")).toBe(inked(few, pal, "ink"));
    for (const p of PARTS) expect(inked(many, pal, "rink:" + p.id)).toBeGreaterThan(inked(few, pal, "rink:" + p.id));
    few.dispose(); many.dispose(); mats.dispose();
  });

  it("frees the smoke's instanced mesh with the rest, so a tier change leaves no GL buffer behind", () => {
    const mats = makeMaterials(T);
    const still = buildStatic(T, L, placeProps(L, MOT, 1), mats, palette());
    expect(still.puffs).not.toBeNull();
    let freed = false;
    still.puffs!.mesh.addEventListener("dispose", () => { freed = true; });
    still.dispose();
    expect(freed).toBe(true);
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
    const marks = buildMarks(T, L, L.isles.map((_, i) => (i === 0 ? mk(i, 1, true, 2, false, false) : i === 1 ? mk(i, 0.5, false, 1, true, true) : i === 2 ? mk(i, 0, false, 1, false, false) : mk(i, 0, false, 1, true, false))), mats, palette());
    expect(marks.kinds.ch01).toBe("ring,flag,star,star");
    expect(marks.kinds.ch02).toBe("ring,boss:cube,beacon");
    expect(marks.kinds.ch03).toBe("");
    expect(marks.kinds.ch04).toBe("boss:cube");
    marks.dispose();
    mats.dispose();
  });

  it("hollows as many faces of the stamped boss as hollowCount says", () => {
    const mats = makeMaterials(T);
    const pal = palette();
    for (const solid of SOLIDS) for (const h of [0, 0.25, 0.5, 0.9]) {
      const states = L.isles.map((_, i) => (i === 0 ? { ...mk(i, h, false, 1, true, false), boss: { solid, hollow: h } } : mk(i, 0, true, 1, false, false)));
      const marks = buildMarks(T, L, states, mats, pal);
      const col = marks.mesh.geometry.attributes.color;
      const under = pal.get("under")!, deep = pal.get("deep:" + L.isles[0].part)!;
      let hollow = 0, tris = 0;
      for (let v = 0; v < col.count; v += 3) {
        const c = [col.getX(v), col.getY(v), col.getZ(v)];
        const is = (k: { r: number; g: number; b: number }) => Math.abs(c[0] - k.r) + Math.abs(c[1] - k.g) + Math.abs(c[2] - k.b) < 1e-4;
        if (is(under)) hollow++;
        if (is(deep)) tris++;
      }
      /* the island's one boss: hollow + solid faces are all of its triangles */
      expect(hollow).toBe(hollowCount(solid, h));
      expect(hollow + tris).toBe(TRIS[solid]);
      marks.dispose();
    }
    mats.dispose();
  });
});

describe("the glow colours under the bloom", () => {
  const tokens: Record<string, string> = { "--region-glow": "#2255ee", "--part": "#336699", "--surface": "#ffffff", "--plot-ground": "#cccccc" };
  const part = { getAttribute: () => "algebra" };
  const probe = { querySelectorAll: () => [part] } as unknown as Element;
  const read = (bloom: boolean) => {
    vi.stubGlobal("window", { getComputedStyle: () => ({ getPropertyValue: (n: string) => tokens[n] || "" }) });
    try { return readPalette(T, probe, bloom); } finally { vi.unstubAllGlobals(); }
  };

  it("scale to a luminance of GLOW_LUMA per colour, so a blue needs more than a red, and nothing else changes", () => {
    const off = read(false), on = read(true);
    const g0 = off.get("glow:algebra")!, g1 = on.get("glow:algebra")!;
    expect(luminance(g0)).toBeLessThan(1.05);
    expect(luminance(g1)).toBeCloseTo(GLOW_LUMA, 5);
    expect(g1.b).toBeGreaterThan(1);
    expect(glowFactor(new THREE.Color(0, 0, 1))).toBeGreaterThan(glowFactor(new THREE.Color(1, 0, 0)));
    expect(glowFactor(new THREE.Color(0, 0, 0))).toBe(GLOW_MAX);
    expect(glowFactor(new THREE.Color(2, 2, 2))).toBe(1);
    for (const k of ["part:algebra", "deep:algebra", "ground:algebra", "paper", "hot", "ahead:algebra"]) expect(on.get(k)!.equals(off.get(k)!)).toBe(true);
  });

  it("repaint a glow range past 1 in the batch's Float32 colour, and back when the bloom goes", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const b = new Batch();
    const ranges = b.add(geo, null, "glow:algebra");
    const off = read(false), on = read(true);
    const g = b.build(T, (k) => off.get(k)!).geometry;
    const at = () => (g.getAttribute("color").array as Float32Array)[2];
    repaint(g, ranges[0], (k) => on.get(k)!);
    expect(at()).toBeGreaterThan(1);
    repaint(g, ranges[0], (k) => off.get(k)!);
    expect(at()).toBeLessThanOrEqual(1);
  });
});
