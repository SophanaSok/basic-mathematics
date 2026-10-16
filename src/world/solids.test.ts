import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Three } from "./three.ts";
import { Batch } from "./batch.ts";
import { faceNormalsY, hollowCount, hollowPaint, solidGeometry, TRIS } from "./solids.ts";
import type { Solid } from "./state.ts";

const T = THREE as unknown as Three;
const SOLIDS: Solid[] = ["cube", "tetra", "octa", "icosa"];

describe("solids", () => {
  it.each(SOLIDS)("%s: triangles, non-indexed, circumradius", (s) => {
    const g = solidGeometry(T, s, 0.5);
    expect(g.getIndex()).toBeNull();
    expect(g.getAttribute("position").count / 3).toBe(TRIS[s]);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) expect(Math.hypot(p.getX(i), p.getY(i), p.getZ(i))).toBeCloseTo(0.5, 5);
  });

  it.each(SOLIDS)("%s: faceNormalsY matches the geometry", (s) => {
    const b = new Batch();
    const seen: number[] = [];
    b.add(solidGeometry(T, s, 1), null, (ny) => { seen.push(ny); return "a"; });
    seen.sort((a, c) => c - a);
    const want = faceNormalsY(s);
    expect(want.length).toBe(TRIS[s]);
    want.forEach((v, i) => expect(seen[i]).toBeCloseTo(v, 4));
  });

  it.each(SOLIDS)("%s: hollowPaint empties the top fraction", (s) => {
    for (const h of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
      const b = new Batch();
      const ranges = b.add(solidGeometry(T, s, 1), null, hollowPaint(s, h, "solid", "hollow"));
      const hollow = ranges.filter((r) => r.key === "hollow").reduce((n, r) => n + r.count / 3, 0);
      expect(hollow).toBe(hollowCount(s, h));
      expect(hollow).toBeLessThanOrEqual(Math.floor(TRIS[s] * h + 1e-9));
      if (h === 0) expect(hollow).toBe(0);
      if (h === 1) expect(hollow).toBe(TRIS[s]);
    }
  });

  it("exact counts where the normals allow", () => {
    expect(hollowCount("octa", 0.5)).toBe(4);
    expect(hollowCount("tetra", 0.5)).toBe(2);
    expect(hollowCount("cube", 0.5)).toBe(2);   /* top pair, then the eight sides tie */
    expect(hollowCount("icosa", 0.5)).toBe(8);   /* ties: the nearest step below 10 */
  });

  it("hollow faces are the upper ones", () => {
    const p = hollowPaint("octa", 0.5, "s", "h");
    expect(p(0.5774)).toBe("h");
    expect(p(-0.5774)).toBe("s");
  });
});
