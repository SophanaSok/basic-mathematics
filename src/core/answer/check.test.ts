import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import { GRADER, OWNER, alternatives, grade, judge, judgeOff, matches, specOf } from "./check.ts";
import { grade as legacyGrade } from "./legacy.ts";
import type { AnswerSpec, Verdict } from "./types.ts";

/* The compare of the typed grader (decision 0002): every verdict row of the design's tables
   in sections 3.1 to 3.3 (what a reading is judged against a key: right with its notes,
   form with its reason, wrong, or unread), the compare rules' switches, and the design's
   property tests 3 to 7: a round trip over random rationals in every spelling, refusals
   that depend on the input alone, a perturbation of every golden key, hostile input and
   every tol, and the bundle budget. What reads and what is refused is read.test.ts's. */

const ROOT = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);
const { ORDER } = require(path.join(ROOT, "tools/gen-grade-ledger.js")) as { ORDER: string[] };
interface Group { from: string; answer: string; type: string | null; tol: number; right: string[]; wrong: string[] }
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/grade-golden.json"), "utf8")) as { groups: Group[] };

/* the heavy tests run under this budget, as src/sync/merge.test.ts does; none asserts a time per call */
const LONG = 60_000;

/* "right", "right mixed,unreduced", "form/rounded", "wrong", "unread/named" */
const short = (v: Verdict) => v.kind === "right" ? "right" + (v.notes.length ? " " + v.notes.join(",") : "")
  : v.kind === "wrong" ? "wrong" : v.kind + "/" + v.reason;
const spec = (answer: string, type: string | null = "number", tol = 0): AnswerSpec => ({ answer, type, tol });
const v = (given: string, answer: string, type: string | null = "number", tol = 0) => short(judge(given, spec(answer, type, tol)));
const readOf = (given: string, answer: string, type: string | null = "number") => { const r = judge(given, spec(answer, type)); return "read" in r ? r.read : null; };
const each = (texts: string[], f: (t: string) => string) => Object.fromEntries(texts.map((t) => [t, f(t)]));
const all = (texts: string[], want: string) => Object.fromEntries(texts.map((t) => [t, want]));
const off = (given: string, answer: string, type: string | null, tol: number, ...rules: string[]) => short(judgeOff(given, spec(answer, type, tol), new Set(rules)));

/* mulberry32, the seeded stream the golden file's generators use */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* the tests' own exact arithmetic, sharing nothing with rational.ts: {n, d} in lowest terms */
interface R { n: bigint; d: bigint }
const absB = (x: bigint) => (x < 0n ? -x : x);
const gcdB = (a: bigint, b: bigint): bigint => { a = absB(a); b = absB(b); while (b) { const r = a % b; a = b; b = r; } return a; };
const rat = (n: bigint, d: bigint): R => { if (d < 0n) { n = -n; d = -d; } const g = gcdB(n, d) || 1n; return { n: n / g, d: d / g }; };
const cmpR = (a: R, b: R) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const subR = (a: R, b: R) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const absR = (a: R): R => ({ n: absB(a.n), d: a.d });
/* "12", "0.005", "-.5", "1e-7" */
function dec(s: string): R | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s.trim());
  if (!m || (m[2] === "" && !m[3])) return null;
  const frac = m[3] || "", e = m[4] ? Number(m[4]) : 0;
  let n = BigInt((m[2] || "0") + frac), d = 10n ** BigInt(frac.length);
  if (e > 0) n *= 10n ** BigInt(e);
  if (e < 0) d *= 10n ** BigInt(-e);
  return rat(m[1] === "-" ? -n : n, d);
}
/* a plain number or a/b, the dashes as "-"; null for anything else */
function num(s: string): R | null {
  const m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\/([+-]?(?:\d+(?:\.\d+)?|\.\d+)))?$/.exec(s.trim().replace(/[−–—]/g, "-"));
  if (!m) return null;
  const a = dec(m[1]), b = m[2] === undefined ? rat(1n, 1n) : dec(m[2]);
  return a && b && b.n !== 0n ? rat(a.n * b.d, a.d * b.n) : null;
}
/* within the tol (exact), or the band |a-b|*1e9 <= max(1, |a|, |b|) */
function close(a: R, b: R, tol: number): boolean {
  const d = absR(subR(a, b));
  if (tol) { const t = dec(String(tol)); return !!t && cmpR(d, t) <= 0; }
  const big = [rat(1n, 1n), absR(a), absR(b)].reduce((x, y) => (cmpR(x, y) >= 0 ? x : y));
  return cmpR(rat(d.n * 1000000000n, d.d), big) <= 0;
}
/* a decimal string of r at `places` (r must terminate there) */
function decimalOf(r: R, places: number): string {
  const p = 10n ** BigInt(places), n = r.n * p;
  if (n % r.d !== 0n) throw new Error("does not terminate");
  const whole = absB(n / r.d), s = whole.toString().padStart(places + 1, "0");
  return (r.n < 0n ? "-" : "") + (places ? s.slice(0, -places) + "." + s.slice(-places) : s);
}

