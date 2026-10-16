/* The per-region boss solids (one of four Platonic shapes per Part) and the "hollowed"
   paint that shows damage: the faces empty from the top down as problems fall, as the
   chapter page's sigil does (assets/encounter.js: on = ceil(faces * hp / total)). */

import type { BufferGeometry } from "three";
import type { Three } from "./three.ts";
import type { Solid } from "./state.ts";

/** triangles per solid, as the geometries below make them */
export const TRIS: Readonly<Record<Solid, number>> = { cube: 12, tetra: 4, octa: 8, icosa: 20 };

/* the one fixed tilt baked into every solid, so that no two of its flat faces have the same normal-y (a Paint sees
   only ny; untilted, a tetra's faces would tie in pairs and a cube's in sixes). The stamp may then turn it only about y. */
export const TILT_X = 0.27;
export const TILT_Z = 0.32;

/** the solid, tilted by (TILT_X, TILT_Z), non-indexed (the Batch expands any index anyway) with its vertices on a sphere of `radius` */
export function solidGeometry(T: Three, solid: Solid, radius: number): BufferGeometry {
  let g: BufferGeometry;
  if (solid === "cube") { const e = (2 * radius) / Math.sqrt(3); g = new T.BoxGeometry(e, e, e); }
  else if (solid === "tetra") g = new T.TetrahedronGeometry(radius, 0);
  else if (solid === "octa") g = new T.OctahedronGeometry(radius, 0);
  else g = new T.IcosahedronGeometry(radius, 0);
  /* BoxGeometry is indexed; the polyhedra already are not */
  if (g.getIndex()) g = g.toNonIndexed();
  g.rotateX(TILT_X);
  g.rotateZ(TILT_Z);
  g.computeVertexNormals();
  return g;
}

/* the outward face directions of each solid, unrotated (a cube's six faces, each of two triangles) */
function faceDirs(solid: Solid): { d: [number, number, number]; tris: number }[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const sg = [1, -1];
  const out: [number, number, number][] = [];
  if (solid === "cube") out.push([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]);
  else if (solid === "tetra") out.push([-1, -1, -1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]);
  else {
    for (const x of sg) for (const y of sg) for (const z of sg) out.push([x, y, z]);
    if (solid === "icosa") for (const a of sg) for (const b of sg) out.push([0, a * phi, b / phi], [a / phi, 0, b * phi], [a * phi, b / phi, 0]);
  }
  return out.map((d) => ({ d, tris: solid === "cube" ? 2 : 1 }));
}

/* the up component of every triangle's normal for the baked geometry, highest first (computed from the face
   directions and the tilt; the tests check them against the geometry) */
export function faceNormalsY(solid: Solid): number[] {
  const ca = Math.cos(TILT_X), sa = Math.sin(TILT_X), cb = Math.cos(TILT_Z), sb = Math.sin(TILT_Z);
  const ys: number[] = [];
  for (const { d: [x, y, z], tris } of faceDirs(solid)) {
    const n = Math.hypot(x, y, z);
    const y1 = (y * ca - z * sa) / n;
    const ny = (x / n) * sb + y1 * cb;
    for (let i = 0; i < tris; i++) ys.push(ny);
  }
  return ys.sort((a, b) => b - a);
}

/* faces within this of each other in ny are one level: a Paint sees only ny, so they cannot be told apart */
const EPS = 1e-4;

/** the triangle counts that hollowing the top faces can give, ascending: 0, then after each face group (coplanar triangles) */
function steps(solid: Solid): number[] {
  const ys = faceNormalsY(solid);
  const out = [0];
  for (let i = 0; i < ys.length;) {
    let j = i;
    while (j < ys.length && ys[i] - ys[j] < EPS) j++;
    out.push(j); i = j;
  }
  return out;
}

/** how many triangles `hollowPaint` empties: the achievable count nearest to faces * hollow (halves round up), at least
    one face group when 0 < hollow < 1 and never all of them before the solid is finished; 0 at hollow <= 0 or NaN, all at >= 1 */
export function hollowCount(solid: Solid, hollow: number): number {
  const st = steps(solid);
  const total = st[st.length - 1];
  if (!Number.isFinite(hollow) || hollow <= 0) return 0;
  if (hollow >= 1) return total;
  const want = total * hollow;
  let best = st[1], bestD = Math.abs(want - st[1]);
  for (let i = 2; i < st.length - 1; i++) {
    const d = Math.abs(want - st[i]);
    if (d < bestD - 1e-9 || Math.abs(d - bestD) <= 1e-9) { best = st[i]; bestD = d; }
  }
  return best;
}

/** a Paint that gives `hollowKey` to the top `hollow` fraction of the solid's faces by normal-y and `solidKey` to the rest.
    Valid for a stamp that turns the solid only about y (the tilt is in the geometry), as the Batch hands the Paint the stamped normal. */
export function hollowPaint(solid: Solid, hollow: number, solidKey: string, hollowKey: string): (ny: number) => string {
  const n = hollowCount(solid, hollow);
  if (n === 0) return () => solidKey;
  const ys = faceNormalsY(solid);
  const cut = ys[n - 1] - EPS;
  return (ny) => (ny >= cut ? hollowKey : solidKey);
}
