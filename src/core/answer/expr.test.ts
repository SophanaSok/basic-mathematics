import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { alternatives, judge, judgeOff } from "./check.ts";
import { MIXED_MARK, exactText, norm, sameText } from "./expr.ts";
import { alternatives as legacyAlternatives, basicClean, grade as legacyGrade, matches as legacyMatches, normExpr } from "./legacy.ts";
import type { AnswerSpec } from "./types.ts";

/* The expr string rules of the typed grader (decision 0002; the design's section 3.4 and test
   2c): every row of the section's table, with the guard rows as answers that must stay wrong,
   each rule's step on and off, A-abs, and, with every E- rule off, norm() equal to the old
   grader's normExpr() and exact's text compare equal to the old one on every golden key and
   answer of type expr, exact or none. */

const ROOT = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);
const { ORDER } = require(path.join(ROOT, "tools/gen-grade-ledger.js")) as { ORDER: string[] };
interface Group { from: string; answer: string; type: string | null; tol: number; right: string[]; wrong: string[] }
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/grade-golden.json"), "utf8")) as { groups: Group[] };

const LONG = 60_000;

/* the E- rules, in the order the pipeline runs them */
const E_RULES = ["E-mixed", "E-star", "E-pow", "E-dot", "E-abs", "E-plusneg", "E-paren", "E-terms"];
const E_OFF: ReadonlySet<string> = new Set(E_RULES);
const without = (...rules: string[]): ReadonlySet<string> => new Set(rules);

const spec = (answer: string, type: string | null = "expr"): AnswerSpec => ({ answer, type, tol: 0 });
const v = (given: string, answer: string, type: string | null = "expr") => judge(given, spec(answer, type)).kind;
const off = (given: string, answer: string, type: string | null, ...rules: string[]) => judgeOff(given, spec(answer, type), new Set(rules)).kind;

/* [key, typed, type, verdict now, the rules whose switch gives today's verdict back]: the
   design's table, row by row */
const TABLE: [string, string, string, "right" | "wrong", string[]][] = [
  ["x^2+1", "x^2+1.", "expr", "right", ["E-dot"]],
  ["|x|", "|x|.", "expr", "right", ["E-dot"]],
  ["|x|", "abs(x)", "expr", "right", ["E-abs"]],
  ["x^2", "x**2", "expr", "right", ["E-pow"]],
  ["x^2", "x^(2)", "expr", "right", ["E-pow"]],
  ["(2k+1)^-1", "(2k+1)^(-1)", "expr", "right", ["E-pow"]],
  ["3x-6", "3x+(-6)", "expr", "right", ["E-plusneg"]],
  ["22i-26", "22i+-26", "expr", "right", ["E-plusneg"]],
  ["x-2y", "x+(-2)y", "expr", "right", ["E-plusneg"]],
  ["(1/2)sqrt(2)", "((1/2)sqrt(2))", "expr", "right", ["E-paren"]],
  ["x^2-28x+196", "-28x+x^2+196", "expr", "right", ["E-terms"]],
  ["2-7i", "-7i+2", "expr", "right", ["E-terms"]],
  ["1/(2k+1)", "1/(1+2k)", "expr", "right", ["E-terms"]],
  ["(11/6)pi", "(1 1/6)pi", "expr", "wrong", ["E-mixed"]],
  ["11/2", "1 1/2", "exact", "wrong", ["E-mixed"]],
  ["64pi", "6*4pi", "expr", "wrong", ["E-star"]],
  ["23", "2*3", "expr", "wrong", ["E-star"]],
  ["3x-2", "3x*-2", "expr", "wrong", ["E-star"]],
  ["y=3x+5", "5+y=3x", "expr", "wrong", ["E-terms"]],
  ["(1,y+x)", "(x+1,y)", "expr", "wrong", ["E-terms"]]
];

/* [key, typed]: wrong today and wrong now, whatever one rule does. x+(-2)3 is x-6, not x-23 */
const GUARDS: [string, string][] = [
  ["x-23", "x+(-2)3"],
  ["5-1.5", "5+(-1).5"],
  ["3-x2", "3+(-x)2"],
  ["x^23", "x^(2)3"],
  ["x-2^2", "x+(-2)^2"]
];