describe("the grader's revision and the owner's answers", () => {
  it("is revision 2, with the owner's answers of 2026-10-07 frozen", () => {
    expect(GRADER).toBe(2);
    expect(OWNER).toEqual({ q3: "a", q4: "a", q5: "a" });
    expect(Object.isFrozen(OWNER)).toBe(true);
  });

  it("keeps grade(), matches() and alternatives() as the booleans the pages call, true only for right", () => {
    expect([grade("6/4", "3/2", "number"), grade("0.667", "2/3", "number"), grade("x = 3", "3", "number"), grade("[6,-2]", "(6,-2)|6,-2", "exact")]).toEqual([true, false, false, false]);
    expect([matches("6/4", "3/2", "number"), matches("0.667", "2/3", "number"), matches("2,2,-7", "2,-7", "set"), matches("(6.0,-2)", "(6,-2)", "exact"), matches("Yes.", "yes", null)]).toEqual([true, false, false, true, true]);
    /* matches() takes one alternative: a key with a bar is text */
    expect([matches("6,-2", "(6,-2)|6,-2", "exact"), matches("4", "2|4", "number")]).toEqual([false, false]);
    expect(alternatives("|x|")).toEqual(["|x|", "x"]);
    expect(specOf({ answer: "3/2", type: "fraction", tol: "0.01" })).toEqual({ answer: "3/2", type: "fraction", tol: 0.01 });
  });
});

