import { describe, expect, it } from "vitest";
import { bins, chartLayout, niceStep, niceTicks, quartiles } from "./chart.ts";

const vals = (...v: number[]) => v.map((value) => ({ value }));
/* every number anywhere in a layout is finite (JSON would turn a NaN into null) */
const finite = (o: unknown): void => {
  if (typeof o === "number") expect(Number.isFinite(o)).toBe(true);
  else if (o && typeof o === "object") Object.values(o).forEach(finite);
};

describe("quartiles, by the median of the halves", () => {
  it("leaves the median out of both halves for an odd count", () => {
    expect(quartiles([1, 2, 3, 4, 5, 6, 7])).toEqual({ min: 1, q1: 2, median: 4, q3: 6, max: 7 });
    expect(quartiles([1, 2, 3, 4, 5])).toEqual({ min: 1, q1: 1.5, median: 3, q3: 4.5, max: 5 });
  });
  it("splits an even count in two", () => {
    expect(quartiles([1, 2, 3, 4, 5, 6])).toEqual({ min: 1, q1: 2, median: 3.5, q3: 5, max: 6 });
    expect(quartiles([7, 1, 3, 5])).toEqual({ min: 1, q1: 2, median: 4, q3: 6, max: 7 });
  });
  it("takes one value for all five, and two values as the two quartiles", () => {
    expect(quartiles([9])).toEqual({ min: 9, q1: 9, median: 9, q3: 9, max: 9 });
    expect(quartiles([2, 8])).toEqual({ min: 2, q1: 2, median: 5, q3: 8, max: 8 });
  });
  it("handles repeated values and an empty set", () => {
    expect(quartiles([4, 4, 4, 4])).toEqual({ min: 4, q1: 4, median: 4, q3: 4, max: 4 });
    expect(quartiles([1, 1, 2, 9, 9])).toEqual({ min: 1, q1: 1, median: 2, q3: 9, max: 9 });
    expect(quartiles([])).toBeNull();
  });
});

describe("ticks", () => {
  it("steps by 1, 2 or 5 times a power of ten", () => {
    expect(niceStep(0.03)).toBe(0.05);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.1)).toBe(2);
    expect(niceStep(4.2)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(0)).toBe(1);
  });
  it("widens to the step and has no float noise", () => {
    expect(niceTicks(3, 47)).toMatchObject({ min: 0, max: 50, step: 10, values: [0, 10, 20, 30, 40, 50] });
    expect(niceTicks(0, 1).values).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(-7, 3)).toMatchObject({ min: -8, max: 4, step: 2 });
  });
  it("gives one value a unit either side, and counts in whole steps", () => {
    expect(niceTicks(5, 5)).toMatchObject({ min: 4, max: 6 });
    expect(niceTicks(0, 3, 5, true).step).toBe(1);
  });
});

describe("histogram bins", () => {
  it("counts a value on an edge in the bin to its right", () => {
    const b = bins([0, 1, 2, 2, 4], 2);
    expect(b.edges).toEqual([0, 2, 4, 6]);
    expect(b.counts).toEqual([2, 2, 1]);
  });
  it("starts on a multiple of the width and covers the largest value", () => {
    const b = bins([13, 27], 10);
    expect(b.edges).toEqual([10, 20, 30]);
    expect(b.counts).toEqual([1, 1]);
  });
  it("makes one bin of all-equal data, and none of nothing", () => {
    expect(bins([5, 5, 5])).toEqual({ edges: [5, 6], counts: [3], width: 1 });
    expect(bins([])).toEqual({ edges: [], counts: [], width: 1 });
  });
  it("chooses a nice width when none is given", () => {
    const b = bins([1, 2, 3, 9, 10, 17]);
    expect(b.counts.reduce((a, c) => a + c, 0)).toBe(6);
    expect(b.edges[1] - b.edges[0]).toBe(b.width);
  });
});

