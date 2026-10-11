/* The typed grader's verdicts (decision 0002, docs/decisions/0002-typed-grader.md): judge()
   gives a typed answer one of four verdicts against its key, right, form, wrong or unread,
   and grade() and matches() are the booleans the pages and tools call (true only for a
   right). src/core/grade.ts is the facade the site loads them through, and src/ui/core.ts
   puts judge(), specOf() and the owner's answers on window.BMCore.

   A number or fraction box, a set box, and a point typed for an exact key are read by
   read.ts into exact rationals and compared by value here:
     number    equal values are right; with a tol, |a-b| <= tol (read exactly from
               String(tol)); with none, the calculator band |a-b|*1e9 <= max(1,|a|,|b|),
               then a decimal of two or more places equal to the key rounded or cut at its
               own places is form/rounded (N-round, Q5(a)); anything else is wrong. An
               unreduced fraction (6/4) is right with a note (Q3(a)). The arithmetic is
               BigInt (N-exact; off, the readings' floats are compared as the old sameNumber
               compared them)
     set       both lists sorted by value and paired member by member, each pair within the
               tol or the band; a list with exactly equal repeats whose distinct members
               pair with the key is form/repeated (L-repeat)
     point     an exact key alternative that reads as a tuple with no labels and no [...] or
               <...> is a point key; a given that reads as a tuple of the same arity is
               compared by exact value in order, no band and no tol (T-value), or is
               form/notation when it used [...], <...> or labels (T-notation), and that
               compare is final (a guard, T-final, tests only: off, the text compare is
               tried after it)
     percent   (decision 0005, PQ2) the key and the answer in percent units, a trailing %
               read: the number compare, N-round counting a decimal's places as the value
               it stands for (33.3 is 0.333, so form/rounded for 100/3); else, when the
               answer a hundred times over compares right or rounded (0.35 for 35),
               form/notation, its `read` the answer as a percent (35%)
     ratio     (decision 0005, PQ3) a key of two or more positive terms (3:4); an answer of
               as many positive terms, each the key's times one factor, is right, with the
               unreduced note when its whole-number terms share a factor (6:8); one number
               equal to a two-term key's quotient (3/4, 0.75) is form/notation, its `read`
               the answer as a ratio (3:4); anything else, a different number of terms
               among it, is wrong. Exact: no tol, no band
     text      any other exact text, and expr, is compared by expr.ts: expr by its string
               rules (E-mixed, E-star, E-pow, E-dot, E-abs, E-plusneg, E-paren, E-terms), and
               exact as the old forgiving text compare, with a mixed number marked (E-mixed)
   A key is split on "|" into alternatives, unless a piece is empty: |x| is one answer, so x
   is not right for it (A-abs). The whole key stays the first alternative, so typing the
   whole key (6,-2)|6,-2 is right.
   Across a key's "|" alternatives the ranking is right > form > wrong. An answer with no
   single reading is unread, decided by read.ts from the text and the type alone, never
   from the key; expr and exact are unread only when empty or over 1,000 characters.

   Grid mode (spec.grid, exam items only: the SAT's student-produced response, the design's
   section 3.6) replaces the reader. The trimmed input, W characters wide (5, or 6 when it
   starts with a minus sign), is held to four rules, and the first it breaks is the unread
   reason: only digits, ".", "/" and a leading "-" (grid-chars); at most W characters
   (grid-length); no number part led by a 0 and another digit, so 000.7, 07 and 7/01 do not
   pad the width (grid-zeros); an integer, a decimal or a/b with b not 0 (grid-chars). Then
   each key alternative, read as a number: an entry equal to it is right (4/6 for 2/3 too);
   and, only when its exact decimal does not fit in W (2/3, 1234.5, but not 12.5 or 1/16),
   an integer or decimal equal to it rounded or cut at the entry's own places is right at
   full width, or with no places when a point and a digit would not fit (1234 for 1234.5),
   and form/grid-width when it has places and is shorter (0.66 for 2/3). Anything else is
   wrong. The tol and the type are not read, and GRID is the revision of these rules.

   The owner's answers (OWNER): Q3(a), so an unreduced fraction is right with a note and
   N-whole (Q3(c)) is not built; Q4(a), the reader's option, so 1 1/2 is 3/2 in a number,
   fraction or point box and refused in a set; Q5(a), the N-round step above. q3 and q5 are
   recorded here and read nowhere else: their (a) is what the compare does.

   Every rule is a switch: judgeOff() is judge() with the rules in `off` doing what the old
   grader did (the reader's rules inside read.ts, the expr rules inside expr.ts, and A-abs,
   N-exact, N-round, L-repeat, T-value and T-notation here), for tools/gen-grade-ledger.js,
   which puts each changed verdict of the frozen baseline (tools/fixtures/grade-golden.json)
   down to the first rule whose switch gives the old verdict back, and lists them in
   tools/fixtures/grade-ledger.json at this GRADER revision. judgeOff() never reaches the
   pages. Grid mode has no switches: no golden case is graded in it. Nor have the percent
   and ratio compares, boxes the old grader never had: no golden case has either type.

   Pure: no `window`, no DOM, no float in any decision. */

