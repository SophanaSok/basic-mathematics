import { describe, expect, it } from "vitest";
import { ARENA_DECAY, ARENA_DECAY_FLOOR, ARENA_FINISH_AFTER, ARENA_FINISH_FULL_PER_DAY, ARENA_FINISH_XP } from "./constants.ts";
import { arenaDayFor, decay, finishBonus, settleRun, toStore } from "./practice.ts";

const D = "2026-10-05";
const fresh = () => arenaDayFor(null, D);

describe("Arena XP against farming", () => {
  it("decays 1, 1, ½, ½, then a quarter, and never to nothing", () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(decay)).toEqual([1, 1, 0.5, 0.5, 0.25, 0.25, 0.25]);
    expect(ARENA_DECAY).toEqual([1, 1, 0.5, 0.5]);
    expect(ARENA_DECAY_FLOOR).toBeGreaterThan(0);
  });

  it("pays the finishing bonus in full for two runs a day, then less", () => {
    expect([ARENA_FINISH_XP, ARENA_FINISH_FULL_PER_DAY, ARENA_FINISH_AFTER]).toEqual([5, 2, 1]);
    expect([1, 2, 3, 9].map(finishBonus)).toEqual([5, 5, 1, 1]);
  });

  it("counts per section, first tries and retries alike, sums and rounds once per run", () => {
    const paid = [3, 3, 3, 3, 3].map((xp) => ({ section: "a", xp })).concat([{ section: "b", xp: 1 }, { section: "a", xp: 1 }]);
    const s = settleRun(paid, true, fresh());
    /* a: 3 + 3 + 1.5 + 1.5 + 0.75 + (retry) 0.25; b: 1 → 11, rounded once */
    expect([s.answers, s.full, s.finish, s.reduced, s.finishReduced]).toEqual([11, 17, 5, ["a"], false]);
    expect(s.day).toEqual({ day: D, sec: { a: 6, b: 1 }, finishes: 1 });
  });

  it("carries the counts from run to run in a day, and leaves what it was given alone", () => {
    const before = fresh();
    const one = settleRun([{ section: "a", xp: 2 }, { section: "a", xp: 2 }], true, before);
    expect(before).toEqual({ day: D, sec: {}, finishes: 0 });
    const two = settleRun([{ section: "a", xp: 2 }], true, one.day);
    const three = settleRun([{ section: "a", xp: 2 }], true, two.day);
    expect([one.answers, two.answers, three.answers]).toEqual([4, 1, 1]);
    expect([one.finish, two.finish, three.finish, three.finishReduced]).toEqual([5, 5, 1, true]);
  });

  it("skips what pays nothing, and says nothing was reduced when rounding made it whole", () => {
    const s = settleRun([{ section: "a", xp: 0 }, { section: "a", xp: -1 }], false, fresh());
    expect([s.answers, s.day.sec, s.finish, s.finishReduced]).toEqual([0, {}, 0, false]);
    const third = settleRun([{ section: "a", xp: 1 }], false, { day: D, sec: { a: 2 }, finishes: 0 });
    expect([third.answers, third.reduced]).toEqual([1, []]);
  });

  it("starts again on a new day, and reads damaged counts as none", () => {
    expect(arenaDayFor({ day: "2026-10-04", sec: { a: 9 }, finishes: 4 }, D)).toEqual({ day: D, sec: {}, finishes: 0 });
    expect(arenaDayFor({ day: D, sec: { a: 9, b: "x", c: -2, d: 2.5 }, finishes: "y" }, D)).toEqual({ day: D, sec: { a: 9, d: 2 }, finishes: 0 });
    expect(arenaDayFor([1, 2], D)).toEqual({ day: D, sec: {}, finishes: 0 });
  });

  it("keeps a later day's counts when an older run settles after them", () => {
    const later = { day: "2026-10-06", sec: { a: 3 }, finishes: 1 };
    const older = settleRun([{ section: "a", xp: 2 }], true, arenaDayFor(later, D)).day;
    expect(toStore(later, older)).toEqual(later);
    expect(toStore({ day: "2026-10-04", sec: { a: 9 }, finishes: 9 }, older)).toEqual(older);
    expect(toStore(undefined, older)).toEqual(older);
  });
});
