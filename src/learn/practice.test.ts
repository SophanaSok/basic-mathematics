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

  it("pays a learner's first run of the day in full, however many answers share a section", () => {
    /* a Repair: five first tries on one section, the day's first run */
    const repair = settleRun([2, 2, 2, 2, 2].map((xp) => ({ section: "a", xp })), false, fresh());
    expect([repair.answers, repair.full, repair.reduced]).toEqual([10, 10, []]);
    /* two sections ready, five questions on each */
    const two = settleRun(["a", "b", "a", "b", "a", "b", "a", "b", "a", "b"].map((section) => ({ section, xp: 2 })), true, fresh());
    expect([two.answers, two.full, two.finish, two.reduced]).toEqual([20, 20, 5, []]);
    expect(two.day).toEqual({ day: D, sec: { a: 5, b: 5 }, finishes: 1 });
  });

  it("sets a section's rate by the answers earlier runs paid that day, first tries and retries alike, summed and rounded once", () => {
    const paid = [3, 3, 3].map((xp) => ({ section: "a", xp })).concat([{ section: "b", xp: 1 }, { section: "a", xp: 1 }, { section: "c", xp: 3 }]);
    /* earlier today: a paid 2 (so this run's a answers are the 3rd on: half), b paid 4 (a quarter), c none */
    const s = settleRun(paid, true, { day: D, sec: { a: 2, b: 4 }, finishes: 0 });
    /* a: (3 + 3 + 3 + 1) / 2 = 5; b: 1 / 4; c: 3 → 8.25, rounded once */
    expect([s.answers, s.full, s.finish, s.reduced, s.finishReduced]).toEqual([8, 14, 5, ["a", "b"], false]);
    expect(s.day).toEqual({ day: D, sec: { a: 6, b: 5, c: 1 }, finishes: 1 });
  });

  it("carries the counts from run to run in a day, and leaves what it was given alone", () => {
    const before = fresh();
    const one = settleRun([{ section: "a", xp: 2 }, { section: "a", xp: 2 }], true, before);
    expect(before).toEqual({ day: D, sec: {}, finishes: 0 });
    const two = settleRun([{ section: "a", xp: 2 }, { section: "a", xp: 2 }], true, one.day);
    const three = settleRun([{ section: "a", xp: 2 }], true, two.day);
    expect([one.answers, two.answers, three.answers]).toEqual([4, 2, 1]);
    expect([one.reduced, two.reduced, three.reduced]).toEqual([[], ["a"], ["a"]]);
    expect([one.finish, two.finish, three.finish, three.finishReduced]).toEqual([5, 5, 1, true]);
  });

  it("skips what pays nothing, and says nothing was reduced when rounding made it whole", () => {
    const s = settleRun([{ section: "a", xp: 0 }, { section: "a", xp: -1 }], false, fresh());
    expect([s.answers, s.day.sec, s.finish, s.finishReduced]).toEqual([0, {}, 0, false]);
    const third = settleRun([{ section: "a", xp: 1 }], false, { day: D, sec: { a: 2 }, finishes: 0 });
    /* half of 1 rounds to 1: nothing to say was reduced */
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
    /* settled on the later day itself, the later day's counts are kept */
    expect(toStore(later, older, "2026-10-06")).toEqual(later);
  });

  it("drops counts from a day after today, left by a clock that has since moved back", () => {
    /* one run stored on the 6th, then the clock set back to the 5th: five runs of ten answers */
    let stored: unknown = { day: "2026-10-06", sec: { a: 10 }, finishes: 1 };
    const paid = Array.from({ length: 10 }, () => ({ section: "a", xp: 2 }));
    const out: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = settleRun(paid, true, arenaDayFor(stored, D));
      stored = toStore(stored, s.day, D);
      out.push(s.answers + s.finish);
    }
    expect(out).toEqual([25, 10, 6, 6, 6]);
    expect(stored).toEqual({ day: D, sec: { a: 50 }, finishes: 5 });
  });
});
