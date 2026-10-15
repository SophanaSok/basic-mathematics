import { describe, expect, it } from "vitest";
import { FADED_RUNG } from "../core/rules.ts";
import { CLUE_RUNGS } from "./constants.ts";
import { canOpen, cluesOf, nextLabel, offerAfterWrong, open, savedRung, start, toSave, type LadderState } from "./ladder.ts";

describe("the ladder's rungs", () => {
  it("are the clues an exercise has, in order, empty ones left out", () => {
    expect(cluesOf(["where to look", "", "the first step"])).toEqual(["where to look", "the first step"]);
    expect(cluesOf([null, undefined, "  "])).toEqual([]);
    expect(cluesOf(["a", "b", "c", "d"])).toHaveLength(CLUE_RUNGS);
  });

  it("start with what was saved, clamped to what this exercise has", () => {
    expect(start(2, undefined)).toEqual({ clues: 2, open: 0, fadeable: false, faded: false });
    expect(start(2, 1)).toEqual({ clues: 2, open: 1, fadeable: false, faded: false });
    expect(start(2, 3)).toEqual({ clues: 2, open: 2, fadeable: false, faded: false });
    expect(start(3, 2.7)).toEqual({ clues: 3, open: 2, fadeable: false, faded: false });
    for (const junk of [-1, "2", null, true, [1], { a: 1 }, NaN, Infinity]) expect(start(3, junk).open).toBe(0);
    expect(start(9, 0).clues).toBe(CLUE_RUNGS);
    expect(start(3, "4", true).faded).toBe(true);
    expect(start(3, "x", true).faded).toBe(false);
    expect(savedRung(5, 2)).toBe(2);
  });

  it("open one rung per learner action, never past the last clue", () => {
    let s: LadderState = start(3);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) { s = open(s); seen.push(s.open); }
    expect(seen).toEqual([1, 2, 3, 3, 3]);
    expect(canOpen(s)).toBe(false);
    expect(open(start(0))).toEqual({ clues: 0, open: 0, fadeable: false, faded: false });
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

describe("the faded rung", () => {
  it("is a rung past the clues only when the exercise can fade", () => {
    expect(start(2, 4, true)).toMatchObject({ open: 2, faded: true });
    expect(start(2, 4, false)).toMatchObject({ open: 2, faded: false });
    expect(start(2, undefined, true).faded).toBe(false);
    expect(start(2, 3, true).faded).toBe(false);
  });

  it("opens after the clues, once, then nothing is left to open", () => {
    let s = start(2, undefined, true);
    const seen: Array<[number, boolean]> = [];
    for (let i = 0; i < 4; i++) { s = open(s); seen.push([s.open, s.faded]); }
    expect(seen).toEqual([[1, false], [2, false], [2, true], [2, true]]);
    expect(canOpen(s)).toBe(false);
    expect(canOpen(start(2, 2, true))).toBe(true);
    expect(canOpen(start(2, 2, false))).toBe(false);
  });

  it("saves rung 4, and nothing once solved or already recorded", () => {
    const f = open(open(open(start(2, undefined, true))));
    expect(toSave(f, false, undefined)).toBe(FADED_RUNG);
    expect(toSave(f, false, 2)).toBe(FADED_RUNG);
    expect(toSave(f, false, 4)).toBeNull();
    expect(toSave(f, true, undefined)).toBeNull();
  });

  it("is offered after a wrong check only when the clues are exhausted", () => {
    expect(offerAfterWrong(start(2, 1, true), true)).toBe("clue");
    expect(offerAfterWrong(start(2, 2, true), true)).toBe("steps");
    expect(offerAfterWrong(start(0, undefined, true), true)).toBe("steps");
    expect(offerAfterWrong(start(2, 4, true), true)).toBe("solution");
    expect(offerAfterWrong(start(2, 2, false), true)).toBe("solution");
  });

  it("is counted by the button", () => {
    expect(nextLabel(start(2, 0, true))).toEqual({ rung: 1, of: 3 });
    expect(nextLabel(start(2, 2, true))).toEqual({ rung: 3, of: 3 });
    expect(nextLabel(start(2, 4, true))).toBeNull();
    expect(nextLabel(start(3, 3, true))).toEqual({ rung: 4, of: 4 });
  });

  it("sits past the last clue", () => {
    expect(CLUE_RUNGS).toBeLessThan(FADED_RUNG);
  });
});
