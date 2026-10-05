/* Two primitives Three.js has no class for (or none the vendor module carries): a flat
   prism from a polygon, and a circle as line segments. */

import type { Three } from "./three.ts";
import type { BufferGeometry } from "three";

/** the polygon pts (x, y; convex, either winding) given thickness `depth` along z, centred on z = 0 */
export function prism(T: Three, pts: [number, number][], depth: number): BufferGeometry {
  const h = depth / 2, out: number[] = [];
  /* wound counter-clockwise seen from +z */
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const P = area < 0 ? pts.slice().reverse() : pts;
  const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c);
  for (let i = 1; i < P.length - 1; i++) {
    tri([P[0][0], P[0][1], h], [P[i][0], P[i][1], h], [P[i + 1][0], P[i + 1][1], h]);
    tri([P[0][0], P[0][1], -h], [P[i + 1][0], P[i + 1][1], -h], [P[i][0], P[i][1], -h]);
  }
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    tri([a[0], a[1], h], [a[0], a[1], -h], [b[0], b[1], -h]);
    tri([a[0], a[1], h], [b[0], b[1], -h], [b[0], b[1], h]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(out), 3));
  return g;
}

/** a horizontal circle of radius r as `n` line segments */
export function circle(T: Three, r: number, n: number): BufferGeometry {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
    out.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(out), 3));
  return g;
}
