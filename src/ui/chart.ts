/* The geometry of a data chart: dot plot, histogram, box plot, bar chart, scatterplot.

   A chart is authored as a table (<figure class="widget" data-widget="chart" data-kind=...>,
   see assets/widgets.js W.chart, which reads it). chartLayout() turns the rows into plain
   geometry in a w x h viewBox (scales, nice ticks, bins, quartiles, dot stacks, bar
   positions) and draws nothing; the widget draws it with the plot core. It is pure so the
   rules can be tested without a page: the quartiles are the median-of-halves rule the SAT
   and ACT materials use (for an odd count the median is left out of both halves).

   assets/widgets.js is a script that cannot import a module, so this file puts
   chartLayout on window.BMChart, after the rest of the page's modules, from the entries
   that load widgets.js. */

export type Kind = "dot" | "hist" | "box" | "bar" | "scatter";
export const KINDS: readonly Kind[] = ["dot", "hist", "box", "bar", "scatter"];

export interface Row { label?: string; value?: number; x?: number; y?: number }
export interface Opts {
  w?: number; h?: number;
  /** a histogram's bin width; without it, a nice step for about six bins */
  width?: number;
  xLabel?: string; yLabel?: string;
}
export interface Tick { value: number; pos: number; label: string }
export interface Axis { min: number; max: number; step: number; ticks: Tick[] }
export interface Five { min: number; q1: number; median: number; q3: number; max: number }

export interface Layout {
  kind: Kind; w: number; h: number;
  /** nothing to draw: no usable rows (never NaN anywhere below) */
  empty: boolean;
  /** the plot area's edges in the viewBox, and the baseline's y */
  box: { l: number; r: number; t: number; b: number };
  x: Axis | null; y: Axis | null;
  xLabel: string; yLabel: string;
  dots: { cx: number; cy: number; r: number; value: number }[];
  bars: { x: number; y: number; width: number; height: number; label: string; value: number; lo?: number; hi?: number }[];
  points: { cx: number; cy: number; x: number; y: number }[];
  /** the five-number summary and its pixel positions (box plots) */
  five: Five | null;
  fivePx: { min: number; q1: number; median: number; q3: number; max: number; y: number; height: number } | null;
}

/** a number without float noise (0.30000000000000004 -> 0.3) */
export function clean(v: number): number { return Math.round(v * 1e9) / 1e9; }
export function label(v: number): string { return String(clean(v)).replace("-", "−"); }

/** a step of 1, 2 or 5 times a power of ten that is at least raw */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return clean((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p);
}

/** ticks across [min, max] on a nice step, widened to the step; a single value gets a
    unit either side. wholes keeps the step a whole number (counts) */
export function niceTicks(min: number, max: number, count = 5, wholes = false): { min: number; max: number; step: number; values: number[] } {
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min > max) [min, max] = [max, min];
  if (min === max) { min -= 1; max += 1; }
  let step = niceStep((max - min) / Math.max(1, count));
  if (wholes && step < 1) step = 1;
  const lo = clean(Math.floor(clean(min / step)) * step);
  const hi = clean(Math.ceil(clean(max / step)) * step);
  const values: number[] = [];
  for (let i = 0; lo + i * step <= hi + step * 1e-9; i++) values.push(clean(lo + i * step));
  return { min: lo, max: hi, step, values };
}

