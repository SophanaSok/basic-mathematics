import { describe, expect, it } from "vitest";
import { CLUE_RUNGS } from "./constants.ts";
import { canOpen, cluesOf, nextLabel, offerAfterWrong, open, savedRung, start, toSave, type LadderState } from "./ladder.ts";

describe("the ladder's rungs", () => {
  it("are the clues an exercise has, in order, empty ones left out", () => {
    expect(cluesOf(["where to look", "", "the first step"])).toEqual(["where to look", "the first step"]);
    expect(cluesOf([null, undefined, "  "])).toEqual([]);
    expect(cluesOf(["a", "b", "c", "d"])).toHaveLength(CLUE_RUNGS);
  });

  it("start with what was saved, clamped to what this exercise has", () => {
    expect(start(2, undefined)).toEqual({ clues: 2, open: 0 });
    expect(start(2, 1)).toEqual({ clues: 2, open: 1 });
    expect(start(2, 3)).toEqual({ clues: 2, open: 2 });
    expect(start(3, 2.7)).toEqual({ clues: 3, open: 2 });
    for (const junk of [-1, "2", null, true, [1], { a: 1 }, NaN, Infinity]) expect(start(3, junk).open).toBe(0);
    expect(start(9, 0).clues).toBe(CLUE_RUNGS);
    expect(savedRung(5, 2)).toBe(2);
  });

  it("open one rung per learner action, never past the last clue", () => {
    let s: LadderState = start(3);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) { s = open(s); seen.push(s.open); }
    expect(seen).toEqual([1, 2, 3, 3, 3]);
    expect(canOpen(s)).toBe(false);
    expect(open(start(0))).toEqual({ clues: 0, open: 0 });
  });

  it("only open() moves a rung: nothing a wrong answer or an offer does opens one", () => {
    /* every function of the module that takes a state, run over every state there is:
       none hands back a state but open(), and open() moves by exactly one */
    for (let clues = 0; clues <= CLUE_RUNGS; clues++) {
      for (let at = 0; at <= clues; at++) {
        const s = start(clues, at);
        const frozen = JSON.stringify(s);
        for (const sol of [true, false]) expect(typeof offerAfterWrong(s, sol)).toBe("string");
        nextLabel(s); canOpen(s); toSave(s, false, 0); toSave(s, true, 0);
        expect(JSON.stringify(s)).toBe(frozen);
        expect(open(s).open - s.open).toBe(canOpen(s) ? 1 : 0);
      }
    }
  });
});

describe("what is saved", () => {
  it("is the highest rung opened, and only while the exercise is unsolved", () => {
    const two = open(open(start(3)));
    expect(toSave(two, false, undefined)).toBe(2);
    expect(toSave(two, false, 1)).toBe(2);
    expect(toSave(two, false, 2)).toBeNull();
    expect(toSave(two, false, 3)).toBeNull();
    expect(toSave(two, true, undefined)).toBeNull();
    expect(toSave(start(3), false, undefined)).toBeNull();
  });
});

describe("after a wrong check", () => {
  it("the offer is the next clue, then the solution, then only another try", () => {
    expect(offerAfterWrong(start(2, 0), true)).toBe("clue");
    expect(offerAfterWrong(start(2, 1), true)).toBe("clue");
    expect(offerAfterWrong(start(2, 2), true)).toBe("solution");
    expect(offerAfterWrong(start(0), true)).toBe("solution");
    expect(offerAfterWrong(start(2, 2), false)).toBe("retry");
  });

  it("the button names the clue it opens and how many there are", () => {
    expect(nextLabel(start(2))).toEqual({ rung: 1, of: 2 });
    expect(nextLabel(start(2, 1))).toEqual({ rung: 2, of: 2 });
    expect(nextLabel(start(2, 2))).toBeNull();
    expect(nextLabel(start(0))).toBeNull();
  });
});
