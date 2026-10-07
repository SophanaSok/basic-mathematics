import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { alternatives, basicClean, grade, matches, normExpr, numberList, sameNumber, toNumber } from "./grade.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

/* tools/fixtures/grade-golden.json: what assets/site.js's grader said before it moved here
   (tools/gen-grade-golden.js wrote it on the old code) */
interface Group { from: string; answer: string; type: string; tol: number; right: string[]; wrong: string[] }
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/grade-golden.json"), "utf8")) as { cases: number; groups: Group[] };

describe("grade() against the golden file", () => {
  it("says what the grader said before the move, on every case", () => {
    let cases = 0;
    const drift: string[] = [];
    for (const g of GOLDEN.groups) {
      for (const [list, want] of [[g.right, true], [g.wrong, false]] as const) {
        for (const given of list) {
          cases++;
          if (grade(given, g.answer, g.type, g.tol) !== want) drift.push(g.from + ": " + JSON.stringify(given) + " against " + JSON.stringify(g.answer) + " (" + g.type + ") was " + (want ? "right" : "wrong"));
        }
      }
    }
    expect(drift).toEqual([]);
    expect(cases).toBe(GOLDEN.cases);
    /* every key on the pages, the detector fixtures and 2,000 Arena problems */
    expect(GOLDEN.groups.filter((g) => g.from.startsWith("gen ")).length).toBe(2000);
    expect(GOLDEN.groups.filter((g) => g.from.startsWith("parts/")).length).toBeGreaterThan(380);
    expect(cases).toBeGreaterThan(40000);
  });

  it("holds each of a key's \"|\" pieces right against it (the unsplit key is one only for text)", () => {
    for (const g of GOLDEN.groups) {
      for (const alt of alternatives(g.answer).slice(g.answer.includes("|") ? 1 : 0)) expect(g.right, g.from).toContain(alt);
    }
  });
});

describe("the pieces", () => {
  it("cleans what readers add without changing meaning", () => {
    expect(basicClean("  −3 × 4 ")).toBe("-3*4");
    expect(basicClean("√2 π ≤ ≥ ≠ X")).toBe("sqrt2pi<=>=!=x");
  });

  it("reads numbers, fractions and signed decimals, and nothing else", () => {
    expect([toNumber("3"), toNumber("+3"), toNumber("−1/4"), toNumber(".5"), toNumber("$12"), toNumber("2.50")]).toEqual([3, 3, -0.25, 0.5, 12, 2.5]);
    expect([toNumber(""), toNumber("1/0"), toNumber("x"), toNumber("1e3")]).toEqual([null, null, null, null]);
  });

  it("compares numbers relatively, or within an absolute tolerance", () => {
    expect(sameNumber(1, 1 + 1e-12)).toBe(true);
    expect(sameNumber(1e6, 1e6 + 1e-4)).toBe(true);
    expect(sameNumber(3.14, 3.1416, 0.01)).toBe(true);
    expect(sameNumber(3.14, 3.2, 0.01)).toBe(false);
    expect(sameNumber(null, 1)).toBe(false);
  });

  it("reads a list in any order, and an expression without its cosmetics", () => {
    expect(numberList("2, -3")).toEqual([-3, 2]);
    expect(numberList("{1;x}")).toBeNull();
    expect(normExpr("\\frac{1}{2}x")).toBe("(1)/(2)x");
    expect(normExpr("bd+ac")).toBe(normExpr("ac + bd"));
    expect(normExpr("(x+1)")).toBe("1+x");
  });

  it("matches by type, and as forgiving text by default", () => {
    expect(matches("0.5", "1/2", "number")).toBe(true);
    expect(matches("3,-2", "-2,3", "set")).toBe(true);
    expect(matches("3,-2,1", "-2,3", "set")).toBe(false);
    expect(matches("3x-6", "3x - 6", "expr")).toBe(true);
    expect(matches("Yes.", "yes", "exact")).toBe(true);
    expect(matches("Yes.", "yes", null)).toBe(true);
  });

  it("splits a key on | and keeps the whole key, for an answer such as |x|", () => {
    expect(alternatives(" a | b ")).toEqual(["a | b", "a", "b"]);
    expect(alternatives("|x|")).toEqual(["|x|", "x"]);
    expect(alternatives(null)).toEqual([]);
    expect(grade("|x|", "|x|")).toBe(true);
    expect(grade("4", "2|4", "number")).toBe(true);
    expect(grade("4", "")).toBe(false);
  });
});