import { alternatives as legacyAlternatives, sameNumber } from "./legacy.ts";
import { sameText } from "./expr.ts";
import { readList, readNumber, readPercent, readRatio, readTuple, type ListReading, type NumberReading, type RatioReading, type Refusal } from "./read.ts";
import { abs, cmp, div, eq, fromDecimal, make, mul, roundTo, sub, truncTo, type Q } from "./rational.ts";
import type { AnswerSpec, AnswerType, FormReason, Note, Owner, RuleId, Verdict } from "./types.ts";

export { readNumber } from "./read.ts";

/** The grader's revision: tools/fixtures/grade-ledger.json's `revision`, stored beside a
    diagnostic's verdicts. A change that adds ledger entries moves it on. */
export const GRADER = 3;

/** The revision of grid mode's rules (the design's section 3.6), stored beside an exam
    result's verdicts next to GRADER. A change to any grid rule moves it on. */
export const GRID = 1;

/** The owner's answers to decision 0002's questions (decided 2026-10-07): the recommended
    option on each. The pages read q4 for the one message worded by it. */
export const OWNER: Readonly<Owner> = Object.freeze({ q3: "a", q4: "a", q5: "a" });

const NONE: ReadonlySet<RuleId> = new Set();
const ONE: Q = { n: 1n, d: 1n };
const BILLION = 1000000000n;

/** An exercise's spec from what the page or a generator holds: the key as a string, the
    type as given (none is null; grade() takes it as "exact"), and the tol read as the pages
    read data-tol (a number or its text; anything that is not a number is 0) */
export function specOf(src: { answer?: unknown; type?: unknown; tol?: unknown; grid?: unknown }): AnswerSpec {
  const spec: AnswerSpec = {
    answer: src.answer == null ? "" : String(src.answer),
    type: src.type == null || src.type === "" ? null : String(src.type),
    tol: parseFloat(String(src.tol ?? "")) || 0
  };
  if (src.grid === true) spec.grid = true;
  return spec;
}

/* "|" separates a key's alternatives, and the whole key is the first of them; a key with an
   empty piece (|x|) is one answer (A-abs; off, its bars split it as before) */
function altsOf(raw: string | null | undefined, off: ReadonlySet<RuleId>): string[] {
  const whole = (raw || "").trim(), pieces = whole.split("|");
  if (!off.has("A-abs") && pieces.length > 1 && pieces.some((s) => s.trim() === "")) return [whole];
  return legacyAlternatives(whole);
}

/** A key's alternatives, as judge() reads them: the whole key, then each "|" piece, unless a
    piece is empty (|x| is one answer) */
export function alternatives(raw: string | null | undefined): string[] {
  return altsOf(raw, NONE);
}

/* ------------------------------------------------------------- compare -- */

/* equal, or within the tol (exact; an infinite tol takes any value, as the old compare
   did), or, with no tol, within the band |a-b|*1e9 <= max(1, |a|, |b|) */
