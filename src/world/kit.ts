/* The builder's kit: named primitives, made once and stamped into a Batch (solids) and an
   EdgeBatch (their ink edges) wherever a matrix puts them. */

import type { Three } from "./three.ts";
import type { BufferGeometry, Matrix4, Object3D } from "three";
import { Batch, EdgeBatch, type Paint, type Range } from "./batch.ts";

export type V3 = [number, number, number];
export interface Place { p?: V3; r?: V3; s?: V3 | number }

export class Kit {
  readonly solids = new Batch();
  readonly edges = new EdgeBatch();
  private cache = new Map<string, { geo: BufferGeometry; edges: BufferGeometry | null }>();
  private o: Object3D;
  readonly T: Three;
  constructor(T: Three) { this.T = T; this.o = new T.Object3D(); }

  /** a matrix from a position, an Euler rotation (XYZ) and a scale */
  matrix(at: Place): Matrix4 {
    const o = this.o;
    o.position.set(...(at.p || [0, 0, 0]));
    o.rotation.set(...(at.r || [0, 0, 0]));
    const s = at.s === undefined ? 1 : at.s;
    if (typeof s === "number") o.scale.set(s, s, s); else o.scale.set(...s);
    o.updateMatrix();
    return o.matrix.clone();
  }

  /** the primitive `name`, made by `make` the first time; edges where faces meet at more than `angle` degrees (none for 0) */
  shape(name: string, make: () => BufferGeometry, angle = 25): void {
    if (this.cache.has(name)) return;
    const geo = make();
    this.cache.set(name, { geo, edges: angle > 0 ? new this.T.EdgesGeometry(geo, angle) : null });
  }

  /** stamps `name` at `local` inside `parent`, painted `paint`, inked `ink` (null: no edges); returns its solid ranges */
  put(name: string, parent: Matrix4 | null, local: Place, paint: Paint, ink: string | null = "ink"): Range[] {
    const c = this.cache.get(name);
    if (!c) throw new Error("world kit: no shape " + name);
    const m = parent ? parent.clone().multiply(this.matrix(local)) : this.matrix(local);
    const ranges = this.solids.add(c.geo, m, paint);
    if (ink && c.edges) this.edges.add(c.edges, m, ink);
    return ranges;
  }

  /** a line geometry (already segments) stamped into the edges only */
  line(geo: BufferGeometry, parent: Matrix4 | null, local: Place, key: string): void {
    const m = parent ? parent.clone().multiply(this.matrix(local)) : this.matrix(local);
    this.edges.add(geo, m, key);
  }

  dispose(): void {
    for (const c of this.cache.values()) { c.geo.dispose(); if (c.edges) c.edges.dispose(); }
    this.cache.clear();
  }
}
