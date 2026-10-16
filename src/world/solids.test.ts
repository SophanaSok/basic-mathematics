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

  it.each(SOLIDS)("%s: every flat face has its own normal-y", (s) => {
    const ys = faceNormalsY(s);
    const groups: number[] = [];
    ys.forEach((v) => { if (!groups.length || groups[groups.length - 1] - v > 1e-3) groups.push(v); });
    expect(groups.length).toBe(s === "cube" ? 6 : TRIS[s]);
    for (let i = 1; i < groups.length; i++) expect(groups[i - 1] - groups[i]).toBeGreaterThan(0.05);
  });

  it.each(SOLIDS)("%s: hollowPaint empties the top fraction", (s) => {
    let last = 0;
    for (const h of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1]) {
      const b = new Batch();
      const ranges = b.add(solidGeometry(T, s, 1), null, hollowPaint(s, h, "solid", "hollow"));
      const hollow = ranges.filter((r) => r.key === "hollow").reduce((n, r) => n + r.count / 3, 0);
      expect(hollow).toBe(hollowCount(s, h));
      expect(hollow).toBeGreaterThanOrEqual(last);
      last = hollow;
      if (h === 0) expect(hollow).toBe(0);
      if (h > 0 && h < 1) { expect(hollow).toBeGreaterThan(0); expect(hollow).toBeLessThan(TRIS[s]); }
      if (h === 1) expect(hollow).toBe(TRIS[s]);
    }
  });

  it("the count rule: nearest achievable, at least one group", () => {
    expect(hollowCount("tetra", 0.1)).toBe(1);
    expect(hollowCount("octa", 0.3)).toBe(2);
    expect(hollowCount("cube", 0.5)).toBe(6);   /* three squares */
    expect(hollowCount("octa", 0.5)).toBe(4);
    expect(hollowCount("icosa", 0.5)).toBe(10);
    expect(hollowCount("cube", 0.01)).toBe(2);
    expect(hollowCount("cube", NaN)).toBe(0);
    expect(hollowCount("cube", -1)).toBe(0);
    expect(hollowCount("cube", 2)).toBe(12);
  });

  it("hollow faces are the upper ones", () => {
    const p = hollowPaint("octa", 0.5, "s", "h");
    expect(p(0.5774)).toBe("h");
    expect(p(-0.5774)).toBe("s");
  });
});
