import { describe, expect, it } from "vitest";
import { TWIN_MAX_SKIPS, TWIN_SEED_PREFIX, pickProblem, seedFor, twinPaid, twinXp } from "./twin.ts";

describe("twinXp", () => {
  it("pays solved minus assisted: 3 after the solution, 2 after the faded view", () => {
    expect(twinXp({ opened: 1 }, false)).toBe(3);
    expect(twinXp({ rung: 4 }, false)).toBe(2);
    expect(twinXp({ opened: 1, tries: 1 }, false)).toBe(3);
  });
  it("pays 2 and 1 inline", () => {
    expect(twinXp({ opened: 1 }, true)).toBe(2);
    expect(twinXp({ rung: 4 }, true)).toBe(1);
  });
  it("pays 0 with no help, or only clues", () => {
    expect(twinXp({}, false)).toBe(0);
    expect(twinXp({ tries: 2, solved: 1 }, false)).toBe(0);
    expect(twinXp({ rung: 3 }, false)).toBe(0);
    expect(twinXp(null, false)).toBe(0);
    expect(twinXp(undefined, true)).toBe(0);
    expect(twinXp("x", false)).toBe(0);
  });
  it("pays 0 once twin is present, whatever it holds", () => {
    for (const v of [1, null, "1", true, 0, undefined]) {
      expect(twinPaid({ opened: 1, twin: v })).toBe(true);
      expect(twinXp({ opened: 1, twin: v }, false)).toBe(0);
      expect(twinXp({ rung: 4, twin: v }, true)).toBe(0);
    }
    expect(twinPaid({ opened: 1 })).toBe(false);
    expect(twinPaid(null)).toBe(false);
  });
  it("lets opened win over the faded view", () => {
    expect(twinXp({ opened: 1, rung: 4 }, false)).toBe(3);
    expect(twinXp({ opened: 1, rung: 4 }, true)).toBe(2);
  });
});

describe("seedFor", () => {
  it("is stable and starts with the prefix", () => {
    expect(seedFor("ch05", "e1", 0)).toBe(seedFor("ch05", "e1", 0));
    expect(seedFor("ch05", "e1", 0)).toBe(TWIN_SEED_PREFIX + "ch05/e1:0");
    expect(seedFor("ch05", "e1", 1)).not.toBe(seedFor("ch05", "e1", 0));
  });
});

describe("pickProblem", () => {
  const list = ["a", "b", "c", "d"];
  it("returns the seed's pick", () => {
    expect(pickProblem(list, 6, () => true)).toBe("c");
    expect(pickProblem(list, 0, () => true)).toBe("a");
  });
  it("skips a failing verify, in order", () => {
    expect(pickProblem(list, 1, (p) => p !== "b")).toBe("c");
    expect(pickProblem(list, 3, (p) => p !== "d")).toBe("a");
  });
  it("gives null after the cap or when none verifies", () => {
    expect(pickProblem(list, 0, () => false)).toBeNull();
    const many = Array.from({ length: 20 }, (_, i) => i);
    let tries = 0;
    expect(pickProblem(many, 0, () => { tries++; return false; })).toBeNull();
    expect(tries).toBe(TWIN_MAX_SKIPS);
    expect(pickProblem(many, 0, (p) => p === TWIN_MAX_SKIPS)).toBeNull();
  });
  it("never throws on an empty list or a throwing verify", () => {
    expect(pickProblem([], 3, () => true)).toBeNull();
    expect(pickProblem(list, 0, () => { throw new Error("x"); })).toBeNull();
    expect(pickProblem(list, -3, () => true)).toBe("b");
    expect(pickProblem(list, NaN, () => true)).toBe("a");
  });
});
