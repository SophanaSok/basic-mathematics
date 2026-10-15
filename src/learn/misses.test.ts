import { describe, expect, it } from "vitest";
import { matches } from "../core/grade.ts";
import { matchMiss, parseMisses, type MissItem } from "./misses.ts";

const m = matches as any;
const text = (given: string, items: MissItem[], type = "number") => matchMiss({ given, kind: "text", type }, items, m);

describe("parseMisses", () => {
  it("drops damaged items and keeps four", () => {
    const got = parseMisses([{ given: "1" }, {}, { given: 3 }, null as any, { given: "2", blank: 2 }, { given: "3" }, { given: "4" }, { given: "5" }]);
    expect(got.map((x) => x.given)).toEqual(["1", "2", "3", "4"]);
    expect(got[1].blank).toBe(2);
    expect(got[0].blank).toBeNull();
    expect(parseMisses(null as any)).toEqual([]);
  });
});

describe("matchMiss on text", () => {
  const items = parseMisses([{ given: "-4" }]);
  it("treats the same number alike however it is typed", () => {
    for (const g of ["−4", " -4 ", "-4.0", "-8/2"]) expect(text(g, items)).toBe(0);
    expect(text("4", items)).toBeNull();
  });
  it("matches a set in any order", () => {
    expect(text("-3, 2", parseMisses([{ given: "{2,-3}" }]), "set")).toBe(0);
  });
  it("first of two matches wins", () => {
    expect(text("-4", parseMisses([{ given: "5" }, { given: "-4" }, { given: "-4.0" }]))).toBe(1);
  });
});

describe("matchMiss on choices", () => {
  it("compares the option number", () => {
    const items = parseMisses([{ given: "2" }]);
    expect(matchMiss({ given: "2", kind: "choice", type: "exact" }, items, m)).toBe(0);
    expect(matchMiss({ given: "1", kind: "choice", type: "exact" }, items, m)).toBeNull();
    expect(matchMiss({ given: "12", kind: "choice", type: "exact" }, items, m)).toBeNull();
  });
  it("compares multi answers as sets", () => {
    const items = parseMisses([{ given: "1,3" }]);
    expect(matchMiss({ given: "3,1", kind: "multi", type: "exact" }, items, m)).toBe(0);
    expect(matchMiss({ given: "1", kind: "multi", type: "exact" }, items, m)).toBeNull();
  });
});

describe("matchMiss on blanks", () => {
  it("looks at the named blank with its own type", () => {
    const items = parseMisses([{ given: "-4", blank: 2 }]);
    const input = (g: string[]) => ({ given: g, kind: "blank", type: "exact", blanks: [{ type: "exact" }, { type: "number" }] });
    expect(matchMiss(input(["-4", "-8/2"]), items, m)).toBe(0);
    expect(matchMiss(input(["-4", "4"]), items, m)).toBeNull();
    expect(matchMiss({ ...input(["-4"]), given: "-4" }, items, m)).toBeNull();
  });
});

describe("matchMiss on an untyped blank", () => {
  it("compares it as exact, as the grader does", () => {
    const seen: string[] = [];
    const spy = (g: string, a: string, t: string) => { seen.push(t); return g === a; };
    const items = parseMisses([{ given: "7", blank: 1 }]);
    expect(matchMiss({ given: ["7"], kind: "blank", type: "exact", blanks: [{ type: null }] }, items, spy)).toBe(0);
    expect(seen).toEqual(["exact"]);
  });
});

describe("matchMiss on the rest", () => {
  it("never answers order or figure, and never throws", () => {
    const items = parseMisses([{ given: "1" }]);
    expect(matchMiss({ given: "1", kind: "order", type: "exact" }, items, m)).toBeNull();
    expect(matchMiss({ given: "1", kind: "figure", type: "exact" }, items, m)).toBeNull();
    const boom = () => { throw new Error("x"); };
    expect(matchMiss({ given: "1", kind: "text", type: "number" }, items, boom)).toBeNull();
    expect(matchMiss(null as any, items, m)).toBeNull();
    expect(matchMiss({ given: undefined as any, kind: "text", type: "number" }, [null as any, { given: 5 as any }, ...items], m)).toBeNull();
    expect(matchMiss({ given: "1", kind: "multi", type: "x" }, null as any, m)).toBeNull();
  });
});
