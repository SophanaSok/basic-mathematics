import { describe, expect, it } from "vitest";
import { STUCK_IDLE_MS, STUCK_RAPID_WINDOW_MS } from "./constants.ts";
import { answerHash, StuckWatch } from "./stuck.ts";

const S = 1000;

describe("stuck signals", () => {
  it("rapid: three checks inside the window, and not when they are spread out", () => {
    const w = new StuckWatch();
    w.clueOpened();
    expect(w.check(0, false, "1")).toBeNull();
    expect(w.check(4 * S, false, "2")).toBeNull();
    expect(w.check(8 * S, false, "3")).toBe("rapid");
    const slow = new StuckWatch();
    slow.clueOpened();
    const gap = STUCK_RAPID_WINDOW_MS / 2 + S;
    expect([0, 1, 2].map((i) => slow.check(i * gap, false, String(i)))).toEqual([null, null, null]);
  });

  it("repeat: the same wrong answer twice in a row, after normalising", () => {
    const w = new StuckWatch();
    w.clueOpened();
    expect(w.check(0, false, " -3")).toBeNull();
    expect(w.check(60 * S, false, "−3")).toBe("repeat");
    const blanks = new StuckWatch();
    blanks.clueOpened();
    blanks.check(0, false, ["1", "2"]);
    expect(blanks.check(60 * S, false, ["1", " 2"])).toBe("repeat");
  });

  it("misses: two wrong checks with no clue opened, and not once a clue is", () => {
    const w = new StuckWatch();
    expect(w.check(0, false, "a")).toBeNull();
    expect(w.check(60 * S, false, "b")).toBe("misses");
    const helped = new StuckWatch();
    helped.clueOpened();
    helped.check(0, false, "a");
    expect(helped.check(60 * S, false, "b")).toBeNull();
  });

  it("each fires at most once per page view, and one check sets off at most one", () => {
    const w = new StuckWatch();
    const got = [0, 1, 2, 3, 4, 5].map((i) => w.check(i * S, false, "same"));
    expect(got.filter((x) => x !== null)).toEqual(["repeat", "rapid", "misses"]);
    expect(w.check(7 * S, false, "same")).toBeNull();
  });

  it("idle: only after a miss, only with focus in the card, only once the time has passed", () => {
    const w = new StuckWatch();
    expect(w.idleIn(0)).toBeNull();
    w.clueOpened();
    w.check(0, false, "x");
    expect(w.idleIn(10 * S)).toBe(STUCK_IDLE_MS - 10 * S);
    expect(w.idle(STUCK_IDLE_MS - 1, true)).toBeNull();
    expect(w.idle(STUCK_IDLE_MS, false)).toBeNull();
    w.activity(30 * S);
    expect(w.idle(STUCK_IDLE_MS, true)).toBeNull();
    expect(w.idle(30 * S + STUCK_IDLE_MS, true)).toBe("idle");
    expect(w.idle(60 * S + STUCK_IDLE_MS, true)).toBeNull();
    expect(w.idleIn(0)).toBeNull();
  });

  it("a solved exercise sets nothing off", () => {
    const w = new StuckWatch();
    w.check(0, false, "x");
    w.check(S, true, "y");
    w.solved();
    expect(w.idleIn(2 * S)).toBeNull();
    expect(w.check(2 * S, false, "x")).toBeNull();
    expect(w.check(3 * S, false, "x")).toBeNull();
  });

  it("keeps no typed text: a wrong answer is a short hash", () => {
    const h = answerHash("x^2 + 10x + 25");
    expect(h).not.toContain("10x");
    expect(h).toMatch(/^[0-9a-z]+:\d+$/);
    expect(answerHash("X^2+10X+25")).toBe(h);
    expect(answerHash("x^2+10x+26")).not.toBe(h);
  });
});