describe("one number against its key (section 3.1)", () => {
  it("judges every spelling of the key 3/2 table", () => {
    expect(each(["3/2", "1.5", "1.50", "(3)/(2)", "3÷2", "3/2.", "1.5."], (t) => v(t, "3/2"))).toEqual(all(["3/2", "1.5", "1.50", "(3)/(2)", "3÷2", "3/2.", "1.5."], "right"));
    expect(each(["1 1/2", "1½", "1 ½"], (t) => v(t, "3/2") + " " + readOf(t, "3/2"))).toEqual(all(["1 1/2", "1½", "1 ½"], "right mixed 3/2"));
    expect([v("6/4", "3/2"), readOf("6/4", "3/2"), v("1 100/200", "3/2"), readOf("1 100/200", "3/2")]).toEqual(["right unreduced", "6/4", "right mixed,unreduced", "300/200"]);
    expect([v("31/2", "3/2"), v("1.49", "3/2"), readOf("1.49", "3/2")]).toEqual(["wrong", "wrong", "1.49"]);
    expect(each(["x = 3/2", "3/2 = x", "1+1/2", "sqrt(9)/2", "1-1/2", "1 and 1/2", "1,5", "1 1 / 2", "1 . 5", "½2", "1½0", "1 1/2 cups"], (t) => v(t, "3/2"))).toEqual({
      "x = 3/2": "unread/named", "3/2 = x": "unread/named", "1+1/2": "unread/expression", "sqrt(9)/2": "unread/expression",
      "1-1/2": "unread/ambiguous-mixed", "1 and 1/2": "unread/ambiguous-mixed", "1,5": "unread/decimal-comma",
      "1 1 / 2": "unread/spaces", "1 . 5": "unread/spaces", "½2": "unread/spaces", "1½0": "unread/spaces", "1 1/2 cups": "unread/units"
    });
    /* a fraction box is a number box */
    expect([v("6/4", "3/2", "fraction"), v("0.667", "2/3", "fraction"), v("1 1/2", "3/2", "fraction")]).toEqual(["right unreduced", "form/rounded", "right mixed"]);
  });

  it("reads a mixed number by its value (Q4(a)), so 1 1/2 is wrong for 11/2 and read as 3/2", () => {
    expect([v("1 1/2", "11/2"), readOf("1 1/2", "11/2"), v("1 11/21", "32/21"), v("3 2/21", "32/21"), v("1 3/4", "7/4"), v("-1 1/2", "-1/2"), readOf("-1 1/2", "-1/2")])
      .toEqual(["wrong", "3/2", "right mixed", "wrong", "right mixed", "wrong", "-3/2"]);
    expect(v("2 and 1/3", "7/3")).toBe("unread/ambiguous-mixed");
  });

  it("gives the band to a calculator decimal, form/rounded to a rounded one with no tol (Q5(a)), and wrong to the rest", () => {
    expect([v("0.6666666667", "2/3"), v("0.667", "2/3"), v(".6667", "2/3"), v("0.66", "2/3"), v("0.6", "2/3"), v("0.6666666", "2/3"), v("0.67", "2/3")])
      .toEqual(["right", "form/rounded", "form/rounded", "form/rounded", "wrong", "form/rounded", "form/rounded"]);
    expect([v("1.000000001", "1"), v("0.999999999", "1"), v("1.00000001", "1"), v("1.00", "1"), v("0.99", "1")]).toEqual(["right", "right", "wrong", "right", "wrong"]);
    /* the key rounded or cut at the decimal's own places, half away from zero */
    expect([v("0.13", "1/8"), v("0.12", "1/8"), v("0.125", "1/8"), v("-0.667", "-2/3"), v("-0.666", "-2/3"), v("0.1", "1/8"), v("13", "1/8")]).toEqual(["form/rounded", "form/rounded", "right", "form/rounded", "form/rounded", "wrong", "wrong"]);
    expect(readOf("0.667", "2/3")).toBe("0.667");
  });

  it("takes a tol exactly, inclusive, with no band, no slack and no form/rounded", () => {
    const t = (given: string) => v(given, "2.807", "number", 0.005);
    expect(each(["2.81", "2.808", "2.812", "2.80", "2.8120000000005", "2.8019999999995", "2.802", "2.813"], t)).toEqual({
      "2.81": "right", "2.808": "right", "2.812": "right", "2.80": "wrong", "2.8120000000005": "wrong", "2.8019999999995": "wrong", "2.802": "right", "2.813": "wrong"
    });
    expect([v("1.0000001", "1", "number", 1e-7), v("1.0000002", "1", "number", 1e-7), v("1.00000010000000001", "1", "number", 1e-7)]).toEqual(["right", "wrong", "wrong"]);
    expect([v("3.142°", "3.1416", "number", 0.001), v("3.142", "3.1416", "number", 0.001), v("2pi", "6.2832", "number", 0.001), v("25pi", "78.5", "number", 0.1)]).toEqual(["unread/units", "right", "unread/expression", "unread/expression"]);
  });

  it("judges the other keys' rows", () => {
    expect([v("5,050", "5050"), v("$5,050", "5050"), v("5 050", "5050"), v("50 50", "5050"), v("0,500", "500")]).toEqual(["right thousands", "right thousands", "unread/spaces", "unread/spaces", "unread/decimal-comma"]);
    expect(each(["4,-4", "4, -4", "4 or -4", "±4", "-4,4", "4", "-4"], (t) => v(t, "4|-4"))).toEqual({
      "4,-4": "unread/list", "4, -4": "unread/list", "4 or -4": "unread/list", "±4": "unread/plus-minus", "-4,4": "unread/decimal-comma", "4": "right", "-4": "right"
    });
    expect(each(["7.", "(7)", "+7", "07", "7.00", "７", "7 = x", "x=7"], (t) => v(t, "7"))).toEqual({
      "7.": "right", "(7)": "right", "+7": "right", "07": "right", "7.00": "right", "７": "right", "7 = x": "unread/named", "x=7": "unread/named"
    });
    expect([v("y = 2", "2"), v("x = 2", "2"), v("8/2", "4"), v("-(-4)", "4"), v("1/-1", "-1"), v("(-1)", "-1"), v("-(1)", "-1")]).toEqual(["unread/named", "unread/named", "right unreduced", "unread/expression", "right", "right", "right"]);
    expect(each(["−4", "‐4", "- 4", "-$4", "$-4"], (t) => v(t, "-4"))).toEqual(all(["−4", "‐4", "- 4", "-$4", "$-4"], "right"));
    expect(each(["140°", "140 º", "140 ˚", "140 degrees", "140deg"], (t) => v(t, "140"))).toEqual(all(["140°", "140 º", "140 ˚", "140 degrees", "140deg"], "unread/units"));
    expect(each(["1$2.50", "12.50$", "£12.50", "$12.50", "12.50"], (t) => v(t, "12.50"))).toEqual({ "1$2.50": "unread/symbol", "12.50$": "unread/symbol", "£12.50": "unread/symbol", "$12.50": "right", "12.50": "right" });
    expect(each(["four", "4 adults", "11 m", "4xy", "4e0", "3:4"], (t) => v(t, "4"))).toEqual({
      "four": "unread/words", "4 adults": "unread/units", "11 m": "unread/expression", "4xy": "unread/expression", "4e0": "unread/scientific", "3:4": "unread/ratio"
    });
    expect([v("50%", "0.5"), v("", "0.5"), v("  ", "0.5")]).toEqual(["unread/percent", "unread/empty", "unread/empty"]);
  });

  it("ranks right over form over wrong across a key's alternatives, and skips an alternative that does not read", () => {
    expect(judge("0.667", spec("1/2|2/3"))).toEqual({ kind: "form", alt: 2, read: "0.667", reason: "rounded" });
    expect(judge("0.667", spec("0.667|2/3"))).toEqual({ kind: "right", alt: 1, read: "0.667", notes: [] });
    expect(judge("4", spec("x|4"))).toEqual({ kind: "right", alt: 2, read: "4", notes: [] });
    expect(judge("5", spec("x|4"))).toEqual({ kind: "wrong", read: "5" });
    /* a key that does not read matches nothing, and the given's refusal does not depend on it */
    expect([v("4", "four"), v("4 adults", "four")]).toEqual(["wrong", "unread/units"]);
    /* `at` is 0 for a one-number box */
    expect(judge("4, -4", spec("4"))).toEqual({ kind: "unread", reason: "list", at: 0 });
  });
});

