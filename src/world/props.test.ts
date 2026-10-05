import { describe, expect, it } from "vitest";
import { layout, ISLE_R, ROW_Z, segmentDistance } from "./layout.ts";
import { placeProps, placeRange, biomeOf, KINDS, EXTRA_COUNT, RIM, RIM_IN, RANGE_HALF, type Prop } from "./props.ts";
import { course, motifs } from "./course.test-helper.ts";

const C = course();
const L = layout(C);
const M = motifs(C);

describe("the props of each region", () => {
  it("are each Part's own: the Foundry forges, the Fields tents, the Grid lattices, the Observatory a dome", () => {
    expect(C.parts.map((p, i) => biomeOf(M[i], i))).toEqual(["forge", "fields", "grid", "stars"]);
    const props = placeProps(L, M, 0);
    const kinds = (p: number) => props.filter((q) => q.p === p).map((q) => q.kind);
    expect(kinds(0)).toEqual(expect.arrayContaining(["chimney", "furnace", "crates"]));
    expect(kinds(1)).toEqual(expect.arrayContaining(["tent", "hill", "tree"]));
    expect(kinds(2)).toEqual(expect.arrayContaining(["lattice", "beam", "node"]));
    expect(kinds(3)).toEqual(expect.arrayContaining(["dome", "telescope", "starpost"]));
  });

  it("are the same every time", () => {
    expect(placeProps(L, M, 2)).toEqual(placeProps(L, M, 2));
  });

  const rims = Object.values(RIM) as string[];
  it("grow in number with the tier's detail", () => {
    const n = [0, 1, 2].map((d) => placeProps(L, M, d as 0 | 1 | 2).filter((q) => rims.indexOf(q.kind) === -1).length);
    expect(n[0]).toBeLessThan(n[1]);
    expect(n[1]).toBeLessThan(n[2]);
    /* nearly every one asked for finds room */
    expect(n[2]).toBeGreaterThanOrEqual((15 + EXTRA_COUNT[2] * 4) * 0.85);
  });

  it("dress each terrace's front edge with a rim of its own kind, closer set with each tier's detail", () => {
    for (const d of [0, 1, 2] as const) {
      const props = placeProps(L, M, d);
      C.parts.forEach((part, p) => {
        const rim = props.filter((q) => q.p === p && q.kind === RIM[biomeOf(M[p], p)]);
        expect(rim.length, part.id + " at detail " + d).toBeGreaterThanOrEqual(5);
        rim.forEach((q) => expect(Math.abs(q.z - (L.regions[p].z1 - RIM_IN))).toBeLessThan(0.1));
      });
    }
    const count = (d: 0 | 1 | 2) => placeProps(L, M, d).filter((q) => rims.indexOf(q.kind) !== -1).length;
    expect(count(0)).toBeLessThan(count(1));
    expect(count(1)).toBeLessThan(count(2));
  });

  for (const detail of [0, 1, 2] as const) {
    it("keep clear of the islands, the path, the gates and each other, on their own terrace (detail " + detail + ")", () => {
      const props = placeProps(L, M, detail);
      const near: string[] = [];
      props.forEach((q: Prop, i) => {
        const r = KINDS[q.kind].r, region = L.regions[q.p];
        if (q.x - r < region.x0 || q.x + r > region.x1 || q.z - r < region.z0 || q.z + r > region.z1) near.push(q.kind + " off its terrace");
        L.isles.forEach((s) => { if (Math.hypot(s.x - q.x, s.z - q.z) < ISLE_R + r) near.push(q.kind + " on island " + s.id); });
        for (let k = 1; k < L.path.length; k++) if (segmentDistance(q.x, q.z, L.path[k - 1], L.path[k]) < r + 0.5) near.push(q.kind + " on the path");
        L.gates.forEach((g) => { if (Math.hypot(g.at[0] - q.x, g.at[2] - q.z) < r + 1.4) near.push(q.kind + " at a gate"); });
        props.forEach((o, j) => { if (j !== i && o.p === q.p && Math.hypot(o.x - q.x, o.z - q.z) < r + KINDS[o.kind].r) near.push(q.kind + " on a " + o.kind); });
        /* a tall prop never stands in front of its row, where it would hide a chapter */
        if (KINDS[q.kind].tall) {
          const ends = Math.max(...L.isles.filter((s) => s.p === q.p).map((s) => Math.abs(s.x))) + ISLE_R;
          if (!(q.z < -ROW_Z * q.p - 1 || Math.abs(q.x) - r > ends)) near.push("tall " + q.kind + " in front of row " + q.p);
        }
      });
      expect(near).toEqual([]);
    });
  }
});

describe("the far hills", () => {
  const last = L.regions[L.regions.length - 1];
  const peaks = placeRange(L);

  it("stand in two rows behind the last terrace, from side to side, the same every time", () => {
    expect(peaks.length).toBeGreaterThanOrEqual(16);
    expect(placeRange(L)).toEqual(peaks);
    peaks.forEach((pk) => { expect(pk.z).toBeLessThan(last.z0); expect(pk.part).toBe(last.id); });
    expect(Math.min(...peaks.map((pk) => pk.x))).toBeLessThanOrEqual(-RANGE_HALF + 1);
    expect(Math.max(...peaks.map((pk) => pk.x))).toBeGreaterThanOrEqual(RANGE_HALF - 4);
  });

  it("never rise through the terrace: over it, every cone is below the terrace's top", () => {
    /* a cone's height at the terrace's back edge, the nearest the terrace comes to it */
    peaks.forEach((pk) => {
      const atEdge = pk.base + pk.h * Math.max(0, 1 - (last.z0 - pk.z) / pk.r);
      expect(atEdge).toBeLessThanOrEqual(last.top);
    });
  });

  it("stand taller than the terrace, so the last Part's view has hills behind it, not empty sky", () => {
    expect(Math.min(...peaks.map((pk) => pk.base + pk.h))).toBeGreaterThan(last.top);
  });
});
