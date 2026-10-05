import { describe, expect, it } from "vitest";
import { level, levelInfo, rank, threshold } from "./levels.js";

describe("the level curve", () => {
  it("starts each level at 5(L - 1)(L + 3) XP", () => {
    expect([1, 2, 3, 4, 5].map(threshold)).toEqual([0, 25, 60, 105, 160]);
  });

  it("puts every XP from 0 to 60000 between its level's threshold and the next", () => {
    for (let xp = 0; xp <= 60000; xp++) {
      const L = level(xp);
      if (!(threshold(L) <= xp && xp < threshold(L + 1))) throw new Error("level(" + xp + ") = " + L);
    }
  });

  it("is exact at every boundary", () => {
    for (let L = 1; L <= 120; L++) {
      expect(level(threshold(L))).toBe(L);
      expect(level(threshold(L) - 1)).toBe(Math.max(1, L - 1));
    }
  });

  it("reads anything that is not a number of XP as none", () => {
    expect([undefined, null, "x", NaN, -40, Infinity].map(level)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(level("60")).toBe(3);
  });

  it("names the ranks", () => {
    expect([1, 2, 3, 5, 6, 9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 99].map(rank)).toEqual([
      "Counter", "Counter", "Reckoner", "Reckoner", "Solver", "Solver", "Geometer", "Geometer",
      "Cartographer", "Cartographer", "Analyst", "Analyst", "Prover", "Prover", "Mathematician", "Mathematician"
    ]);
  });

  it("says where a total stands", () => {
    expect(levelInfo(70)).toEqual({ xp: 70, level: 3, rank: "Reckoner", floor: 60, next: 105, into: 10, span: 45, pct: 22 });
    expect(levelInfo(0).pct).toBe(0);
    expect(levelInfo(104).pct).toBe(98);
  });
});