describe("a set against its key (section 3.2)", () => {
  it("pairs the members sorted, within the tol or the band, and reads or, and, ±, braces and empty members", () => {
    expect(each(["-7, 2", "{2;-7}", "2 and -7", "2,-7.", "2,-7,", "2,,-7"], (t) => v(t, "2,-7", "set"))).toEqual(all(["-7, 2", "{2;-7}", "2 and -7", "2,-7.", "2,-7,", "2,,-7"], "right"));
    expect([v("3 or -3", "3,-3", "set"), v("z = 3, z = -3", "3,-3", "set"), v("±7", "7,-7", "set"), v("+-7", "7,-7", "set")]).toEqual(["right", "unread/named", "right", "right"]);
    expect([v("x=2, x=-7", "2,-7", "set"), v("x = 2 or x = -7", "2,-7", "set")]).toEqual(["unread/named", "unread/named"]);
    expect([v("2,2,-7", "2,-7", "set"), v("2 -7", "2,-7", "set"), v("(2,-7)", "2,-7", "set")]).toEqual(["form/repeated", "unread/spaces", "unread/brackets"]);
    expect([v("2 1/3", "2,1/3", "set"), v("2 and 1/3", "2,1/3", "set"), v("2 1/3", "7/3", "set"), v("2 and 1/3", "7/3", "set")]).toEqual(Array(4).fill("unread/mixed-in-set"));
    expect([v("2 and -1/3", "2,-1/3", "set"), v("1/2 and 1/3", "1/2,1/3", "set"), v("1.000000001,2", "1,2", "set"), v("1,000", "1,0", "set"), v("1.01, 1.00", "1.00,1.02", "set", 0.01)])
      .toEqual(["right", "right", "right", "unread/list-comma", "right"]);
    /* wrong: a member off, a member missing, one too many that is no repeat; rounded members are wrong */
    expect([v("2,-6", "2,-7", "set"), v("2", "2,-7", "set"), v("2,-7,3", "2,-7", "set"), v("0.667,1", "2/3,1", "set"), v("2,2,-7,-7", "2,-7", "set"), v("2,2", "2,-7", "set")]).toEqual(["wrong", "wrong", "wrong", "wrong", "form/repeated", "wrong"]);
    expect([readOf("2,2,-7", "2,-7", "set"), readOf("±7", "7,-7", "set"), readOf("2,-6", "2,-7", "set")]).toEqual(["2, 2, -7", "7, -7", "2, -6"]);
    /* `at` names the member */
    expect(judge("2, x=3", spec("2,3", "set"))).toEqual({ kind: "unread", reason: "named", at: 1 });
  });
});

