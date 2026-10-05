import { describe, expect, it } from "vitest";
import { BOX_DAYS } from "./constants.ts";
import { addDays, boxOf, byOverdue, dayNumber, dueDate, dueOn, nextDue, overdue, place } from "./recall.ts";

const D = "2026-10-05";

describe("the review schedule", () => {
  it("keeps the schedule game.js has always had: 1, 3, 7, 14, 30 days", () => {
    expect(BOX_DAYS).toEqual([1, 3, 7, 14, 30]);
  });

  it("reads day keys as calendar days, across months, years and a DST change", () => {
    expect(dayNumber("2026-10-06")! - dayNumber("2026-10-05")!).toBe(1);
    expect(dayNumber("2027-01-01")! - dayNumber("2026-12-31")!).toBe(1);
    expect(dayNumber("2026-11-02")! - dayNumber("2026-10-31")!).toBe(2);
    expect([dayNumber(""), dayNumber("5 Oct"), dayNumber(null), dayNumber(20261005)]).toEqual([null, null, null, null]);
    expect([addDays(D, 1), addDays(D, 30), addDays("2026-12-31", 1), addDays(D, -5), addDays("x", 1)])
      .toEqual(["2026-10-06", "2026-11-04", "2027-01-01", "2026-09-30", null]);
  });

  it("is due once the box's interval has passed, and at once when never placed", () => {
    BOX_DAYS.forEach((days, box) => {
      const last = addDays(D, -days)!, early = addDays(D, -days + 1)!;
      expect(dueOn({ box, last }, D)).toBe(true);
      expect(dueOn({ box, last: early }, D)).toBe(false);
    });
    expect(dueOn({}, D)).toBe(true);
    expect(dueOn(undefined, D)).toBe(true);
    expect(dueOn({ box: 2, last: "garbage" }, D)).toBe(true);
  });

  it("reads a damaged box as the nearest one there is", () => {
    expect([boxOf({ box: 9 }), boxOf({ box: -1 }), boxOf({ box: "2" }), boxOf({ box: 2.7 }), boxOf({ box: "x" }), boxOf(null)]).toEqual([4, 0, 2, 2, 0, 0]);
  });

  it("places a section: a miss to box 0 now, a clean due showing up one, an early one leaves it", () => {
    expect(place({ box: 3, last: "2026-09-01" }, true, D)).toEqual({ box: 0, last: D });
    expect(place({ box: 1, last: addDays(D, -3) }, false, D)).toEqual({ box: 2, last: D });
    expect(place({ box: 1, last: addDays(D, -2) }, false, D)).toEqual({ box: 1, last: addDays(D, -2) });
    expect(place({ box: 4, last: addDays(D, -30) }, false, D)).toEqual({ box: 4, last: D });
    expect(place({}, false, D)).toEqual({ box: 1, last: D });
    expect(place({ box: 2 }, false, D)).toEqual({ box: 3, last: D });
  });

  it("says when a section falls due and how far past it is", () => {
    expect(dueDate({ box: 2, last: D })).toBe("2026-10-12");
    expect(dueDate({ box: 2 })).toBeNull();
    expect(overdue({ box: 0, last: addDays(D, -1) }, D)).toBe(0);
    expect(overdue({ box: 1, last: addDays(D, -10) }, D)).toBe(7);
    expect(overdue({ box: 1, last: D }, D)).toBe(-3);
    expect(overdue({}, D)).toBeNull();
  });

  it("orders most overdue first, never-placed sections after, ties in reading order", () => {
    const rows = [
      { id: "b", index: 5 },
      { id: "late1", box: 0, last: addDays(D, -2), index: 9 },
      { id: "late9", box: 1, last: addDays(D, -12), index: 7 },
      { id: "a", index: 1 },
      { id: "late1b", box: 0, last: addDays(D, -2), index: 3 }
    ];
    expect(byOverdue(rows, D).map((r) => r.id)).toEqual(["late9", "late1b", "late1", "a", "b"]);
  });

  it("finds the next section to come due, among those not due today", () => {
    const rows = [
      { id: "x", box: 2, last: D },
      { id: "y", box: 0, last: D },
      { id: "z", box: 0, last: addDays(D, -4) },
      { id: "n" }
    ];
    expect(nextDue(rows, D)).toEqual({ id: "y", day: "2026-10-06" });
    expect(nextDue([{ id: "n" }], D)).toBeNull();
  });
});