describe("the design's table (section 3.4)", () => {
  it("gives each row its verdict now, and today's verdict with every rule off", () => {
    for (const [key, typed, type, now] of TABLE) {
      expect(v(typed, key, type), typed + " for " + key).toBe(now);
      const today = legacyGrade(typed, key, type) ? "right" : "wrong";
      expect(today, typed + " for " + key + " today").toBe(now === "right" ? "wrong" : "right");
      expect(off(typed, key, type, ...ORDER), typed + " for " + key + ", every rule off").toBe(today);
    }
  });

  it("gives today's verdict back when the row's own rule alone is off, and keeps the verdict with any other E- rule off", () => {
    for (const [key, typed, type, now, rules] of TABLE) {
      const today = now === "right" ? "wrong" : "right";
      for (const r of E_RULES) expect(off(typed, key, type, r), typed + " for " + key + ", " + r + " off").toBe(rules.includes(r) ? today : now);
    }
  });

  it("keeps the guard rows wrong, with every rule on and with any one E- rule off", () => {
    for (const [key, typed] of GUARDS) {
      expect(v(typed, key), typed + " for " + key).toBe("wrong");
      expect(legacyGrade(typed, key, "expr"), typed + " for " + key + " today").toBe(false);
      for (const r of E_RULES) expect(off(typed, key, "expr", r), typed + " for " + key + ", " + r + " off").toBe("wrong");
    }
  });

  it("leaves what is still wrong in Tier 1 wrong: relations reordered, expanded or factored forms", () => {
    expect([v("5+x<=7", "x+5<=7"), v("2x+3=y", "y=2x+3"), v("(x+5)^2", "x^2+10x+25"), v("2j+2k", "2(j+k)"), v("(x-1)(x+1)", "(x+1)(x-1)")])
      .toEqual(["wrong", "wrong", "wrong", "wrong", "wrong"]);
  });
});

describe("each rule's step, on and off", () => {
  it("E-mixed marks a mixed number before basicClean, in expr and in exact; off, the space is deleted", () => {
    expect([norm("(1 1/6)pi"), norm("1 1 / 6 p i"), norm("2 3/4x")]).toEqual(["(1" + MIXED_MARK + "1/6)pi", "1" + MIXED_MARK + "1/6pi", "2" + MIXED_MARK + "3/4x"]);
    expect([norm("(1 1/6)pi", without("E-mixed")), norm("11/6 pi"), norm("1 1")]).toEqual(["(11/6)pi", "11/6pi", "11"]);
    expect([exactText("1 1/2"), exactText("1 1/2", without("E-mixed")), exactText(" 1 1 / 2. ")]).toEqual(["1" + MIXED_MARK + "1/2", "11/2", "1" + MIXED_MARK + "1/2"]);
    expect([sameText("1 1/2", "11/2", "exact"), sameText("1 1/2", "11/2", "exact", without("E-mixed")), sameText("1 1/2", "1 1/2", "exact")]).toEqual([false, true, true]);
    expect([off("1 1/2", "11/2", "exact", "E-mixed"), off("1 1/2", "11/2", null), off("1 1/2", "11/2", null, "E-mixed")]).toEqual(["right", "wrong", "right"]);
  });

  it("E-star reads · as * and keeps a * before a digit, a point, + or -; off, · stays and every * goes", () => {
    expect([norm("2·x"), norm("6*4pi"), norm("2*.5"), norm("3x*-2"), norm("x*+1"), norm("3*x-6"), norm("2⋅k")]).toEqual(["2x", "6*4pi", "2*.5", "3x*-2", "x*+1", "3x-6", "2k"]);
    expect([norm("2·x", without("E-star")), norm("6*4pi", without("E-star")), norm("3x*-2", without("E-star"))]).toEqual(["2·x", "64pi", "3x-2"]);
    expect([v("(1/2)·sqrt(2)", "(1/2)sqrt(2)"), off("2·x", "2x", "expr", "E-star")]).toEqual(["right", "wrong"]);
  });

  it("E-pow reads ** as ^ before a * is dropped, and ^(n) as ^n unless a digit or point follows; off, both are kept as they were", () => {
    expect([norm("x**2"), norm("x^(2)"), norm("x^(-1)"), norm("x^(2)3"), norm("x^(2).5"), norm("x^(2)y"), norm("x^(a)")]).toEqual(["x^2", "x^2", "x^-1", "x^(2)3", "x^(2).5", "x^2y", "x^(a)"]);
    /* off, ** is two stars: E-star (b) drops the first (a * follows it) and keeps the second (a digit does) */
    expect([norm("x**2", without("E-pow")), norm("x**2", without("E-pow", "E-star")), norm("x^(2)", without("E-pow"))]).toEqual(["x*2", "x2", "x^(2)"]);
  });

  it("E-dot drops one trailing period; off, it is kept", () => {
    expect([norm("x^2+1."), norm("x.."), norm("|x|.")]).toEqual(["1+x^2", "x.", "abs(x)"]);
    expect([norm("x.", without("E-dot")), v("x.", "x"), off("x.", "x", "expr", "E-dot")]).toEqual(["x.", "right", "wrong"]);
  });

  it("E-abs reads |e| as abs(e); off, the bars are kept", () => {
    expect([norm("|x|"), norm("|x-1|+2"), norm("abs(x)"), norm("||")]).toEqual(["abs(x)", "2+abs(x-1)", "abs(x)", "||"]);
    expect(norm("|x|", without("E-abs"))).toBe("|x|");
  });

  it("E-plusneg reads +(-t) as -t for one term, unless ^, a digit or a point follows, and +- as -; off, both are kept", () => {
    expect([norm("3x+(-6)"), norm("x+(-2)y"), norm("x+(-x^2)"), norm("22i+-26"), norm("x+(-2)3"), norm("x+(-2)^2"), norm("5+(-1).5"), norm("x+(-2-y)")])
      .toEqual(["3x-6", "x-2y", "x-x^2", "22i-26", "(-2)3+x", "(-2)^2+x", "(-1).5+5", "(-2-y)+x"]);
    expect([norm("3x+(-6)", without("E-plusneg")), norm("22i+-26", without("E-plusneg"))]).toEqual(["(-6)+3x", "-26+22i"]);
  });

  it("E-paren strips an outer pair only while the two match each other; off, one outer ( and ) go, matched or not", () => {
    expect([norm("((1/2)sqrt(2))"), norm("(1/2)sqrt(2)"), norm("((x))"), norm("((1,y+x))"), norm("(a)+(b)")]).toEqual(["(1/2)sqrt(2)", "(1/2)sqrt(2)", "x", "1,y+x", "(a)+(b)"]);
    expect([norm("(1/2)sqrt(2)", without("E-paren")), norm("((x))", without("E-paren"))]).toEqual(["1/2)sqrt(2", "(x)"]);
  });

  it("E-terms sorts the signed terms of a sum at every depth, never across a relation or a comma; off, a sum with no brackets is split on + and sorted", () => {
    expect([norm("-28x+x^2+196"), norm("x^2-28x+196"), norm("1/(1+2k)"), norm("2^-1+x"), norm("x/-2+1"), norm("3x*-2+1"), norm("x+-2")])
      .toEqual(["196+x^2-28x", "196+x^2-28x", "1/(1+2k)", "2^-1+x", "1+x/-2", "1+3x*-2", "x-2"]);
    expect([norm("y=3x+5"), norm("x+5<=7"), norm("x+1,y"), norm("b-a+c")]).toEqual(["y=3x+5", "x+5<=7", "x+1,y", "b+c-a"]);
    /* an unclosed ( keeps what follows it as it is */
    expect(norm("b+a(c+d")).toBe("a(c+d+b");
    expect([norm("y=3x+5", without("E-terms")), norm("b-a+c", without("E-terms")), norm("1/(1+2k)", without("E-terms"))]).toEqual(["5+y=3x", "b-a+c", "1/(1+2k)"]);
  });
});