describe("a point against an exact key (section 3.3)", () => {
  const P = "(6,-2)|6,-2";
  it("compares a point key by exact value in order, with form/notation for [...], <...> and labels", () => {
    expect(each(["(6.0,-2)", "(+6, −2)", "6,-2", "( 6 , - 2 )", "(12/2,-2)", "(6,-2)", "(6,-2)."], (t) => v(t, P, "exact"))).toEqual(all(["(6.0,-2)", "(+6, −2)", "6,-2", "( 6 , - 2 )", "(12/2,-2)", "(6,-2)", "(6,-2)."], "right"));
    expect(each(["[6,-2]", "<6,-2>", "x=6, y=-2", "y=-2, x=6"], (t) => v(t, P, "exact") + " " + readOf(t, P, "exact"))).toEqual(all(["[6,-2]", "<6,-2>", "x=6, y=-2", "y=-2, x=6"], "form/notation (6, -2)"));
    expect(each(["(-2,6)", "x=6, x=-2", "(6.0000000001,-2)"], (t) => v(t, P, "exact"))).toEqual(all(["(-2,6)", "x=6, x=-2", "(6.0000000001,-2)"], "wrong"));
    expect([v("(1000000000,1)", "(1000000001,1)|1000000001,1", "exact"), v("y=-2, x=6", "(-2,6)|-2,6", "exact"), readOf("y=-2, x=6", "(-2,6)|-2,6", "exact")]).toEqual(["wrong", "wrong", "(6, -2)"]);
    expect([v("[3,2,1]", "3,2,1|(3,2,1)", "exact"), readOf("[3,2,1]", "3,2,1|(3,2,1)", "exact"), v("(3,2,1)", "3,2,1|(3,2,1)", "exact"), v("(3,2)", "3,2,1|(3,2,1)", "exact")]).toEqual(["form/notation", "(3, 2, 1)", "right", "wrong"]);
    /* a type the grader does not know, or none, is exact */
    expect([v("(6.0,-2)", P, null), v("(6.0,-2)", P, "point"), v("(6.0,-2)", P, "expr")]).toEqual(["right", "right", "wrong"]);
  });

  it("is no point when a coordinate is led by 0 and a digit, on either side, so the text decides", () => {
    expect(each(["(1,000)", "1,000", "(1, 000)"], (t) => v(t, "(1,0)|1,0", "exact"))).toEqual(all(["(1,000)", "1,000", "(1, 000)"], "wrong"));
    expect([v("(1,05)", "(1,5)|1,5", "exact"), v("(1,0)", "1,000", "exact"), v("1,0", "1,000", "exact"), v("1,000", "1,000", "exact")]).toEqual(["wrong", "wrong", "wrong", "right"]);
    /* -0 and 0 are one value */
    expect([v("-0,5", "(0,5)|0,5", "exact"), v("(0.5,-0)", "(1/2,0)", "exact")]).toEqual(["right", "right"]);
  });

  it("makes the value compare final: a mixed number in a point never passes as the digits run together", () => {
    expect([v("(1 1/2, 3)", "(11/2,3)|11/2,3", "exact"), v("(1 1/2,3)", "(11/2,3)|11/2,3", "exact"), readOf("(1 1/2, 3)", "(11/2,3)|11/2,3", "exact"), v("(5 1/2, 3)", "(11/2,3)|11/2,3", "exact")])
      .toEqual(["wrong", "wrong", "(3/2, 3)", "right"]);
  });

  it("leaves scalar exact keys and expr to the text compare, with no reading on a wrong answer", () => {
    expect([v("2/6", "1/3", "exact"), v("4", "4|iv", "exact"), v("iv", "4|iv", "exact"), v("x=3", "x=3", "exact"), v("x = 3", "x=3", "exact"), v("8/2", "4|iv", "exact")]).toEqual(["wrong", "right", "right", "right", "right", "wrong"]);
    expect([readOf("x=3", "3", "exact"), readOf("2x+1", "x^2", "expr"), readOf("(6,-3)", "3", "exact"), readOf("(6,-3)", P, "exact"), readOf("x=3, y=4", "yes", "exact")]).toEqual([null, null, null, "(6, -3)", null]);
    expect(judge("x^2+1", spec("x^2+1", "expr"))).toEqual({ kind: "right", alt: 0, read: "x^2+1", notes: [] });
    /* unread only when empty or over 1,000 characters */
    expect([v("", "x", "expr"), v("x".repeat(1000), "x".repeat(1000), "expr"), v("x".repeat(1001), "x".repeat(1001), "expr"), v("y".repeat(1001), "y".repeat(1001), "exact")]).toEqual(["unread/empty", "right", "unread/too-long", "unread/too-long"]);
  });
});

describe("the compare rules' switches", () => {
  it("do their own step on, and the old grader's step off", () => {
    /* N-exact: the readings' floats, as the old sameNumber compared them */
    expect([off("1.000000001", "1", "number", 0, "N-exact"), off("1.000000001,2", "1,2", "set", 0, "N-exact"), off("2.8120000000005", "2.807", "number", 0.005, "N-exact"), off("1 1/2", "3/2", "number", 0, "N-exact")])
      .toEqual(["wrong", "wrong", "right", "right mixed"]);
    /* N-round, L-repeat, T-value, T-notation: wrong, as today */
    expect([off("0.667", "2/3", "number", 0, "N-round"), off("2,2,-7", "2,-7", "set", 0, "L-repeat"), off("(6.0,-2)", "(6,-2)|6,-2", "exact", 0, "T-value"), off("-0,5", "(0,5)|0,5", "exact", 0, "T-value"), off("[6,-2]", "(6,-2)|6,-2", "exact", 0, "T-notation")])
      .toEqual(["wrong", "wrong", "wrong", "wrong", "wrong"]);
    /* T-final, a guard: off, the text compare runs after a failed value compare */
    expect([off("(1 1/2, 3)", "(11/2,3)|11/2,3", "exact", 0, "T-final"), off("(1 1/2, 3)", "(11/2,3)|11/2,3", "exact", 0, "N-mixed")]).toEqual(["right", "right"]);
    /* a reader rule reaches the verdict: off, what does not read is an expression (N-refuse on) or wrong (off) */
    expect([off("7.", "7", "number", 0, "N-dot"), off("7.", "7", "number", 0, "N-dot", "N-refuse"), off("1 1/2", "11/2", "number", 0, "N-mixed"), off("140°", "140", "number", 0, "N-refuse"), off("2 and -7", "2,-7", "set", 0, "L-sep")])
      .toEqual(["unread/expression", "wrong", "right", "wrong", "unread/expression"]);
  });

  it("with every rule off, gives the old grader's boolean on every golden case", () => {
    const every = new Set(ORDER.concat("T-final", "T-zero"));
    const drift: string[] = [];
    let cases = 0;
    for (const g of GOLDEN.groups) {
      for (const [list, want] of [[g.right, true], [g.wrong, false]] as const) {
        for (const given of list) {
          cases++;
          if ((judgeOff(given, spec(g.answer, g.type, g.tol), every).kind === "right") !== want) drift.push(g.from + ": " + JSON.stringify(given));
        }
      }
    }
    expect(drift).toEqual([]);
    expect(cases).toBeGreaterThan(65000);
  }, LONG);
});

