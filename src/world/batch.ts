/* Many primitives drawn as one: a Batch takes Three.js geometries, each placed by a
   matrix and painted by a named colour, and makes a single non-indexed geometry with
   flat normals and vertex colours, so a whole region of props, every island and every
   stone of the path cost one draw call, and their ink edges one more (EdgeBatch).

   The colours are names ("paper", "part:algebra", "ground:geometry", ...: the keys of
   src/world/materials.ts readPalette), recorded per range of vertices, so a theme change
   repaints the batch in place (paint) and a chapter's progress recolours its cap alone
   (repaint), with no geometry rebuilt.

   Three.js is handed in (BM3D.THREE in the browser, the package itself in the unit
   tests), never imported, so the world chunk holds none of it. */

import type { Three } from "./three.ts";
import type { BufferGeometry, Color, Matrix4 } from "three";

/** a colour name, or one chosen per triangle by the triangle's normal (ny: its up component) */
export type Paint = string | ((ny: number) => string);

export interface Range {
  /** first vertex and how many */
  start: number; count: number;
  key: string;
}

export type Palette = (key: string) => Color;

/* the positions of a geometry as a flat list of triangles (or of line segments, for
   EdgesGeometry), its index expanded */
function flat(geo: BufferGeometry): Float32Array {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const n = index ? index.count : pos.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = index ? index.getX(i) : i;
    out[i * 3] = pos.getX(v); out[i * 3 + 1] = pos.getY(v); out[i * 3 + 2] = pos.getZ(v);
  }
  return out;
}

function transform(src: Float32Array, m: Matrix4 | null): Float32Array {
  if (!m) return src;
  const e = m.elements, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}

class Collector {
  protected chunks: Float32Array[] = [];
  protected length = 0;
  readonly ranges: Range[] = [];
  protected push(v: Float32Array, keys: string[], per: number): Range[] {
    const added: Range[] = [];
    let at = this.length / 3;
    for (let k = 0; k < keys.length; k++) {
      const last = this.ranges[this.ranges.length - 1];
      if (last && last.key === keys[k] && last.start + last.count === at && added.length) last.count += per;
      else { const r = { start: at, count: per, key: keys[k] }; this.ranges.push(r); added.push(r); }
      at += per;
    }
    this.chunks.push(v);
    this.length += v.length;
    return added;
  }
  protected positions(): Float32Array {
    const out = new Float32Array(this.length);
    let at = 0;
    for (const c of this.chunks) { out.set(c, at); at += c.length; }
    return out;
  }
  get vertices(): number { return this.length / 3; }
}

/** solids: one Mesh's worth of triangles */
export class Batch extends Collector {
  /** adds a geometry's triangles; returns the ranges it took, in order */
  add(geo: BufferGeometry, m: Matrix4 | null, paint: Paint): Range[] {
    const v = transform(flat(geo), m);
    const tris = v.length / 9;
    const keys: string[] = [];
    for (let t = 0; t < tris; t++) {
      if (typeof paint === "string") { keys.push(paint); continue; }
      const o = t * 9;
      const ax = v[o + 3] - v[o], ay = v[o + 4] - v[o + 1], az = v[o + 5] - v[o + 2];
      const bx = v[o + 6] - v[o], by = v[o + 7] - v[o + 1], bz = v[o + 8] - v[o + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      keys.push(paint(ny / len));
    }
    return this.push(v, keys, 3);
  }
  get triangles(): number { return this.vertices / 3; }
  build(T: Three, pal: Palette): { geometry: BufferGeometry; ranges: Range[] } {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.positions(), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(this.length), 3));
    g.computeVertexNormals();       /* non-indexed: each triangle's own normal, so faces are flat */
    paint(g, this.ranges, pal);
    g.computeBoundingSphere();
    return { geometry: g, ranges: this.ranges };
  }
}

/** ink edges: one LineSegments' worth of segments */
export class EdgeBatch extends Collector {
  /** adds an EdgesGeometry's segments (or any line-segment geometry) */
  add(edges: BufferGeometry, m: Matrix4 | null, key: string): Range[] {
    const v = transform(flat(edges), m);
    return this.push(v, [key], v.length / 3);
  }
  build(T: Three, pal: Palette): { geometry: BufferGeometry; ranges: Range[] } {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.positions(), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(this.length), 3));
    paint(g, this.ranges, pal);
    g.computeBoundingSphere();
    return { geometry: g, ranges: this.ranges };
  }
}

/** writes every range's colour into the geometry's colour attribute */
export function paint(g: BufferGeometry, ranges: Range[], pal: Palette): void {
  for (const r of ranges) repaint(g, r, pal, false);
  g.getAttribute("color").needsUpdate = true;
}

/** one range, as its key now says (after the key was changed) */
export function repaint(g: BufferGeometry, r: Range, pal: Palette, flag = true): void {
  const col = g.getAttribute("color");
  const c = pal(r.key);
  const a = col.array as Float32Array;
  for (let i = r.start; i < r.start + r.count; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  if (flag) col.needsUpdate = true;
}