function within(a: Q, b: Q, tol: number): boolean {
  if (eq(a, b)) return true;
  const d = abs(sub(a, b));
  if (tol) {
    const t = fromDecimal(String(tol));
    return t ? cmp(d, t) <= 0 : tol === Infinity;
  }
  const big = [ONE, abs(a), abs(b)].reduce((x, y) => (cmp(x, y) >= 0 ? x : y));
  return cmp({ n: d.n * BILLION, d: d.d }, big) <= 0;
}

/* one reading against one key reading: true (right), false (wrong) or a form reason. `shift`
   is 2 in a percent box, where 33.3 is 0.333, three places of the value it stands for */
function compareNumber(g: NumberReading, k: NumberReading, tol: number, off: ReadonlySet<RuleId>, shift = 0): boolean | FormReason {
  if (off.has("N-exact") ? sameNumber(g.float, k.float, tol) : within(g.value, k.value, tol)) return true;
  /* N-round (Q5(a)): a decimal of two or more places that is the key rounded or cut there */
  if (!tol && !off.has("N-round") && g.shape === "decimal" && g.places + shift >= 2
    && (eq(g.value, roundTo(k.value, g.places)) || eq(g.value, truncTo(k.value, g.places)))) return "rounded";
  return false;
}

/* a percent box's reading against its key: right, or form/rounded, by the number compare
   in percent units; else, when the value a hundred times over compares so (0.35 for 35),
   form/notation */
function comparePercent(g: NumberReading, x100: NumberReading, k: NumberReading, tol: number, off: ReadonlySet<RuleId>): boolean | FormReason {
  return compareNumber(g, k, tol, off, 2) || (compareNumber(x100, k, tol, off, 2) ? "notation" : false);
}

/* a ratio box's reading against a key of two or more positive terms: right when it has as
   many positive terms, each the key's times one factor (6:8 for 3:4); form/notation when it
   is one number, the quotient of a two-term key (3/4, 0.75); else wrong. Exact, with no
   tol and no band, as a point is. A key that is not such a ratio matches nothing. */
function compareRatio(g: RatioReading, k: RatioReading): boolean | FormReason {
  const kt = k.terms.map((t) => t.value), gt = g.terms.map((t) => t.value);
  if (kt.length < 2 || kt.some((t) => t.n <= 0n)) return false;
  if (gt.length === 1) return kt.length === 2 && eq(gt[0], div(kt[0], kt[1])) && "notation";
  return gt.length === kt.length && gt.every((t, i) => t.n > 0n && eq(mul(t, kt[0]), mul(gt[0], kt[i])));
}

/* a value as a percent box shows it: a decimal when it ends (35, 12.5), else a mixed
   number (33 1/3), with a % */
function percentText(v: Q): string {
  const s = shortDecimal(v), m = v.n < 0n ? -v.n : v.n, w = m / v.d;
  return (s !== null ? s.replace(/^(-?)\./, "$10.") : (v.n < 0n ? "-" : "") + (w ? w + " " : "") + m % v.d + "/" + v.d) + "%";
}

function compareList(g: ListReading, k: ListReading, tol: number, off: ReadonlySet<RuleId>): boolean | FormReason {
  const exact = !off.has("N-exact");
  const sorted = (ms: NumberReading[]) => ms.slice().sort(exact ? (a, b) => cmp(a.value, b.value) : (a, b) => a.float - b.float);
  const ks = sorted(k.members);
  const pairs = (ms: NumberReading[]) => ms.length === ks.length
    && sorted(ms).every((m, i) => (exact ? within(m.value, ks[i].value, tol) : sameNumber(m.float, ks[i].float, tol)));
  if (pairs(g.members)) return true;
  if (!off.has("L-repeat")) {
    const distinct = g.members.filter((m, i) => g.members.findIndex((x) => eq(x.value, m.value)) === i);
    if (distinct.length < g.members.length && pairs(distinct)) return "repeated";
  }
  return false;
}

/* ------------------------------------------------------------- verdicts -- */

/* a reading against each key alternative read the same way: the first right, else the
   first form, else wrong; a key alternative that does not read matches nothing */