describe("round trip (test 3)", () => {
  it("is right on every spelling of 20,000 random rationals against their reduced form, and on a last-place step exactly when the band says so", () => {
    const rand = mulberry(3), disagree: string[] = [];
    let judgements = 0;
    const expectRight = (given: string, key: string) => { judgements++; if (judge(given, spec(key)).kind !== "right") disagree.push(JSON.stringify(given) + " for " + key); };
    for (let i = 0; i < 20000; i++) {
      const neg = rand() < 0.3, decimal = rand() < 0.6;
      let value: R, places = 0;
      if (decimal) {
        places = Math.floor(rand() * 9);
        const n = BigInt(Math.floor(rand() * 10 ** Math.min(15, places + 3)));
        value = rat(neg ? -n : n, 10n ** BigInt(places));
      } else {
        const b = 1n + BigInt(Math.floor(rand() * 999)), a = BigInt(Math.floor(rand() * 5000));
        value = rat(neg ? -a : a, b);
      }
      const key = value.d === 1n ? String(value.n) : value.n + "/" + value.d, sign = value.n < 0n ? "-" : "", body = absB(value.n) + (value.d === 1n ? "" : "/" + value.d);
      const spellings = [key, sign + "$" + body, "(" + key + ")", key + ".", (sign ? "−" : "+") + body, (sign ? "‐" : "") + body];
      /* unreduced, by a factor of 2 to 9 */
      const f = 2n + BigInt(Math.floor(rand() * 8));
      spellings.push(sign + absB(value.n) * f + "/" + value.d * f);
      if (value.d !== 1n) {
        spellings.push(sign + "(" + absB(value.n) + ")/(" + value.d + ")", sign + absB(value.n) + "÷" + value.d);
        /* a mixed number when there is a whole part */
        const w = absB(value.n) / value.d, r = absB(value.n) % value.d;
        if (w > 0n && r > 0n) spellings.push(sign + w + " " + r + "/" + value.d);
      }
      if (decimal) {
        const d = decimalOf(value, places);
        spellings.push(d, sign + "0" + d.replace(/^-/, ""), d.replace(/^(-?)0\./, "$1."));
        /* one unit in the last place, each way: right exactly when the band says so */
        const unit = rat(1n, 10n ** BigInt(places));
        for (const step of [unit, rat(-unit.n, unit.d)]) {
          const near = rat(value.n * step.d + step.n * value.d, value.d * step.d), text = decimalOf(near, places);
          const want = close(near, value, 0);
          judgements++;
          if ((judge(text, spec(key)).kind === "right") !== want) disagree.push(JSON.stringify(text) + " for " + key + " should be " + (want ? "right" : "not right"));
        }
      }
      for (const s of spellings) expectRight(s, key);
    }
    expect(disagree).toEqual([]);
    expect(judgements).toBeGreaterThan(150000);
  }, LONG);
});

describe("refusals depend on the input only (test 4)", () => {
  it("gives the same unread reason for two keys and tols of a type, and in expr and exact only empty or too-long", () => {
    const rand = mulberry(4), ALPHABET = "0123456789 .,/-+()$x=e½±%°:{}[];<>|!√π÷−‐７£#a^*and or";
    const KEYS: Record<string, [string, number][]> = {
      number: [["3/2", 0], ["-250", 0.5]], fraction: [["7/4", 0], ["1", 1e-7]], set: [["2,-7", 0], ["1.00,1.02", 0.01]],
      expr: [["x^2+1", 0], ["3x-6", 0]], exact: [["(6,-2)|6,-2", 0], ["yes", 0]]
    };
    const bad: string[] = [];
    let judgements = 0;
    for (let i = 0; i < 20000; i++) {
      const text = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
      for (const type of Object.keys(KEYS)) {
        const [a, b] = KEYS[type].map(([answer, tol]) => judge(text, spec(answer, type, tol)));
        judgements += 2;
        const ua = a.kind === "unread" ? a.reason + "@" + a.at : "read", ub = b.kind === "unread" ? b.reason + "@" + b.at : "read";
        if (ua !== ub) bad.push(type + " " + JSON.stringify(text) + ": " + ua + " / " + ub);
        if ((type === "expr" || type === "exact") && a.kind === "unread" && a.reason !== "empty" && a.reason !== "too-long") bad.push(type + " " + JSON.stringify(text) + ": " + a.reason);
      }
    }
    expect(bad).toEqual([]);
    expect(judgements).toBe(200000);
  }, LONG);
});