function median(sorted: number[]): number {
  const n = sorted.length, m = n >> 1;
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/** the five-number summary by the median of the halves: with an odd count the median is in
    neither half. One value is all five; two values are each a quartile */
export function quartiles(values: number[]): Five | null {
  const v = values.filter((x) => isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  if (n === 1) return { min: v[0], q1: v[0], median: v[0], q3: v[0], max: v[0] };
  const lower = v.slice(0, n >> 1), upper = v.slice(n - (n >> 1));
  return { min: v[0], q1: median(lower), median: median(v), q3: median(upper), max: v[n - 1] };
}

/** histogram bins: each is [lo, hi), so a value on an edge counts in the bin to its right,
    and the last bin is the one the largest value falls in (an all-equal set is one bin) */
export function bins(values: number[], width?: number): { edges: number[]; counts: number[]; width: number } {
  const v = values.filter((x) => isFinite(x));
  if (!v.length) return { edges: [], counts: [], width: 1 };
  const min = Math.min(...v), max = Math.max(...v);
  const bw = width && width > 0 ? width : (min === max ? 1 : niceTicks(min, max, 6).step);
  const start = clean(Math.floor(clean(min / bw)) * bw);
  const at = (x: number) => Math.floor(clean((x - start) / bw));
  const n = at(max) + 1;
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(clean(start + i * bw));
  const counts = new Array<number>(n).fill(0);
  v.forEach((x) => { counts[at(x)]++; });
  return { edges, counts, width: bw };
}

const axisOf = (t: ReturnType<typeof niceTicks>, from: number, to: number): Axis => ({
  min: t.min, max: t.max, step: t.step,
  ticks: t.values.map((value) => ({ value, pos: from + ((value - t.min) / (t.max - t.min)) * (to - from), label: label(value) }))
});

/** the geometry of one chart. Rows by kind: dot, hist, box { value }; bar { label, value };
    scatter { x, y }. A row without a finite number is dropped */
export function chartLayout(kind: Kind, rows: Row[], opts: Opts = {}): Layout {
  const w = opts.w || 660, h = opts.h || 300;
  const box = { l: 48, r: 24, t: 16, b: kind === "bar" ? 44 : 40 };
  const out: Layout = {
    kind, w, h, empty: true, box: { l: box.l, r: w - box.r, t: box.t, b: h - box.b },
    x: null, y: null, xLabel: opts.xLabel || "", yLabel: opts.yLabel || "",
    dots: [], bars: [], points: [], five: null, fivePx: null
  };
  const num = (x: unknown): x is number => typeof x === "number" && isFinite(x);
  const L = out.box.l, R = out.box.r, T = out.box.t, B = out.box.b;

  if (kind === "dot" || kind === "hist" || kind === "box") {
    const v = rows.map((r) => r.value).filter(num);
    if (!v.length) return out;
    out.empty = false;
    if (kind === "hist") {
      const bn = bins(v, opts.width);
      /* the axis is the bin edges themselves, so a bar's sides sit on its ticks */
      const edgeAxis: Axis = { min: bn.edges[0], max: bn.edges[bn.edges.length - 1], step: bn.width, ticks: [] };
      const span = edgeAxis.max - edgeAxis.min;
      const px = (e: number) => L + ((e - edgeAxis.min) / span) * (R - L);
      edgeAxis.ticks = bn.edges.map((value) => ({ value, pos: px(value), label: label(value) }));
      if (bn.edges.length > 12) edgeAxis.ticks = edgeAxis.ticks.filter((_, i) => i % Math.ceil(bn.edges.length / 8) === 0);
      const yt = niceTicks(0, Math.max(...bn.counts), 5, true);
      out.x = edgeAxis;
      out.y = axisOf({ ...yt, min: 0 }, B, T);
      out.bars = bn.counts.map((count, i) => {
        const x0 = px(bn.edges[i]), x1 = px(bn.edges[i + 1]);
        const top = B + ((count - 0) / (yt.max - 0)) * (T - B);
        return { x: x0, y: top, width: x1 - x0, height: B - top, label: label(bn.edges[i]) + " to " + label(bn.edges[i + 1]), value: count, lo: bn.edges[i], hi: bn.edges[i + 1] };
      });
      return out;
    }
    const xt = niceTicks(Math.min(...v), Math.max(...v));
    out.x = axisOf(xt, L, R);
    const px = (value: number) => L + ((value - xt.min) / (xt.max - xt.min)) * (R - L);
    if (kind === "dot") {
      const stacks = new Map<number, number>();
      v.sort((a, b) => a - b).forEach((value) => stacks.set(clean(value), (stacks.get(clean(value)) || 0) + 1));
      const tallest = Math.max(...stacks.values());
      const r = Math.max(2, Math.min(7, (B - T - 4) / (2 * tallest + 1)));
      stacks.forEach((n, value) => {
        for (let k = 0; k < n; k++) out.dots.push({ cx: px(value), cy: B - r - 2 - k * (2 * r + 1), r, value });
      });
      return out;
    }
    const five = quartiles(v) as Five;
    const mid = (T + B) / 2, height = Math.min(70, (B - T) * 0.6);
    out.five = five;
    out.fivePx = { min: px(five.min), q1: px(five.q1), median: px(five.median), q3: px(five.q3), max: px(five.max), y: mid - height / 2, height };
    return out;
  }

  if (kind === "bar") {
    const items = rows.filter((r) => num(r.value) && typeof r.label === "string") as { label: string; value: number }[];
    if (!items.length) return out;
    out.empty = false;
    const vals = items.map((r) => r.value);
    const yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5, true);
    out.y = axisOf(yt, B, T);
    const py = (value: number) => B + ((value - yt.min) / (yt.max - yt.min)) * (T - B);
    const band = (R - L) / items.length, width = Math.min(band * 0.7, 90);
    out.bars = items.map((r, i) => {
      const x = L + band * i + (band - width) / 2, y = py(r.value), y0 = py(0);
      return { x, y: Math.min(y, y0), width, height: Math.abs(y0 - y), label: r.label, value: r.value };
    });
    return out;
  }

  const pts = rows.filter((r) => num(r.x) && num(r.y)) as { x: number; y: number }[];
  if (!pts.length) return out;
  out.empty = false;
  const xt = niceTicks(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  out.x = axisOf(xt, L, R);
  out.y = axisOf(yt, B, T);
  out.points = pts.map((p) => ({
    x: p.x, y: p.y,
    cx: L + ((p.x - xt.min) / (xt.max - xt.min)) * (R - L),
    cy: B + ((p.y - yt.min) / (yt.max - yt.min)) * (T - B)
  }));
  return out;
}

if (typeof window !== "undefined") {
  (window as unknown as { BMChart: unknown }).BMChart = { chartLayout, quartiles, bins, niceTicks };
}
