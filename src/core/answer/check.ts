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
               tried after it). Any other exact or expr text is compared as the old grader
               compared it (legacy.ts; the expr rules come with the next revision)
   Across a key's "|" alternatives the ranking is right > form > wrong. An answer with no
   single reading is unread, decided by read.ts from the text and the type alone, never
   from the key; expr and exact are unread only when empty or over 1,000 characters.

   The owner's answers (OWNER): Q3(a), so an unreduced fraction is right with a note and
   N-whole (Q3(c)) is not built; Q4(a), the reader's option, so 1 1/2 is 3/2 in a number,
   fraction or point box and refused in a set; Q5(a), the N-round step above. q3 and q5 are
   recorded here and read nowhere else: their (a) is what the compare does.

   Every rule is a switch: judgeOff() is judge() with the rules in `off` doing what the old
   grader did (the reader's rules inside read.ts, N-exact, N-round, L-repeat, T-value and
   T-notation here), for tools/gen-grade-ledger.js, which puts each changed verdict of the
   frozen baseline (tools/fixtures/grade-golden.json) down to the first rule whose switch
   gives the old verdict back, and lists them in tools/fixtures/grade-ledger.json at this
   GRADER revision. judgeOff() never reaches the pages.

   Pure: no `window`, no DOM, no float in any decision. */

import { alternatives, matches as legacyMatches, sameNumber, type AnswerType } from "./legacy.ts";
import { readList, readNumber, readTuple, type ListReading, type NumberReading, type Refusal } from "./read.ts";
import { abs, cmp, eq, fromDecimal, roundTo, sub, truncTo, type Q } from "./rational.ts";
import type { AnswerSpec, FormReason, Note, Owner, RuleId, Verdict } from "./types.ts";

export { alternatives };
export { readNumber } from "./read.ts";

/** The grader's revision: tools/fixtures/grade-ledger.json's `revision`, stored beside a
    diagnostic's verdicts. A change that adds ledger entries moves it on. */
export const GRADER = 2;

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

/* one reading against one key reading: true (right), false (wrong) or a form reason */
function compareNumber(g: NumberReading, k: NumberReading, tol: number, off: ReadonlySet<RuleId>): boolean | FormReason {
  if (off.has("N-exact") ? sameNumber(g.float, k.float, tol) : within(g.value, k.value, tol)) return true;
  /* N-round (Q5(a)): a decimal of two or more places that is the key rounded or cut there */
  if (!tol && !off.has("N-round") && g.shape === "decimal" && g.places >= 2
    && (eq(g.value, roundTo(k.value, g.places)) || eq(g.value, truncTo(k.value, g.places)))) return "rounded";
  return false;
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
  /* expr, exact and any other type: the old text compare, but a point key is compared by
     value when the given reads as a tuple of its arity, and that compare is final */
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
    if (legacyMatches(text, alts[i], type, tol)) return { kind: "right", alt: i, read: text.trim(), notes: [] };
  }
  const read = gt && point ? gt.read : null;
  return form < 0 || read === null ? { kind: "wrong", read } : { kind: "form", alt: form, read, reason: "notation" };
}

/** judge() with the rules in `off` doing what the old grader did (tools and tests only) */
export function judgeOff(given: unknown, spec: AnswerSpec, off: ReadonlySet<RuleId>): Verdict {
  return judgeAlts(given, alternatives(spec.answer), spec.type || "exact", spec.tol || 0, off);
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