describe("perturbation of every golden key (test 5)", () => {
  /* a key alternative, by the tests' own reading: a number, a set (one {...} stripped,
     split on , and ;), or a point (one (...) stripped, split on ",", k >= 2 coordinates, none
     led by 0 and a digit, the section 3.3 definition); null when it is none */
  type Value = { kind: "number"; v: R } | { kind: "set"; v: R[] } | { kind: "point"; v: R[] };
  const clean = (s: string) => s.trim().replace(/[−–—]/g, "-").replace(/ ?\.$/, "");
  function parse(text: string, type: string | null): Value | null {
    const t = clean(text);
    if (type === "number" || type === "fraction") { const r = num(t); return r ? { kind: "number", v: r } : null; }
    if (type === "set") {
      const parts = (/^\{.*\}$/.test(t) ? t.slice(1, -1) : t).split(/[,;]/).map((s) => s.trim()).filter((s) => s !== "").map(num);
      return parts.length && parts.every((r) => r) ? { kind: "set", v: (parts as R[]).sort(cmpR) } : null;
    }
    if (type === "expr") return null;
    const parts = (/^\(.*\)$/.test(t) ? t.slice(1, -1) : t).split(",").map((s) => s.trim());
    if (parts.length < 2 || parts.some((p) => /^[+-]? ?0\d/.test(p))) return null;
    const vals = parts.map(num);
    return vals.every((r) => r) ? { kind: "point", v: vals as R[] } : null;
  }
  const same = (g: Value, k: Value, tol: number) => g.kind === k.kind && (g.kind === "number" ? close(g.v, (k as { v: R }).v, tol)
    : g.v.length === (k.v as R[]).length && (g.v as R[]).every((x, i) => (g.kind === "point" ? cmpR(x, (k.v as R[])[i]) === 0 : close(x, (k.v as R[])[i], tol))));

  /* the perturbations of a piece's text: its last digit ±1, its first number's sign, a
     fraction's numerator ±1, and, on a tol key, a step of the tol plus one unit each way */
  function perturb(piece: string, type: string | null, tol: number): string[] {
    const out: string[] = [], t = clean(piece);
    const digitAt = (s: string, i: number, by: number) => { const d = Number(s[i]) + by; return d < 0 || d > 9 ? null : s.slice(0, i) + d + s.slice(i + 1); };
    const last = t.search(/\d(?!.*\d)/);
    if (last >= 0) for (const by of [1, -1]) { const s = digitAt(t, last, by); if (s !== null) out.push(s); }
    const first = t.search(/[\d.]/);
    if (first >= 0) out.push(t[first - 1] === "-" ? t.slice(0, first - 1) + t.slice(first) : t.slice(0, first) + "-" + t.slice(first));
    const slash = t.indexOf("/");
    if (slash > 0 && (type === "number" || type === "fraction")) {
      const numEnd = t.slice(0, slash).search(/\d(?!.*\d)/);
      for (const by of [1, -1]) { const s = digitAt(t, numEnd, by); if (s !== null) out.push(s); }
    }
    if (tol && (type === "number" || type === "fraction")) {
      const k = num(t), tq = dec(String(tol));
      if (k && tq) {
        const places = Math.max((/\.(\d+)$/.exec(t) || ["", ""])[1].length, String(tol).includes("e") ? 7 : ((/\.(\d+)$/.exec(String(tol)) || ["", ""])[1].length));
        const unit = rat(1n, 10n ** BigInt(places)), step = rat(tq.n * unit.d + unit.n * tq.d, tq.d * unit.d);
        for (const s of [step, rat(-step.n, step.d)]) {
          const near = rat(k.n * s.d + s.n * k.d, k.d * s.d);
          try { out.push(decimalOf(near, places)); } catch { /* does not terminate there: no row */ }
        }
      }
    }
    return out;
  }

  it("is right exactly when the tests' own arithmetic puts the changed value within the tol or the band of some alternative, or equal to a point", () => {
    const disagree: string[] = [];
    let rows = 0, rights = 0, keys = 0;
    for (const g of GOLDEN.groups) {
      if (g.type === "expr") continue;
      const alts = [...new Set(alternatives(g.answer))].map((a) => ({ a, p: parse(a, g.type) })).filter((x) => x.p);
      if (!alts.length) continue;
      keys++;
      for (const { a } of alts) {
        for (const text of perturb(a, g.type, g.tol)) {
          const p = parse(text, g.type);
          if (!p) continue;
          rows++;
          const want = alts.some((x) => same(p, x.p!, g.tol));
          const got = judge(text, spec(g.answer, g.type, g.tol)).kind === "right";
          if (got) rights++;
          if (got !== want) disagree.push(g.from + ": " + JSON.stringify(text) + " should be " + (want ? "right" : "not right"));
        }
      }
    }
    expect(disagree).toEqual([]);
    expect([keys > 1500, rows > 7000, rights > 50 && rights < rows / 20]).toEqual([true, true, true]);
    console.log("test 5: " + keys + " keys, " + rows + " perturbations, " + rights + " right");
  }, LONG);
});

