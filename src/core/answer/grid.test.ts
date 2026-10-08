import { describe, expect, it } from "vitest";
import { GRADER, GRID, judge } from "./check.ts";
import type { AnswerSpec, Verdict } from "./types.ts";

/* Grid mode of the typed grader (decision 0002; the design's section 3.6 and test 2d): the
   SAT's student-produced response. Every row of the section's table, the negative entries
   six characters wide, the tol not read, and a key's "|" alternatives. */

/* "right", "form/grid-width", "wrong", "unread/grid-zeros" */
const short = (v: Verdict) => v.kind === "right" || v.kind === "wrong" ? v.kind : v.kind + "/" + v.reason;
const grid = (answer: string, tol = 0): AnswerSpec => ({ answer, type: "number", tol, grid: true });
const v = (given: string, answer: string, tol = 0) => short(judge(given, grid(answer, tol)));

/* [key, verdict, typed ...]: the design's table, row by row */
const TABLE: [string, string, ...string[]][] = [
  ["2/3", "right", "2/3", "4/6", ".6666", ".6667", "0.666", "0.667"],
  ["2/3", "form/grid-width", "0.66", ".67", "0.7"],
  ["2/3", "unread/grid-zeros", "000.7", "00.67"],
  ["2/3", "wrong", ".1234", "5", "1", "1."],
  ["2/3", "unread/grid-length", "0.6667"],
  ["-1/3", "right", "-1/3", "-.3333", "-0.333"],
  ["-1/3", "form/grid-width", "-.33", "-0.33"],
  ["-1/3", "unread/grid-zeros", "-000.3", "-00.33"],
  ["-1/3", "unread/grid-chars", "−1/3"],
  ["100/3", "right", "33.33", "100/3"],
  ["100/3", "form/grid-width", "33.3"],
  ["100/3", "unread/grid-zeros", "033.3"],
  ["100/3", "wrong", "33"],
  ["7/2", "right", "3.5", "7/2"],
  ["7/2", "wrong", "31/2", "3", "4"],
  ["7/2", "unread/grid-chars", "3 1/2"],
  ["7", "right", "7", "7.0", "14/2"],
  ["7", "unread/grid-chars", "$7", "x=7", "1,5", "1/0", "1/2/3"],
  ["7", "unread/grid-zeros", "07", "7/01"],
  ["2469/2", "right", "1234", "1235", "1234.", "1235."],
  ["2469/2", "unread/grid-length", "1234.5", "2469/2"],
  ["2469/2", "wrong", "1233"],
  ["-2469/2", "right", "-1234", "-1235", "-1234."],
  ["-2469/2", "unread/grid-length", "-1234.5"],
  ["25/2", "right", "12.5", "25/2"],
  ["25/2", "wrong", "12", "13"],
  ["1/16", "right", ".0625", "1/16"],
  ["1/80", "right", ".0125"],
  ["1/16", "wrong", "0.063", "0.062", ".063"],
  ["1/80", "wrong", "0.013"]
];

describe("grid mode: the design's table (section 3.6)", () => {
  for (const [key, want, ...typed] of TABLE) {
    it(key + ": " + typed.join(", ") + " -> " + want, () => {
      expect(typed.map((g) => [g, v(g, key)])).toEqual(typed.map((g) => [g, want]));
    });
  }
});

describe("grid mode: rules 1 to 4, on the trimmed input and in order", () => {
  it("trims the input, and an empty one is unread/empty", () => {
    expect([v("  2/3 ", "2/3"), v("   ", "2/3"), v("", "2/3")]).toEqual(["right", "unread/empty", "unread/empty"]);
  });
  it("allows a minus sign only first, and nothing but digits, '.' and '/' (rule 1)", () => {
    expect(["1-2", "--1", "+7", "7e0", "1 2", "½", "(7)", "7%"].map((g) => v(g, "7"))).toEqual(Array(8).fill("unread/grid-chars"));
  });
  it("names the first rule broken: a character before the length, the length before the zeros", () => {
    expect([v("0000007x", "7"), v("000007", "7"), v("-000007", "-7")]).toEqual(["unread/grid-chars", "unread/grid-length", "unread/grid-length"]);
  });
  it("takes a malformed entry as grid-chars (rule 4), after the zeros (rule 3)", () => {
    expect(["..5", ".", "-", "1.2.3", "1/", "/2", "1.5/2", "-1/0", "0/0"].map((g) => v(g, "7"))).toEqual(Array(9).fill("unread/grid-chars"));
    expect(v("07/0", "7")).toBe("unread/grid-zeros");
  });
  it("lets a single 0 lead the point, and a 0 inside or after the digits (rule 3)", () => {
    expect([v("0.5", "1/2"), v(".5", "1/2"), v("10/20", "1/2"), v("0", "0"), v("-0", "0"), v("0/5", "0"), v("70/10", "7")])
      .toEqual(Array(7).fill("right"));
  });
});

