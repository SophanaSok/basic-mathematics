import { describe, expect, it } from "vitest";
import { REVIEW_MAX, REVIEW_PER_SECTION } from "./constants.ts";
import { addDays } from "./recall.ts";
import { dueSplit, interleaved, planReview } from "./review.ts";

const D = "2026-10-05";
const ids = (n: number) => Array.from({ length: n }, (_, i) => "s" + i);

describe("a due review's plan", () => {
  it("serves only due sections, most overdue first, the ones the Arena cannot ask about apart", () => {
    const rows = [
      { id: "fresh", due: false, box: 2, last: D, arena: true, index: 0 },
      { id: "never", due: true, arena: true, index: 1 },
      { id: "late5", due: true, box: 0, last: addDays(D, -6), arena: true, index: 2 },
      { id: "page", due: true, box: 0, arena: false, index: 3 },
      { id: "late0", due: true, box: 1, last: addDays(D, -3), arena: true, index: 4 }
    ];
    const split = dueSplit(rows, D);
    expect(split.arena.map((r) => r.id)).toEqual(["late5", "late0", "never"]);
    expect(split.page.map((r) => r.id)).toEqual(["page"]);
    expect(dueSplit(rows.map((r) => ({ ...r, due: false })), D)).toEqual({ arena: [], page: [] });
  });

  it("asks at most two questions a section and ten in all", () => {
    expect([REVIEW_MAX, REVIEW_PER_SECTION]).toEqual([10, 2]);
    for (let n = 0; n <= 14; n++) {
      const plan = planReview(ids(n));
      const per: Record<string, number> = {};
      plan.forEach((id) => { per[id] = (per[id] || 0) + 1; });
      expect(plan.length).toBe(Math.min(REVIEW_MAX, REVIEW_PER_SECTION * n));
      expect(Math.max(0, ...Object.values(per))).toBeLessThanOrEqual(REVIEW_PER_SECTION);
      /* every due section gets one question before any gets a second */
      expect(Object.keys(per).length).toBe(Math.min(n, REVIEW_MAX));
    }
  });

  it("keeps the most overdue first and takes turns, so no two in a row share a section", () => {
    expect(planReview(["a", "b", "c"])).toEqual(["a", "b", "c", "a", "b", "c"]);
    expect(planReview(["a", "b", "c", "d", "e", "f", "g", "h"])).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "a", "b"]);
    expect(planReview(ids(12))).toEqual(ids(10));
    for (let n = 2; n <= 12; n++) expect(interleaved(planReview(ids(n)))).toBe(true);
    /* one section: two in a row cannot be helped */
    expect(planReview(["a"])).toEqual(["a", "a"]);
    expect(interleaved(["a", "a"])).toBe(true);
    expect(interleaved(["a", "b", "b"])).toBe(false);
  });

  it("asks nothing when nothing is due, and counts a section listed twice once", () => {
    expect(planReview([])).toEqual([]);
    expect(planReview(["a", "a", "b"])).toEqual(["a", "b", "a", "b"]);
  });
});
