import { describe, expect, it } from "vitest";
import { matches as real } from "../core/grade.ts";
import { candidates, leaks, mathSegments, stripTags, type LeakExercise, type Matches } from "./leak.ts";

const grader: Matches = (g, a, t, tol) => real(g, a, t, tol ?? undefined);
const same: Matches = (g, a) => g.replace(/\s+/g, "") === a.replace(/\s+/g, "");

function ex(over: Partial<LeakExercise>): LeakExercise {
  return { answers: ["4"], type: "number", kind: "text", tol: null, question: "", ...over };
}

describe("stripTags and mathSegments", () => {
  it("drops tags and finds the math", () => {
    expect(stripTags("a <em>b</em> $x$")).toBe("a b $x$");
    expect(mathSegments("so $x = 4$ and $y$")).toEqual([{ text: "x = 4", at: 4 }, { text: "y", at: 16 }]);
  });
  it("takes odd input without throwing", () => {
    expect(mathSegments("$unbalanced")).toEqual([]);
    expect(leaks("", ex({}), grader)).toEqual([]);
    expect(leaks("$", ex({}), grader)).toEqual([]);
    expect(candidates("$ $ $", ex({}))).toBeInstanceOf(Array);
  });
});

describe("leaks", () => {
  it("$x = 4$ leaks the answer 4", () => {
    expect(leaks("so $x = 4$", ex({}), grader).map(l => l.token)).toContain("4");
  });
  it("an exponent that is in the question leaks nothing", () => {
    const e = ex({ answers: ["2"], question: "Differentiate $x^2$." });
    expect(leaks("Look at $x^2$.", e, grader)).toEqual([]);
  });
  it("\\frac{8}{2} leaks 4", () => {
    expect(leaks("\\frac{8}{2}", ex({}), grader).length).toBeGreaterThan(0);
    expect(leaks("so $\\dfrac{8}{2}$", ex({ type: "number" }), grader).length).toBeGreaterThan(0);
  });
  it("the text of a correct option leaks", () => {
    const e = ex({ kind: "choice", answers: ["1"], options: ["the opposite of 3"], question: "Pick one." });
    expect(leaks("Think: <em>the opposite of 3</em>.", e, grader).map(l => l.token)).toEqual(["the opposite of 3"]);
    expect(leaks("Think about opposites.", e, grader)).toEqual([]);
  });
  it("a set written in braces leaks the same set in another order", () => {
    const e = ex({ type: "set", answers: ["2,-3"] });
    expect(leaks("The roots are {-3, 2}.", e, grader).length).toBeGreaterThan(0);
  });
  it("a hint that only names a method leaks nothing", () => {
    expect(leaks("Factor first, then set each factor to zero.", ex({ type: "set", answers: ["2,-3"] }), grader)).toEqual([]);
    expect(leaks("Add the opposite.", ex({ type: "exact", answers: ["4"] }), grader)).toEqual([]);
  });
  it("a Unicode minus in prose reads as a minus", () => {
    expect(leaks("so it is −3.", ex({ type: "number", answers: ["-3"] }), grader).map(l => l.token)).toEqual(["−3"]);
  });
  it("a two-word exact answer leaks as a bigram and not as one word", () => {
    const e = ex({ type: "exact", answers: ["square root"] });
    expect(leaks("Take the square root of both sides.", e, same).map(l => l.token)).toContain("square root");
    expect(leaks("Take the square of both sides.", e, same)).toEqual([]);
    expect(leaks("Take the root of both sides.", e, same)).toEqual([]);
  });
});
