/* seedEntries (src/learn/seed-entries.ts): a seed is one valid checkpoint entry that folds to
   itself, for a section the log knows nothing about, dated before today. */
import { describe, expect, it } from "vitest";
import { CHECKPOINT_DEV, eventId, isValid, type Payload } from "../sync/events.ts";
import { bandOf } from "./bands.ts";
import { MASTERY_PRIOR } from "./constants.ts";
import { masteryOf } from "./mastery.ts";
import { addDays, dayNumber } from "./recall.ts";
import { scheduleOf } from "./schedule.ts";
import { seedEntries } from "./seed-entries.ts";

const TODAY = "2026-10-14";

describe("seedEntries", () => {
  const sec = "ch01#rationals";
  const last = "2026-10-05";
  const patch = { [sec]: { box: 1, last }, "ch02#one-unknown": { box: 0, last } };

  it("gives one valid z entry per good seed, with no device", () => {
    const V = seedEntries(patch, TODAY);
    expect(Object.keys(V)).toHaveLength(2);
    Object.keys(V).forEach((id) => {
      expect(isValid(id, V[id])).toBe(true);
      expect(V[id][5]).toBe("z");
      expect(id.startsWith(CHECKPOINT_DEV + "-")).toBe(true);
    });
  });

  it("folds to exactly the seed, and has no evidence", () => {
    const V = seedEntries(patch, TODAY);
    expect(scheduleOf(V, sec, "2026-10-14")).toEqual({ box: 1, last });
    expect(masteryOf(V, sec)).toEqual({ m: MASTERY_PRIOR, c: 0 });
    expect(bandOf(V, sec)).toBe("none");
  });

  it("is deterministic", () => {
    expect(Object.keys(seedEntries(patch, TODAY))).toEqual(Object.keys(seedEntries(patch, TODAY)));
  });

  it("skips damaged seeds without throwing", () => {
    const bad = [
      { s: { box: 5, last } }, { s: { box: "1", last } }, { s: { box: 1, last: "2026-13-40" } },
      { s: { box: 1, last: 20 } }, { s: null }, { s: { box: 1.5, last } }, { s: { box: -1, last } }
    ];
    bad.forEach((p) => expect(seedEntries(p, TODAY)).toEqual({}));
    [null, undefined, 5, "x", [1], [{ box: 1, last }]].forEach((p) => expect(seedEntries(p, TODAY)).toEqual({}));
    expect(seedEntries(JSON.parse('{"__proto__":{"box":1,"last":"2026-10-05"}}'), TODAY)).toEqual({});
    expect(seedEntries({ ...patch, bad: { box: 9, last } }, TODAY)).toEqual(seedEntries(patch, TODAY));
  });

  it("is for a day before today only, so a miss made today is never erased", () => {
    expect(seedEntries({ [sec]: { box: 1, last: TODAY } }, TODAY)).toEqual({});
    expect(seedEntries({ [sec]: { box: 1, last: addDays(TODAY, 1) } }, TODAY)).toEqual({});
    expect(Object.keys(seedEntries({ [sec]: { box: 1, last: addDays(TODAY, -1) } }, TODAY))).toHaveLength(1);
    expect(seedEntries(patch, "not a day")).toEqual({});
  });

  it("skips a section the log already has an entry for", () => {
    const V = seedEntries(patch, TODAY, new Set([sec]));
    expect(Object.keys(V)).toHaveLength(1);
    expect(V[Object.keys(V)[0]][3]).toBe("ch02#one-unknown");
  });

  it("a later Arena day folds on from the seed", () => {
    const V = seedEntries({ [sec]: { box: 1, last } }, TODAY);
    const d = dayNumber(last)! + 3;
    const P: Payload = [d * 1440, d, "ar", sec, "", "a", 1, 1, 0, 0];
    const id = eventId("aaaaaaaa", P);
    expect(isValid(id, P)).toBe(true);
    const W = { ...V, [id]: P };
    expect(scheduleOf(W, sec, "2026-10-14")).toEqual({ box: 2, last: addDays(last, 3) });
  });
});
