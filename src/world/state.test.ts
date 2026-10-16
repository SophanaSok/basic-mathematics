import { describe, expect, it } from "vitest";
import { hubState, type HubInput } from "./state.ts";

function input(over: Partial<HubInput> = {}): HubInput {
  return {
    isles: [
      { id: "ch01", part: "p1", sections: ["ch01#a", "ch01#b", "ch01#c"] },
      { id: "ch02", part: "p2", sections: ["ch02#a"] }
    ],
    counts: { ch01: { solved: 3, total: 10 }, ch02: { solved: 4, total: 4 } },
    medals: { ch02: 2 },
    due: { arena: [{ id: "ch02#a" }, { id: "ch01#b" }, { id: "ch01#a" }], page: [{ id: "ch01#c" }, { id: "ch09#x" }] },
    bands: { "ch01#a": "strong", "ch01#b": "weak" },
    solids: { p1: "cube", p2: "octa" },
    calm: false,
    ...over
  };
}

describe("hubState", () => {
  it("pct, done, stars, boss", () => {
    const [a, b] = hubState(input());
    expect(a.pct).toBeCloseTo(0.3); expect(a.done).toBe(false); expect(a.stars).toBe(1);
    expect(a.boss).toEqual({ solid: "cube", hollow: a.pct });
    expect(b.pct).toBe(1); expect(b.done).toBe(true); expect(b.stars).toBe(2); expect(b.boss).toBeNull();
  });

  it("edge cases", () => {
    const s = hubState(input({
      counts: { ch01: { solved: 0, total: 0 }, ch02: { solved: 9, total: 4 } },
      medals: { ch01: 0, ch02: 4 }
    }));
    expect(s[0]).toMatchObject({ pct: 0, done: false, stars: 1, boss: { solid: "cube", hollow: 0 } });
    expect(s[1]).toMatchObject({ pct: 1, done: true, stars: 3, boss: null });
  });

  it("missing count is empty", () => {
    expect(hubState(input({ counts: {} }))[0]).toMatchObject({ pct: 0, done: false, boss: { solid: "cube", hollow: 0 } });
  });

  it("calm hides the boss", () => {
    expect(hubState(input({ calm: true }))[0].boss).toBeNull();
  });

  it("due refs split per chapter in input order", () => {
    const [a, b] = hubState(input());
    expect(a.due).toEqual({ arena: ["ch01#b", "ch01#a"], page: ["ch01#c"] });
    expect(b.due).toEqual({ arena: ["ch02#a"], page: [] });
  });

  it("mastery counts, a missing band is none", () => {
    const [a, b] = hubState(input());
    expect(a.mastery).toEqual({ strong: 1, building: 0, weak: 1, none: 1 });
    expect(b.mastery).toEqual({ strong: 0, building: 0, weak: 0, none: 1 });
  });

  it("same array for equal input, new for changed", () => {
    const one = hubState(input());
    expect(hubState(input())).toBe(one);
    const two = hubState(input({ calm: true }));
    expect(two).not.toBe(one);
    expect(hubState(input({ calm: true }))).toBe(two);
    expect(hubState(input({ bands: { "ch01#a": "building" } }))).not.toBe(two);
  });

  it("each field of the input misses the cache", () => {
    const base = hubState(input());
    expect(hubState(input({ medals: { ch02: 3 } }))).not.toBe(base);
    expect(hubState(input({ solids: { p1: "tetra", p2: "octa" } }))).not.toBe(hubState(input({ solids: { p1: "icosa", p2: "octa" } })));
    expect(hubState(input({ bands: { "ch01#a": "weak" } }))).not.toBe(hubState(input({ bands: { "ch01#a": "strong" } })));
    expect(hubState(input({ calm: true }))).not.toBe(hubState(input()));
  });

  it("the output is frozen", () => {
    const out = hubState(input());
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out[0])).toBe(true);
    expect(Object.isFrozen(out[0].boss)).toBe(true);
    expect(Object.isFrozen(out[0].due)).toBe(true);
    expect(Object.isFrozen(out[0].due.arena)).toBe(true);
    expect(Object.isFrozen(out[0].mastery)).toBe(true);
  });
});
