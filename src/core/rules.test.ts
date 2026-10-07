import { describe, expect, it } from "vitest";
import { CLUE_FREE, FADED_RUNG, Road, STRONG, WEAK, XP, fadedOf, isMiss, medalMark, paysFirst, setStats, struggle, xpFor } from "./rules.ts";

/* The roads to a first right answer, the rewards and the medals are run end to end through
   assets/site.js and assets/game.js by tools/game/rules.test.js; here, each rule alone. */

describe("what a right answer pays", () => {
  it("keeps the rates the site has always paid", () => {
    expect(XP).toEqual({ first: 10, solved: 6, opened: 3, inlineFirst: 5, inline: 3, inlineOpened: 1, mission: 5 });
    expect(CLUE_FREE).toBe(1);
  });

  it("pays the first-time rate for right first time, with no clue or only the first", () => {
    expect(paysFirst({ first: 1 })).toBe(true);
    expect(paysFirst({ first: 1, rung: 1 })).toBe(true);
    expect(paysFirst({ first: 1, rung: 2 })).toBe(false);
    expect(paysFirst({ first: 1, rung: "x" })).toBe(true);
    expect(paysFirst({ first: 1, opened: 1 })).toBe(false);
    expect(paysFirst({ first: 0 })).toBe(false);
    expect(paysFirst(null)).toBe(false);
  });

  it("pays by what was opened, then by first time, scored or inline", () => {
    expect([xpFor({ first: 1 }), xpFor({ first: 1 }, true)]).toEqual([XP.first, XP.inlineFirst]);
    expect([xpFor({ first: 1, rung: 3 }), xpFor({ first: 0 }, true)]).toEqual([XP.solved, XP.inline]);
    expect([xpFor({ first: 1, opened: 1 }), xpFor({ opened: 1 }, true)]).toEqual([XP.opened, XP.inlineOpened]);
  });

  it("calls rung 4 faded, and pays it no first-time rate", () => {
    expect(FADED_RUNG).toBe(4);
    expect([fadedOf({ rung: 4 }), fadedOf({ rung: "4" }), fadedOf({ rung: 3 }), fadedOf({}), fadedOf(null)]).toEqual([true, true, false, false, false]);
    expect(paysFirst({ first: 1, rung: FADED_RUNG })).toBe(false);
  });
});

describe("the road to a first right answer", () => {
  it("counts checks, keeps the highest hint level, and settles first on the right one", () => {
    const a: Record<string, unknown> = { skipped: 1 };
    Road.check(a, false, 1, false, "angles");
    Road.check(a, false, 2, true, "");
    expect(a).toEqual({ skipped: 1, tries: 2, section: "angles", hints: 2, inline: 1 });
    Road.check(a, true, 1);
    expect([a.tries, a.first, a.hints, "skipped" in a, typeof a.solved]).toEqual([3, 0, 2, false, "number"]);
    const b: Record<string, unknown> = {};
    expect(Road.check(b, true, 0).first).toBe(1);
    expect(Road.check(Road.reveal({}, false, "x"), true, 0).first).toBe(0);
  });

  it("marks the solution open, and keeps the highest clue", () => {
    expect(Road.reveal({}, true, "ch02#one-unknown")).toEqual({ opened: 1, section: "ch02#one-unknown", inline: 1 });
    const a: Record<string, unknown> = {};
    Road.clue(a, 2);
    Road.clue(a, 1);
    expect(a.rung).toBe(2);
    Road.clue(a, 3);
    expect(a.rung).toBe(3);
    expect(Road.clue({ rung: "junk" }, 1).rung).toBe(1);
  });
});

describe("how hard an exercise was", () => {
  it("scores from 0 (right first time) to 1, and nothing when there is nothing to go on", () => {
    expect([struggle(null), struggle({}), struggle({ hints: 2 })]).toEqual([null, null, null]);
    expect(struggle({ tries: 1, solved: 5, first: 1 })).toBe(0);
    expect(struggle({ tries: 2, solved: 5, first: 0 })).toBeCloseTo(0.35);
    expect(struggle({ tries: 6, solved: 5, first: 0 })).toBeCloseTo(0.8);
    expect(struggle({ tries: 2 })).toBeCloseTo(0.7);
    expect(struggle({ skipped: 1 })).toBeCloseTo(0.45);
    expect(struggle({ tries: 3, opened: 1, hints: 2 })).toBe(1);
    expect([WEAK, STRONG]).toEqual([0.34, 0.12]);
  });
});

describe("hearts and medals", () => {
  it("a miss is a wrong check before the first right one; help is not", () => {
    expect([isMiss({ tries: 1 }), isMiss({ tries: 1, solved: 5 }), isMiss({ tries: 2, solved: 5 }), isMiss({ opened: 1, rung: 3 }), isMiss("junk")]).toEqual([true, false, true, false, false]);
    expect([medalMark({ tries: 1, solved: 5, first: 1 }), medalMark({ tries: 1, solved: 5, first: 0, opened: 1 }), medalMark({ tries: 2 }), medalMark({})]).toEqual([false, true, true, false]);
  });

  it("stands a set from the stores it is handed, and changes none of them", () => {
    const S = {
      progress: { ch01: { solved: { e1: true, e2: true, e3: true }, total: 3 } },
      attempts: { ch01: { e1: { tries: 1, solved: 10, first: 1 }, e2: { tries: 2, solved: 30, first: 0 }, e3: { tries: 1, solved: 20, first: 0, opened: 1 } } }
    };
    const before = JSON.stringify(S);
    const st = setStats(S, "ch01", ["e1", "e2", "e3"]);
    expect(st).toEqual({ total: 3, solved: 3, first: 1, misses: 1, marks: 2, how: ["first", "solved", "opened"], lastSolved: 30, tried: 3, hp: 0, hearts: 2, won: true, medal: 2 });
    expect(JSON.stringify(S)).toBe(before);
    expect(setStats(S, "ch01", ["e1"]).medal).toBe(3);
    expect(setStats(S, "ch01", ["e1", "e4"])).toMatchObject({ won: false, medal: 0, hp: 1, how: ["first", "open"] });
    expect(setStats({ progress: { ch01: { solved: { e9: true } } } }, "ch01", ["e9"]).how).toEqual(["unknown"]);
    expect(setStats({}, "ch01", null)).toMatchObject({ total: 0, won: false, hearts: 3, medal: 0 });
  });
});