function rank<R extends { ok: true; read: string }>(g: R, alts: string[], read: (s: string) => R | Refusal,
  compare: (k: R) => boolean | FormReason, notes: Note[]): Verdict {
  let form = -1, reason: FormReason = "rounded";
  for (let i = 0; i < alts.length; i++) {
    const k = read(alts[i]);
    if (!k.ok) continue;
    const r = compare(k);
    if (r === true) return { kind: "right", alt: i, read: g.read, notes };
    if (r && form < 0) { form = i; reason = r; }
  }
  return form < 0 ? { kind: "wrong", read: g.read } : { kind: "form", alt: form, read: g.read, reason };
}

const refused = (r: Refusal): Verdict => (r.reason === null ? { kind: "wrong", read: null } : { kind: "unread", reason: r.reason, at: r.at });

/* the verdict of `given` against the key alternatives `alts`, by the type */
function judgeAlts(given: unknown, alts: string[], type: string, tol: number, off: ReadonlySet<RuleId>): Verdict {
  const text = String(given);
  if (text.trim() === "") return { kind: "unread", reason: "empty", at: 0 };
  const o = { q4: OWNER.q4, off };
  if (type === "number" || type === "fraction") {
    const g = readNumber(text, o);
    return g.ok ? rank(g, alts, (s) => readNumber(s, o), (k) => compareNumber(g, k, tol, off), g.notes) : refused(g);
  }
  if (type === "set") {
    const g = readList(text, o);
    return g.ok ? rank(g, alts, (s) => readList(s, o), (k) => compareList(g, k, tol, off), []) : refused(g);
  }
  if (type === "percent") {
    const g = readPercent(text, o);
    if (!g.ok) return refused(g);
    /* the value a hundred times over, at the given's own places counted in percent units */
    const x100 = { ...g, value: mul(g.value, make(100n)), float: g.float * 100, places: g.places - 2 };
    const v = rank(g, alts, (s) => readPercent(s, o), (k) => comparePercent(g, x100, k, tol, off), g.notes);
    return v.kind === "form" && v.reason === "notation" ? { ...v, read: percentText(x100.value) } : v;
  }
  if (type === "ratio") {
    const g = readRatio(text, o);
    if (!g.ok) return refused(g);
    const v = rank(g, alts, (s) => readRatio(s, o), (k) => compareRatio(g, k), g.notes);
    return v.kind === "form" ? { ...v, read: g.terms[0].value.n + ":" + g.terms[0].value.d } : v;
  }
  /* expr, exact and any other type: the text compare of expr.ts, but a point key is compared
     by value when the given reads as a tuple of its arity, and that compare is final */
  if (!off.has("N-refuse") && text.length > 1000) return { kind: "unread", reason: "too-long", at: 0 };
  const gt = type === "expr" ? null : readTuple(text, o);
  let form = -1, point = false;
  for (let i = 0; i < alts.length; i++) {
    const kt = gt && readTuple(alts[i], o);
    if (gt && kt && !kt.notation) {
      point = true;
      if (kt.values.length === gt.values.length && !off.has("T-value")) {
        if (gt.values.every((v, j) => eq(v.value, kt.values[j].value))) {
          if (!gt.notation) return { kind: "right", alt: i, read: gt.read, notes: [] };
          if (!off.has("T-notation")) { if (form < 0) form = i; continue; }
        } else if (!off.has("T-final")) continue;
      }
    }
    if (sameText(text, alts[i], type, off)) return { kind: "right", alt: i, read: text.trim(), notes: [] };
  }
  const read = gt && point ? gt.read : null;
  return form < 0 || read === null ? { kind: "wrong", read } : { kind: "form", alt: form, read, reason: "notation" };
}

/* ----------------------------------------------------------------- grid -- */

/* the decimal of a terminating value with no leading zero (.0625, 1234.5, -7), or null when
   it does not terminate */
function shortDecimal(v: Q): string | null {
  let d = v.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const k = Math.max(twos, fives), m = v.n < 0n ? -v.n : v.n;
  const digits = String(m * 10n ** BigInt(k) / v.d).padStart(k + 1, "0");
  const whole = digits.slice(0, digits.length - k);
  return (v.n < 0n ? "-" : "") + (k ? (whole === "0" ? "" : whole) + "." + digits.slice(-k) : whole);
}

