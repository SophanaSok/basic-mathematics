/* The per-region boss solids (one of four Platonic shapes per Part) and the "hollowed"
   paint that shows damage: the faces empty from the top down as problems fall, as the
   chapter page's sigil does (assets/encounter.js: on = ceil(faces * hp / total)). */

import type { BufferGeometry } from "three";
import type { Three } from "./three.ts";
import type { Solid } from "./state.ts";

/** triangles per solid, as the geometries below make them */
export const TRIS: Readonly<Record<Solid, number>> = { cube: 12, tetra: 4, octa: 8, icosa: 20 };

/** the solid, non-indexed (the Batch expands any index anyway) with its vertices on a sphere of `radius` */
export function solidGeometry(T: Three, solid: Solid, radius: number): BufferGeometry {
  let g: BufferGeometry;
  if (solid === "cube") { const e = (2 * radius) / Math.sqrt(3); g = new T.BoxGeometry(e, e, e); }
  else if (solid === "tetra") g = new T.TetrahedronGeometry(radius, 0);
  else if (solid === "octa") g = new T.OctahedronGeometry(radius, 0);
  else g = new T.IcosahedronGeometry(radius, 0);
  /* BoxGeometry is indexed; the polyhedra already are not */
  return g.getIndex() ? g.toNonIndexed() : g;
}

/* the up component of every triangle's normal, the solid unrotated, highest first (known
   analytically from the Three.js vertex layout; the tests check them against the geometry) */
export function faceNormalsY(solid: Solid): number[] {
  const r3 = 1 / Math.sqrt(3);
  let ys: number[];
  if (solid === "cube") ys = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1];
  else if (solid === "tetra") ys = [r3, r3, -r3, -r3];
  else if (solid === "octa") ys = [r3, r3, r3, r3, -r3, -r3, -r3, -r3];
  else {
    const phi = (1 + Math.sqrt(5)) / 2;
    /* the 20 face directions of an icosahedron, up to sign: (±1,±1,±1), (0,±1/φ,±φ), (±1/φ,±φ,0), (±φ,0,±1/φ), over √3 */
    const raw = [1, 1, 1, 1, -1, -1, -1, -1, 1 / phi, 1 / phi, -1 / phi, -1 / phi, phi, phi, -phi, -phi, 0, 0, 0, 0];
    ys = raw.map((v) => v * r3);
  }
  return ys.slice().sort((a, b) => b - a);
}

/* faces within this of each other in ny are one level: a Paint sees only ny, so they cannot be told apart */
const EPS = 1e-4;

/** how many faces `hollowPaint` empties for this fraction: floor(faces * hollow), or the nearest count below it
    that a normal-y threshold can give (faces of equal ny go together, so a cube's top two faces are one step) */
export function hollowCount(solid: Solid, hollow: number): number {
  const ys = faceNormalsY(solid);
  const want = Math.floor(ys.length * Math.min(1, Math.max(0, hollow)) + 1e-9);
  let n = 0;
  for (let i = 0; i < ys.length;) {
    let j = i;
    while (j < ys.length && ys[i] - ys[j] < EPS) j++;
    if (j > want) break;
    n = j; i = j;
  }
  return n;
}

/** a Paint that gives `hollowKey` to the top `hollow` fraction of the solid's faces by normal-y and `solidKey` to the rest.
    Valid for a stamp that keeps the solid's up axis (no tilt), as the Batch hands the Paint the stamped normal. */
export function hollowPaint(solid: Solid, hollow: number, solidKey: string, hollowKey: string): (ny: number) => string {
  const n = hollowCount(solid, hollow);
  if (n === 0) return () => solidKey;
  const ys = faceNormalsY(solid);
  const cut = ys[n - 1] - EPS;
  return (ny) => (ny >= cut ? hollowKey : solidKey);
}