describe("chartLayout", () => {
  it("lays a histogram's bars on its edges, tallest at the top", () => {
    const L = chartLayout("hist", vals(1, 1, 2, 5, 5, 5), { width: 2 });
    expect(L.bars.map((b) => b.value)).toEqual([2, 1, 3]);
    expect(L.bars[0].x + L.bars[0].width).toBeCloseTo(L.bars[1].x);
    expect(L.bars[2].y).toBeLessThan(L.bars[1].y);
    expect(L.bars[0].y + L.bars[0].height).toBeCloseTo(L.box.b);
    finite(L);
  });
  it("stacks equal values in a dot plot", () => {
    const L = chartLayout("dot", vals(3, 4, 4, 4, 6));
    expect(L.dots).toHaveLength(5);
    const fours = L.dots.filter((d) => d.value === 4);
    expect(new Set(fours.map((d) => d.cx)).size).toBe(1);
    expect(new Set(fours.map((d) => d.cy)).size).toBe(3);
    expect(Math.max(...L.dots.map((d) => d.cy + d.r))).toBeLessThanOrEqual(L.box.b);
    expect(Math.min(...L.dots.map((d) => d.cy - d.r))).toBeGreaterThanOrEqual(L.box.t);
    finite(L);
  });
  it("places a box plot's five numbers in order", () => {
    const L = chartLayout("box", vals(2, 4, 4, 5, 7, 9, 12));
    const f = L.fivePx!;
    expect(L.five).toEqual({ min: 2, q1: 4, median: 5, q3: 9, max: 12 });
    expect([f.min, f.q1, f.median, f.q3, f.max]).toEqual([...[f.min, f.q1, f.median, f.q3, f.max]].sort((a, b) => a - b));
    expect(f.min).toBeGreaterThanOrEqual(L.box.l);
    expect(f.max).toBeLessThanOrEqual(L.box.r);
    finite(L);
  });
  it("sits bars side by side on the baseline, and below it for a negative", () => {
    const L = chartLayout("bar", [{ label: "A", value: 4 }, { label: "B", value: 10 }, { label: "C", value: -2 }]);
    expect(L.bars.map((b) => b.label)).toEqual(["A", "B", "C"]);
    expect(L.bars[0].x + L.bars[0].width).toBeLessThan(L.bars[1].x);
    expect(L.bars[1].height).toBeGreaterThan(L.bars[0].height);
    const zero = L.y!.ticks.find((t) => t.value === 0)!.pos;
    expect(L.bars[0].y + L.bars[0].height).toBeCloseTo(zero);
    expect(L.bars[2].y).toBeCloseTo(zero);
    finite(L);
  });
  it("puts negative scatter points inside the frame", () => {
    const L = chartLayout("scatter", [{ x: -3, y: -8 }, { x: 0, y: 0 }, { x: 4, y: 6 }]);
    expect(L.x!.min).toBeLessThanOrEqual(-3);
    expect(L.y!.min).toBeLessThanOrEqual(-8);
    L.points.forEach((p) => {
      expect(p.cx).toBeGreaterThanOrEqual(L.box.l - 1e-9);
      expect(p.cx).toBeLessThanOrEqual(L.box.r + 1e-9);
      expect(p.cy).toBeGreaterThanOrEqual(L.box.t - 1e-9);
      expect(p.cy).toBeLessThanOrEqual(L.box.b + 1e-9);
    });
    expect(L.points[0].cy).toBeGreaterThan(L.points[2].cy);
    expect(L.y!.ticks.map((t) => t.label)).toContain("−5");
    finite(L);
  });
  it("draws nothing for no usable rows, with no NaN", () => {
    for (const kind of ["dot", "hist", "box", "bar", "scatter"] as const) {
      const L = chartLayout(kind, []);
      expect(L).toMatchObject({ empty: true, dots: [], bars: [], points: [], five: null, x: null, y: null });
      finite(L);
      const bad = chartLayout(kind, [{ value: NaN, x: NaN, y: NaN, label: "x" }]);
      expect(bad.empty).toBe(true);
    }
  });
  it("copes with a single value of every kind", () => {
    for (const L of [
      chartLayout("dot", vals(7)), chartLayout("hist", vals(7)), chartLayout("box", vals(7)),
      chartLayout("bar", [{ label: "A", value: 7 }]), chartLayout("scatter", [{ x: 7, y: 7 }]),
      chartLayout("bar", [{ label: "A", value: 0 }]), chartLayout("scatter", [{ x: 0, y: 0 }])
    ]) {
      expect(L.empty).toBe(false);
      finite(L);
    }
  });
});