describe("grid mode: six characters when negative", () => {
  it("allows six characters only with a minus sign", () => {
    expect([v("-.3333", "-1/3"), v(".33333", "1/3"), v("-.33333", "-1/3"), v("-0.3333", "-1/3")])
      .toEqual(["right", "unread/grid-length", "unread/grid-length", "unread/grid-length"]);
  });
  it("needs all six for a negative value that does not fit", () => {
    expect([v("-.6666", "-2/3"), v("-.6667", "-2/3"), v("-0.667", "-2/3"), v("-.667", "-2/3"), v("-0.7", "-2/3"), v("-.6", "-2/3")])
      .toEqual(["right", "right", "right", "form/grid-width", "form/grid-width", "form/grid-width"]);
  });
  it("takes a negative value's exact decimal when it fits in six, and nothing rounded", () => {
    expect([v("-.0625", "-1/16"), v("-1/16", "-1/16"), v("-0.063", "-1/16"), v("-.063", "-1/16"), v("-.062", "-1/16")])
      .toEqual(["right", "right", "wrong", "wrong", "wrong"]);
  });
  it("is wrong for the other sign, and for a negative rounding of a positive value", () => {
    expect([v("2/3", "-2/3"), v("-.6667", "2/3"), v(".6667", "-2/3"), v("-1/3", "1/3")]).toEqual(Array(4).fill("wrong"));
  });
  it("takes no places when a point and a digit would not fit (rule 6)", () => {
    expect([v("-12345", "-24691/2"), v("-12346", "-24691/2"), v("-1234", "-24691/2"), v("-123", "-2469/20")])
      .toEqual(["right", "right", "wrong", "wrong"]);
  });
});

describe("grid mode: rule 6 only when the exact decimal does not fit", () => {
  it("takes a full-width rounding or cut, never one at another place", () => {
    expect([v("3.142", "355/113"), v("3.141", "355/113"), v("3.14", "355/113"), v("3.143", "355/113")])
      .toEqual(["right", "right", "form/grid-width", "wrong"]);
  });
  it("is wrong for a rounding of a value whose decimal fits, at any width", () => {
    expect([v("1.33", "4/3"), v("0.13", "1/8"), v(".13", "1/8"), v(".125", "1/8"), v("12.3", "123/10")])
      .toEqual(["form/grid-width", "wrong", "wrong", "right", "right"]);
  });
  it("does not take a fraction near the value, even one equal to its rounding", () => {
    expect([v("7/10", "2/3"), v("2/3", "667/1000"), v("0.7", "2/3")]).toEqual(["wrong", "wrong", "form/grid-width"]);
  });
});

describe("grid mode: the tol is not read", () => {
  it("judges the same with any tol", () => {
    for (const tol of [0, 0.001, 0.1, 1, 1e-7, 1e21]) {
      expect([v("0.7", "2/3", tol), v("0.5", "2/3", tol), v(".6667", "2/3", tol), v("3", "7/2", tol), v("7.01", "7", tol)])
        .toEqual(["form/grid-width", "wrong", "right", "wrong", "wrong"]);
    }
  });
  it("is the grid's verdict whatever the type", () => {
    for (const type of ["number", "fraction", "set", "expr", "exact", null]) {
      expect(short(judge("0.66", { answer: "2/3", type, grid: true }))).toBe("form/grid-width");
    }
  });
  it("leaves grid mode to the spec that asks for it", () => {
    expect([short(judge("0.66", { answer: "2/3", type: "number", tol: 0.01 })), short(judge("0.66", { answer: "2/3", type: "number" }))])
      .toEqual(["right", "form/rounded"]);
  });
});

describe("grid mode: a key's | alternatives", () => {
  it("takes any alternative, and says which", () => {
    expect([judge("2", grid("2|-2")), judge("-2", grid("2|-2"))]).toEqual([
      { kind: "right", alt: 1, read: "2", notes: [] }, { kind: "right", alt: 2, read: "-2", notes: [] }
    ]);
  });
  it("ranks right above form, and form names the first alternative it is for", () => {
    expect(judge("0.66", grid("1/2|2/3|0.66"))).toEqual({ kind: "right", alt: 3, read: "0.66", notes: [] });
    expect(judge("0.66", grid("1/2|2/3|200/3"))).toEqual({ kind: "form", alt: 2, read: "0.66", reason: "grid-width" });
    expect(judge("0.5", grid("1/2|2/3"))).toEqual({ kind: "right", alt: 1, read: "0.5", notes: [] });
  });
  it("refuses the whole key typed with its bar, and is wrong for an answer no alternative takes", () => {
    expect([v("2|-2", "2|-2"), v("3", "2|-2")]).toEqual(["unread/grid-chars", "wrong"]);
  });
  it("reads a key alternative as the reader does, and one that does not read takes nothing", () => {
    expect([v("1.5", "1 1/2"), v("5050", "5,050"), v("2", "x|2"), v("2", "x")]).toEqual(["right", "right", "right", "wrong"]);
  });
});

describe("grid mode: what an exam result stores beside its verdicts", () => {
  it("is GRID 1, next to GRADER", () => {
    expect([GRID, GRADER]).toEqual([1, 3]);
  });
});
