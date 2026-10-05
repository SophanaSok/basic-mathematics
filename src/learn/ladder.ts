/* The help ladder of one exercise, as a state machine with no DOM in it.

   Rungs, in the order a learner climbs them:
     1  data-hint    where to look; never gives anything away
     2  data-hint2   more specific
     3  data-hint3   most concrete (the engine reads it now; the content comes later)
   and then the worked solution ("Show solution"), which is always there and is recorded
   as `opened`, not as a rung. An exercise whose markup has only some of the three has a
   shorter ladder: rung n is the n-th clue the exercise has, in that order.

   A rung opens only on a learner action (open()). Nothing here opens one by itself: no
   wrong answer, timer or stuck signal moves `open`, and the only thing that can raise it
   without a click is a saved position on reload (start()). The tests hold that.

   What is saved: the highest rung opened while the exercise was unsolved, in the attempt
   record's `rung` field (bm.attempts.v1, merged by max in assets/account.js). Once the
   exercise is solved nothing is written, so the record keeps describing the road to the
   first correct answer, as every other field of it does. `hints` is not touched here: it
   keeps its old meaning (assets/site.js), because the struggle score, an achievement and
   the server's hint_level read it. */

import { CLUE_RUNGS } from "./constants.ts";

export interface LadderState {
  /** clues this exercise has: 0 to CLUE_RUNGS */
  readonly clues: number;
  /** highest rung shown open, 0 when none is */
  readonly open: number;
}

/** What the card offers after a wrong check: the next clue, the solution once every clue
    is open, or only another try when there is no solution either. */
export type Offer = "clue" | "solution" | "retry";

/** A saved rung as a whole number in 0..clues; anything else (missing, damaged, from a
    later version with more rungs) is read as the nearest thing this version can show. */
export function savedRung(value: unknown, clues: number): number {
  const n = typeof value === "number" && isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(clues, n));
}

/** The clue texts an exercise has, in rung order, from its three attributes. */
export function cluesOf(attrs: ReadonlyArray<string | null | undefined>): string[] {
  return attrs.slice(0, CLUE_RUNGS).map((s) => (s == null ? "" : String(s).trim())).filter((s) => s !== "");
}

/** The ladder as a page view starts it: the rungs saved for this exercise shown open. */
export function start(clues: number, saved?: unknown): LadderState {
  const c = Math.max(0, Math.min(CLUE_RUNGS, Math.floor(clues) || 0));
  return { clues: c, open: savedRung(saved, c) };
}

export function canOpen(s: LadderState): boolean {
  return s.open < s.clues;
}

/** The learner asked for the next clue. The only transition that opens a rung. */
export function open(s: LadderState): LadderState {
  return canOpen(s) ? { clues: s.clues, open: s.open + 1 } : s;
}

/** The rung to write into the attempt record after `s` was reached, or null when nothing
    should be written: the exercise is already solved, or the record already says as much. */
export function toSave(s: LadderState, solved: boolean, recorded: unknown): number | null {
  if (solved || s.open <= 0) return null;
  const was = typeof recorded === "number" && isFinite(recorded) ? recorded : 0;
  return s.open > was ? s.open : null;
}

/** What a wrong check offers. Never a rung: an offer is a line of text, and the rung
    still opens only when the learner presses the button. */
export function offerAfterWrong(s: LadderState, hasSolution: boolean): Offer {
  if (canOpen(s)) return "clue";
  return hasSolution ? "solution" : "retry";
}

/** The button's words for the next rung: "1 of 2". null once every clue is open (the
    button goes; the solution is the next step and has its own). */
export function nextLabel(s: LadderState): { rung: number; of: number } | null {
  return canOpen(s) ? { rung: s.open + 1, of: s.clues } : null;
}
