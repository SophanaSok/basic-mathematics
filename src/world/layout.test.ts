import { describe, expect, it } from "vitest";
import { layout, rowAt, segmentDistance, ISLE_R, ROW_Z, ROW_Y, PLINTH } from "./layout.ts";
import { course } from "./course.test-helper.ts";

const C = course();
const L = layout(C);

describe("the course world's layout", () => {
  it("stands one island per chapter, in reading order, each Part on its own row", () => {
    expect(L.isles.map((s) => s.id)).toEqual(C.parts.flatMap((p) => p.chapters.map((ch) => ch.id)));
    expect(L.isles.length).toBe(17);
    L.isles.forEach((s) => {
      expect(s.z).toBe(-ROW_Z * s.p);
      expect(s.y).toBe(ROW_Y * s.p);
      expect([s.x, s.y, s.z].every(Number.isFinite)).toBe(true);
    });
    /* rows alternate direction, so the path snakes */
    const first = (p: number) => L.isles.filter((s) => s.p === p)[0].x;
    expect(Math.sign(first(0))).toBe(-1);
    expect(Math.sign(first(1))).toBe(1);
  });

  it("has a review gate per Part, at the island of the chapter that carries #review", () => {
    expect(L.gates.map((g) => g.part)).toEqual(C.parts.map((p) => p.id));
    L.gates.forEach((g) => {
      const ch = C.parts[g.p].chapters.find((c) => c.id === L.isles[g.isle].id)!;
      expect((ch.sections || []).some((s) => s.id === "review")).toBe(true);
    });
  });

  it("gives each Part a terrace under all its islands and its gate, one step up and back from the last", () => {
    expect(L.regions.map((r) => r.id)).toEqual(C.parts.map((p) => p.id));
    L.regions.forEach((r, p) => {
      expect(r.top).toBeCloseTo(ROW_Y * p - PLINTH);
      if (p) {
        expect(r.z1).toBeCloseTo(L.regions[p - 1].z0);
        expect(r.top - L.regions[p - 1].top).toBeCloseTo(ROW_Y);
      }
      L.isles.filter((s) => s.p === p).forEach((s) => {
        expect(s.x - ISLE_R).toBeGreaterThan(r.x0);
        expect(s.x + ISLE_R).toBeLessThan(r.x1);
        expect(s.z - ISLE_R).toBeGreaterThan(r.z0);
        expect(s.z + ISLE_R).toBeLessThan(r.z1);
      });
      const g = L.gates[p];
      expect(Math.abs(g.at[0]) + 1.4).toBeLessThan(r.x1);
    });
  });

  it("runs the path through every island and a bend after each Part", () => {
    expect(L.path.length).toBe(17 + 4);
    L.isles.forEach((s) => expect(L.path.some((v) => v[0] === s.x && v[2] === s.z)).toBe(true));
  });

  it("measures rows and distances on the ground", () => {
    expect(rowAt(0, 4)).toBe(0);
    expect(rowAt(-ROW_Z * 1.5, 4)).toBeCloseTo(1.5);
    expect(rowAt(-ROW_Z * 9, 4)).toBe(3);
    expect(rowAt(5, 4)).toBe(0);
    expect(segmentDistance(0, 1, [-1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(segmentDistance(3, 0, [-1, 0, 0], [1, 0, 0])).toBeCloseTo(2);
  });
});