describe("A-abs", () => {
  it("takes a key with an empty | piece as one answer; off, its bars split it as before", () => {
    expect([alternatives("|x|"), alternatives(" | x | "), alternatives("|x|+1"), alternatives("1|i"), alternatives("(6,-2)|6,-2")])
      .toEqual([["|x|"], ["| x |"], ["|x|+1"], ["1|i", "1", "i"], ["(6,-2)|6,-2", "(6,-2)", "6,-2"]]);
    expect([v("x", "|x|"), v("(x)", "|x|"), v("|x|", "|x|"), v("(6,-2)|6,-2", "(6,-2)|6,-2", "exact")]).toEqual(["wrong", "wrong", "right", "right"]);
    expect([off("x", "|x|", "expr", "A-abs"), off("(x)", "|x|", "expr", "A-abs")]).toEqual(["right", "right"]);
    expect(judgeOff("x", spec("|x|"), without("A-abs"))).toMatchObject({ kind: "right", alt: 1 });
  });
});

describe("every E- rule off is the old grader", () => {
  it("lists the E- rules as the ledger tool orders them", () => {
    expect(ORDER.filter((r) => r.startsWith("E-"))).toEqual(E_RULES);
  });

  it("gives normExpr() and the old exact compare's cleaning on every golden key, key alternative and answer of type expr, exact or none", () => {
    const texts = new Set<string>();
    for (const g of GOLDEN.groups) {
      if (g.type !== "expr" && g.type !== "exact" && g.type !== null) continue;
      [g.answer, ...legacyAlternatives(g.answer), ...g.right, ...g.wrong].forEach((t) => texts.add(t));
    }
    const apart: string[] = [];
    for (const t of texts) {
      if (norm(t, E_OFF) !== normExpr(t)) apart.push("norm " + JSON.stringify(t));
      if (exactText(t, E_OFF) !== basicClean(t).replace(/\.$/, "")) apart.push("exactText " + JSON.stringify(t));
    }
    expect(apart).toEqual([]);
    expect(texts.size).toBeGreaterThan(20000);
  }, LONG);

  it("compares as the old matches() does, for expr and for exact, on every golden case of those types", () => {
    const apart: string[] = [];
    for (const g of GOLDEN.groups) {
      if (g.type !== "expr" && g.type !== "exact" && g.type !== null) continue;
      const type = g.type || "exact";
      for (const given of [...g.right, ...g.wrong]) {
        for (const alt of legacyAlternatives(g.answer)) {
          if (sameText(given, alt, type, E_OFF) !== legacyMatches(given, alt, type)) apart.push(g.from + ": " + JSON.stringify(given) + " against " + JSON.stringify(alt));
        }
      }
    }
    expect(apart).toEqual([]);
  }, LONG);
});
