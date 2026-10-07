/* Exact rationals for the typed grader: every value it compares (a number, a fraction, a
   set's members, a point's coordinates, a tol) is a BigInt fraction, so no decision
   depends on float rounding. Always in lowest terms with a positive denominator, so two
   equal values have equal parts.

   Pure: no `window`, no DOM, no float in any result. */

export interface Q { n: bigint; d: bigint }

const absB = (x: bigint): bigint => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = absB(a); b = absB(b);
  while (b) { const r = a % b; a = b; b = r; }
  return a;
}

/** n/d in lowest terms, the sign on the numerator. Throws on a zero denominator: the
    reader never asks for one. */
export function make(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new RangeError("rational: zero denominator");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

export const neg = (a: Q): Q => ({ n: -a.n, d: a.d });
export const abs = (a: Q): Q => ({ n: absB(a.n), d: a.d });
export const add = (a: Q, b: Q): Q => make(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q): Q => add(a, neg(b));
export const mul = (a: Q, b: Q): Q => make(a.n * b.n, a.d * b.d);
/** Throws when b is 0. */
export const div = (a: Q, b: Q): Q => make(a.n * b.d, a.d * b.n);
/** -1, 0 or 1, as a is below, equal to or above b */
export function cmp(a: Q, b: Q): number {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}
export const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;

/** A decimal's exact value: "0.005", "-.5", "7.", "12" and exponent notation ("1e-7",
    "1.5E+21", which String(tol) gives for a small or large tol). Null for anything else,
    "Infinity" and "NaN" among them. */
export function fromDecimal(s: string): Q | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(s).trim());
  if (!m || (m[2] === "" && !m[3])) return null;
  const frac = m[3] || "";
  let n = BigInt((m[2] || "0") + frac), d = 10n ** BigInt(frac.length);
  const e = m[4] ? Number(m[4]) : 0;
  if (Math.abs(e) > 10000) return null;
  if (e > 0) n *= 10n ** BigInt(e);
  if (e < 0) d *= 10n ** BigInt(-e);
  return make(m[1] === "-" ? -n : n, d);
}

/** a at `places` digits after the point, rounded half away from zero */
export function roundTo(a: Q, places: number): Q {
  const p = 10n ** BigInt(places), sign = a.n < 0n ? -1n : 1n;
  return make(sign * ((absB(a.n) * p * 2n + a.d) / (2n * a.d)), p);
}

/** a at `places` digits after the point, cut toward zero */
export function truncTo(a: Q, places: number): Q {
  const p = 10n ** BigInt(places);
  return make((a.n * p) / a.d, p);
}