describe("hostile input and every tol (test 6)", () => {
  it("never throws on 100,000 random strings, deep brackets and long runs, with every type", () => {
    const rand = mulberry(6), ALPHABET = "0123456789 .,/-+()$x=e½±%°:{}[];<>|!√π÷−‐７£#a^*\u0000\ud800";
    const TYPES = ["number", "fraction", "set", "exact", "expr", null];
    const texts = ["(".repeat(1000) + "7" + ")".repeat(1000), "1".repeat(10000), "1/".repeat(5000), "( ".repeat(3000), "½".repeat(2000),
      "x=" + "=".repeat(5000), "1 ".repeat(5000) + "/2", "$".repeat(5000), ", ".repeat(5000), "\u0000￿\ud800", "－".repeat(100) + "7", "9".repeat(10000) + "/" + "9".repeat(10000)];
    for (let i = 0; i < 100000; i++) texts.push(Array.from({ length: 1 + Math.floor(rand() * 16) }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join(""));
    let n = 0;
    for (let i = 0; i < texts.length; i++) {
      const type = TYPES[i % TYPES.length];
      judge(texts[i], spec("3/2|(6,-2)|x^2", type, i % 7 === 0 ? 0.01 : 0));
      n++;
    }
    expect(n).toBe(texts.length);
  }, LONG);

  it("takes any finite tol >= 0 without throwing, exponent notation read exactly", () => {
    for (const tol of [0, 1e-7, 1e-20, 5e-324, 1.5e-10, 1e21, Number.MAX_VALUE, 0.005, 1]) {
      for (const [given, answer, type] of [["1.0000001", "1", "number"], ["1,2", "1,2", "set"], ["x", "1", "number"], ["(1,2)", "(1,2)", "exact"]]) {
        expect(() => judge(given, spec(answer, type, tol)), tol + " " + given).not.toThrow();
      }
    }
    expect([v("1.0000001", "1", "number", 1e-7), v("1.0000002", "1", "number", 1e-7), v("1.00000000000000000001", "1", "number", 1e-20), v("2", "1", "number", 1e21), v("1,2.0000001", "1,2", "set", 1e-7), v("1,2.0000002", "1,2", "set", 1e-7)])
      .toEqual(["right", "wrong", "right", "right", "right", "wrong"]);
    /* an infinite tol takes any value, as the old compare did; a negative one is never met */
    expect([v("100", "1", "number", Infinity), v("1.001", "1", "number", -0.5), v("1", "1", "number", -0.5)]).toEqual(["right", "wrong", "right"]);
  });

  it("compares 25-digit numerators exactly", () => {
    /* a difference of 1 in the 25th digit is inside the band (relative 1e-9), so with no
       tol both are right; with a tol the exact difference decides, where a float would
       have lost it (big/3 and (big-1)/3 are one float) */
    const big = "1234567890123456789012347", less = "1234567890123456789012346";
    expect([v(big + "/3", big + "/3"), v(big + "/3", less + "/3"), v(big, big), v(big, less), v(big + "." + "0".repeat(20) + "1", big)]).toEqual(["right", "right", "right", "right", "right"]);
    expect([v(big + "/3", less + "/3", "number", 0.3), v(big + "/3", less + "/3", "number", 0.34), v(big, less, "number", 0.5), v(big, less, "number", 1)]).toEqual(["wrong", "right", "wrong", "right"]);
    expect(Number(big) / 3).toBe(Number(less) / 3);
    expect(v("0." + "0".repeat(24) + "1", "0")).toBe("right");
    expect(v("0." + "0".repeat(8) + "1", "0")).toBe("right");
    expect(v("0." + "0".repeat(8) + "11", "0")).toBe("wrong");
  });
});

describe("the bundle budget (test 7)", () => {
  it("bundles the grader, src/core/grade.ts and all it reaches, within 18,000 B minified and 7,000 B gzipped", async () => {
    const bundle = await rolldown({ input: path.join(ROOT, "src/core/grade.ts"), logLevel: "silent" });
    const { output } = await bundle.generate({ format: "esm", minify: true });
    await bundle.close();
    const code = output.filter((o) => o.type === "chunk").map((o) => o.code).join("");
    const gz = gzipSync(Buffer.from(code)).length;
    expect(code.length, "minified bytes").toBeLessThanOrEqual(18000);
    expect(gz, "gzipped bytes").toBeLessThanOrEqual(7000);
    expect(code.length).toBeGreaterThan(5000);
  }, LONG);
});
