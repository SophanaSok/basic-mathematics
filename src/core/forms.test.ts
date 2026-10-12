import { describe, expect, it } from "vitest";
import { FORMS, LAST_FORM } from "../data/forms.ts";
import { fresh, gotOf, highest, nextInfo, stageForLevel, stageOf, worn } from "./forms.ts";

describe("the forms table", () => {
  it("starts at level 1 and rises strictly", () => {
    expect(FORMS[0].level).toBe(1);
    expect(FORMS.length).toBe(LAST_FORM);
    FORMS.forEach((f, i) => {
      expect(f.n).toBe(i + 1);
      if (i) expect(f.level).toBeGreaterThan(FORMS[i - 1].level);
    });
  });
});

describe("stages from xp", () => {
  it("follows the thresholds", () => {
    const xps = [0, 59, 60, 224, 225, 584, 585, 1259, 1260, 5000];
    expect(xps.map((x) => highest(null, x))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it("maps levels and clamps stage numbers", () => {
    expect([stageForLevel(0), stageForLevel(3), stageForLevel(NaN), stageForLevel(99)]).toEqual([1, 2, 1, 5]);
    expect([stageOf(0).n, stageOf(9).n, stageOf("x").n, stageOf(3).n]).toEqual([1, 5, 1, 3]);
  });
});

describe("a recorded stage", () => {
  it("is kept above the level", () => {
    expect(highest({ got: { "1": 5, "4": 9 } }, 0)).toBe(4);
  });
  it("lists what is fresh", () => {
    expect(fresh(null, 0)).toEqual([1]);
    expect(fresh({ got: { "1": 5 } }, 60)).toEqual([2]);
    expect(fresh({ got: { "1": 5, "2": 6 } }, 60)).toEqual([]);
    expect(fresh({ got: { "3": 5 } }, 0)).toEqual([1, 2]);
  });
  it("clamps what is worn", () => {
    const f = { got: { "1": 1, "2": 1 }, wear: { n: 5, at: 1 } };
    expect(worn(f, 60)).toBe(2);
    expect(worn({ wear: { n: -3, at: 1 } }, 60)).toBe(1);
    expect(worn({ wear: { n: 1, at: 1 } }, 1260)).toBe(1);
    expect(worn({}, 1260)).toBe(5);
  });
});

describe("nextInfo", () => {
  it("reports progress at each stage", () => {
    const a = nextInfo(null, 0);
    expect([a.stage.n, a.next?.n, a.need, a.toGo, a.pct, a.final]).toEqual([1, 2, 60, 60, 0, false]);
    const b = nextInfo(null, 60);
    expect([b.stage.n, b.need, b.toGo, b.pct]).toEqual([2, 225, 165, 0]);
    expect(nextInfo(null, 142.5).pct).toBeCloseTo(50, 5);
    expect(nextInfo(null, 225).stage.n).toBe(3);
    expect(nextInfo(null, 585).next?.n).toBe(5);
  });
  it("is complete at the last", () => {
    const z = nextInfo(null, 5000);
    expect([z.stage.n, z.next, z.need, z.toGo, z.pct, z.final]).toEqual([5, null, 1260, 0, 100, true]);
  });
});

describe("damaged input", () => {
  it("never throws and stays in range", () => {
    const forms: unknown[] = [null, undefined, [], "x", 7, { got: [1, 2] }, { got: { "9": 1, "3": -1 } },
      JSON.parse('{"got":{"__proto__":5,"9":1,"3":-1}}'), { wear: { n: "2" } }, { wear: { n: 99, at: 1 } }];
    const xps: unknown[] = [NaN, Infinity, -5, 1e300, "x", null, 0];
    for (const f of forms) for (const x of xps) {
      const h = highest(f, x);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(5);
      const w = worn(f, x);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(h);
      expect(fresh(f, x).every((n) => n >= 1 && n <= h)).toBe(true);
      expect(nextInfo(f, x).pct).toBeGreaterThanOrEqual(0);
    }
  });
  it("drops bad got entries", () => {
    expect(gotOf(JSON.parse('{"got":{"__proto__":5,"9":1,"3":-1,"2":7}}'))).toEqual({ "2": 7 });
    expect(gotOf({ got: [1, 2] })).toEqual({});
    expect(highest(null, Infinity)).toBe(1);
    expect(highest(null, 1e300)).toBe(5);
    expect(worn({ wear: { n: "2" } }, 1260)).toBe(5);
    expect(worn({ wear: { n: 99, at: 1 } }, 60)).toBe(2);
  });
});
