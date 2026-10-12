/* The five forms built in Node with the Three.js package itself: each is a small, distinct
   figure in the world's materials, inside the budgets a form has on the course map (baked:
   two draw calls, under 900 triangles) and on the progress page (live: a few more draws
   for the moving parts), and each comes back to rest and frees what it made. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Object3D } from "three";
import { makeMaterials, type PaletteMap } from "./materials.ts";
import { buildForm, clampStage, keysFor, FORM_STAGES, BREATH_MS, TURN_MS } from "./forms.ts";
import type { Three } from "./three.ts";

const T = THREE as unknown as Three;
const STAGES = [1, 2, 3, 4, 5];

function palette(): PaletteMap {
  const pal: PaletteMap = new Map();
  const names = ["paper", "under", "stone", "ok", "hot", "accent", "ink", "plotGround"];
  ["algebra", "geometry"].forEach((p) => ["part", "deep", "soft", "ground", "rock", "sky", "fog", "glow", "rink", "ahead"].forEach((k) => names.push(k + ":" + p)));
  names.forEach((n, i) => pal.set(n, new THREE.Color().setRGB(((i * 37) % 255) / 255, ((i * 91) % 255) / 255, ((i * 13) % 255) / 255)));
  return pal;
}

function drawn(o: Object3D): { calls: number; triangles: number } {
  let calls = 0, triangles = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!c.visible || !(m.isMesh || (c as THREE.LineSegments).isLineSegments) || !m.geometry) return;
    calls++;
    if (m.isMesh) triangles += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
  });
  return { calls, triangles };
}

function box(o: Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

/* how many vertices of a colour attribute are the palette's colour `key` */
function painted(geo: THREE.BufferGeometry, pal: PaletteMap, key: string): number {
  const col = geo.getAttribute("color"), c = pal.get(key)!;
  let n = 0;
  for (let i = 0; i < col.count; i++) if (col.getX(i) === Math.fround(c.r) && col.getY(i) === Math.fround(c.g) && col.getZ(i) === Math.fround(c.b)) n++;
  return n;
}

describe("each form", () => {
  const mats = makeMaterials(T), pal = palette();

  it("baked: exactly two draw calls and under 900 triangles, for the course map's budget", () => {
    for (const s of STAGES) {
      const f = buildForm(T, s, mats, pal, "algebra", { live: false });
      const d = drawn(f.group);
      expect([s, d.calls]).toEqual([s, 2]);
      expect(d.triangles).toBeLessThan(900);
      expect(d.triangles).toBe(f.triangles);
      expect(f.calls).toBe(2);
      f.dispose();
    }
  });

  it("live: the moving parts are groups of their own, a few draws more, and the count it reports", () => {
    for (const s of STAGES) {
      const f = buildForm(T, s, mats, pal, "algebra");
      const d = drawn(f.group);
      expect(d.calls).toBe(f.calls);
      expect(d.calls).toBeGreaterThan(2);
      expect(d.calls).toBeLessThanOrEqual(12);
      expect(d.triangles).toBeLessThan(1000);
      f.dispose();
    }
  });

  it("stands with its feet at the ground, facing forward, and grows from stage to stage", () => {
    let last = 0;
    const dims: string[] = [];
    for (const s of STAGES) {
      const f = buildForm(T, s, mats, pal, "algebra");
      const b = box(f.group);
      expect(b.min.y).toBeGreaterThan(-0.01);
      expect(b.min.y).toBeLessThan(0.05);
      expect(b.max.y).toBeCloseTo(f.height, 1);
      expect(f.height).toBeGreaterThan(last);
      last = f.height;
      /* the silhouette: each stage's box differs from every other's in more than height */
      dims.push([b.max.x - b.min.x, b.max.z - b.min.z].map((v) => v.toFixed(2)).join("x"));
      f.dispose();
    }
    expect(new Set(dims).size).toBe(5);
    expect(last).toBeGreaterThan(1.5);
    expect(last).toBeLessThan(2);
  });

  it("is painted in the world's names: the body in accent, gold where it shines, the cloak in the Part's hue, ink on the edges", () => {
    for (const s of STAGES) {
      const f = buildForm(T, s, mats, pal, "geometry", { live: false });
      const mesh = f.group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
      const edges = f.group.children.find((c) => (c as THREE.LineSegments).isLineSegments) as THREE.LineSegments;
      expect(painted(mesh.geometry, pal, "accent")).toBeGreaterThan(0);
      expect(painted(mesh.geometry, pal, "paper")).toBeGreaterThan(0);
      expect(painted(edges.geometry, pal, "ink")).toBe(edges.geometry.getAttribute("color").count);
      if (s >= 3) expect(painted(mesh.geometry, pal, "part:geometry")).toBeGreaterThan(0);
      if (s >= 3) expect(painted(mesh.geometry, pal, "hot")).toBeGreaterThan(0);
      f.dispose();
    }
  });

  it("falls back to the accent for a Part the palette does not have, and repaints from another palette", () => {
    expect(keysFor(pal, "nowhere")).toMatchObject({ part: "accent", deep: "stone" });
    expect(keysFor(pal, "algebra")).toMatchObject({ part: "part:algebra", deep: "deep:algebra" });
    const f = buildForm(T, 5, mats, pal, "algebra");
    /* the main mesh: the one with vertex colours (the halo has none) */
    const mesh = f.group.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.getAttribute("color")) as THREE.Mesh;
    const before = painted(mesh.geometry, pal, "accent");
    const other: PaletteMap = new Map();
    pal.forEach((c, k) => other.set(k, c.clone().offsetHSL(0.5, 0, 0)));
    f.paint(other);
    expect(painted(mesh.geometry, pal, "accent")).toBe(0);
    expect(painted(mesh.geometry, other, "accent")).toBe(before);
    f.dispose();
  });

  it("moves its live parts with time and comes back to rest", () => {
    for (const s of STAGES) {
      const f = buildForm(T, s, mats, pal, "algebra");
      const live = f.group.children.filter((c) => (c as THREE.Group).isGroup);
      expect(live.length).toBeGreaterThan(0);
      live.forEach((g) => g.updateMatrix());
      const rest = live.map((g) => g.matrix.clone());
      f.idle(BREATH_MS * 0.3 + TURN_MS * 0.1, true);
      live.forEach((g) => g.updateMatrix());
      expect(live.some((g, i) => !g.matrix.equals(rest[i]))).toBe(true);
      f.idle(12345, false);
      live.forEach((g, i) => { g.updateMatrix(); expect(g.matrix.equals(rest[i])).toBe(true); });
      f.dispose();
    }
  });

  it("frees every geometry it made, and never the shared materials", () => {
    const f = buildForm(T, 5, mats, pal, "algebra");
    const geos: THREE.BufferGeometry[] = [];
    f.group.traverse((c) => { const g = (c as THREE.Mesh).geometry; if (g) geos.push(g); });
    let freed = 0;
    geos.forEach((g) => g.addEventListener("dispose", () => { freed++; }));
    let matFreed = false;
    mats.solid.addEventListener("dispose", () => { matFreed = true; });
    f.dispose();
    expect(freed).toBe(geos.length);
    expect(matFreed).toBe(false);
  });

  it("holds the stage to 1..5", () => {
    expect([clampStage(0), clampStage(9), clampStage(NaN), clampStage("3"), clampStage(3.7), clampStage(5)]).toEqual([1, 5, 1, 1, 3, 5]);
    expect(FORM_STAGES).toBe(5);
    const f = buildForm(T, 42, mats, pal, "algebra", { live: false });
    expect(f.stage).toBe(5);
    f.dispose();
  });
});