/* An entry in grid mode against the key alternatives `alts` (section 3.6): rules 1-4 on
   the trimmed input, then each alternative, read as a number, by rules 5 and 6 */
function judgeGrid(given: unknown, alts: string[]): Verdict {
  const t = String(given).trim();
  if (t === "") return { kind: "unread", reason: "empty", at: 0 };
  const width = (neg: boolean) => (neg ? 6 : 5);
  const W = width(t[0] === "-");
  /* 1: digits, a point, a fraction bar, and a minus sign first only */
  if (!/^-?[0-9./]*$/.test(t)) return { kind: "unread", reason: "grid-chars", at: 0 };
  /* 2: at most W characters */
  if (t.length > W) return { kind: "unread", reason: "grid-length", at: 0 };
  /* 3: no number part (the digits before a point, a numerator, a denominator) led by a 0
     and another digit */
  if (t.replace(/^-/, "").split("/").some((part) => /^0\d/.test(part))) return { kind: "unread", reason: "grid-zeros", at: 0 };
  /* 4: an integer, a decimal, or a/b with b not 0 */
  const dec = /^-?(\d+\.?\d*|\.\d+)$/.test(t), frac = /^(-?\d+)\/(\d+)$/.exec(t);
  if (!dec && !(frac && BigInt(frac[2]) !== 0n)) return { kind: "unread", reason: "grid-chars", at: 0 };
  const value = frac ? make(BigInt(frac[1]), BigInt(frac[2])) : (fromDecimal(t) as Q);
  const point = t.indexOf("."), places = dec && point >= 0 ? t.length - point - 1 : 0;
  const before = point >= 0 ? point : t.length;
  let form = -1;
  for (let i = 0; i < alts.length; i++) {
    const k = readNumber(alts[i], { q4: OWNER.q4, off: NONE });
    if (!k.ok) continue;
    /* 5: equal to the value, an unreduced fraction that fits too */
    if (eq(value, k.value)) return { kind: "right", alt: i, read: t, notes: [] };
    /* 6: only when the value's exact decimal does not fit, an integer or decimal that is the
       value rounded or cut at its own places: right at full width, or with no places when a
       point and a digit would not fit; form/grid-width with places and short of W */
    const exact = shortDecimal(k.value);
    if (!dec || (exact !== null && exact.length <= width(k.value.n < 0n))) continue;
    if (!eq(value, roundTo(k.value, places)) && !eq(value, truncTo(k.value, places))) continue;
    if (t.length === W || (places === 0 && before + 2 > W)) return { kind: "right", alt: i, read: t, notes: [] };
    if (places > 0 && form < 0) form = i;
  }
  return form < 0 ? { kind: "wrong", read: t } : { kind: "form", alt: form, read: t, reason: "grid-width" };
}

/** judge() with the rules in `off` doing what the old grader did (tools and tests only).
    In grid mode the grid's rules decide, and the tol and the type are not read. */
export function judgeOff(given: unknown, spec: AnswerSpec, off: ReadonlySet<RuleId>): Verdict {
  if (spec.grid) return judgeGrid(given, altsOf(spec.answer, off));
  return judgeAlts(given, altsOf(spec.answer, off), spec.type || "exact", spec.tol || 0, off);
}

/** A typed answer's verdict against its key */
export function judge(given: unknown, spec: AnswerSpec): Verdict {
  return judgeOff(given, spec, NONE);
}

/** One answer against a key with `|` alternatives: true only for a right verdict */
export function grade(given: unknown, answer: string | null | undefined, type?: AnswerType | null, tol?: number): boolean {
  return judge(given, { answer: answer || "", type, tol }).kind === "right";
}

/** One answer against one alternative of a key, as the detectors ask: true only for a
    right verdict */
export function matches(given: unknown, answer: unknown, type?: AnswerType | null, tol?: number): boolean {
  return judgeAlts(given, [String(answer ?? "")], type || "exact", tol || 0, NONE).kind === "right";
}
