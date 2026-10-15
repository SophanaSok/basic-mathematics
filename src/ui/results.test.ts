import { describe, expect, it } from "vitest";
import { COUNT_MS, SEEN_MAX, SEQ_MAX_MS, STEP_MS, hasSeen, markSeen, seenKey, stepDelays } from "./results.ts";

describe("stepDelays", () => {
  it("is empty for no steps and starts at 0", () => {
    expect(stepDelays(0)).toEqual([]);
    expect(stepDelays(1)).toEqual([0]);
  });
  it("spaces a few steps one reveal apart", () => {
    expect(stepDelays(4)).toEqual([0, STEP_MS, 2 * STEP_MS, 3 * STEP_MS]);
  });
  it("never lets the last step plus its count-up pass the cap", () => {
    for (let n = 1; n <= 40; n++) {
      const d = stepDelays(n);
      expect(d).toHaveLength(n);
      expect(d[n - 1] + COUNT_MS).toBeLessThanOrEqual(SEQ_MAX_MS);
      d.forEach((v, i) => { if (i) expect(v).toBeGreaterThanOrEqual(d[i - 1]); });
    }
  });
});

describe("seenKey", () => {
  it("joins the parts with a slash", () => {
    expect(seenKey(["ch05", "set1", 3])).toBe("ch05/set1/3");
    expect(seenKey(["run-1"])).toBe("run-1");
  });
});

describe("hasSeen and markSeen", () => {
  it("reads nothing from a run without the list", () => {
    expect(hasSeen({}, "a")).toBe(false);
    expect(hasSeen({ seen: "x" }, "a")).toBe(false);
  });
  it("marks a key and keeps the other keys of the run and of seen", () => {
    const run = { streak: 3, seen: { tip: 1 } };
    const out = markSeen(run, "a");
    expect(hasSeen(out, "a")).toBe(true);
    expect(out).toMatchObject({ streak: 3, seen: { tip: 1, results: { a: 1 } } });
    expect(run).toEqual({ streak: 3, seen: { tip: 1 } });
  });
  it("is idempotent", () => {
    expect(markSeen(markSeen({}, "a"), "a")).toEqual(markSeen({}, "a"));
  });
  it("caps at SEEN_MAX, dropping the oldest first", () => {
    let run: Record<string, unknown> = {};
    for (let i = 0; i < SEEN_MAX + 5; i++) run = markSeen(run, "k" + i);
    const keys = Object.keys((run.seen as any).results);
    expect(keys).toHaveLength(SEEN_MAX);
    expect(keys[0]).toBe("k5");
    expect(keys[keys.length - 1]).toBe("k" + (SEEN_MAX + 4));
    expect(hasSeen(run, "k0")).toBe(false);
  });
});
