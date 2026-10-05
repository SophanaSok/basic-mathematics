/* Signs that a learner is stuck on one exercise, kept in memory for one page view.

   Four signals (thresholds in ./constants.ts, which says why they are guesses):
     rapid    several checks in a short window
     repeat   the same wrong answer twice in a row, after the site's own normalisation
              of white space, dashes and case
     idle     no input for a while, focus still in the card, after a miss
     misses   two wrong checks with no clue opened
   Each fires at most once per exercise per page view, and all a signal ever produces is a
   quiet one-line offer in the card (src/ui/ladder.ts): never a modal, a toast, a rung
   opened, or anything locked.

   Nothing here is stored or synced, and no typed text is kept: a wrong answer is reduced
   at once to a short hash, which is all `repeat` compares. A new page view starts empty.
   No DOM and no `window`: the idle timer belongs to the caller, which asks idle() when
   its timer runs out. */

import { STUCK_IDLE_MS, STUCK_MISSES_NO_CLUE, STUCK_RAPID_CHECKS, STUCK_RAPID_WINDOW_MS, STUCK_REPEAT_WRONG } from "./constants.ts";

export type StuckSignal = "rapid" | "repeat" | "idle" | "misses";

/** a typed answer reduced to a short hash of its normalised form: equal answers give
    equal hashes, and the text itself is not kept */
export function answerHash(given: string | readonly string[]): string {
  const text = (Array.isArray(given) ? given.join("\u0000") : String(given))
    .replace(/[−–—]/g, "-").replace(/\s+/g, "").toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ":" + text.length;
}

export class StuckWatch {
  private checks: number[] = [];
  private lastWrong: string | null = null;
  private sameWrong = 0;
  private misses = 0;
  private clue = false;
  private missedAt: number | null = null;
  private readonly fired = new Set<StuckSignal>();

  /** One check at time `t` (ms). Returns the signal this check sets off, if any: at
      most one per check, and none twice in a page view. A right answer ends the watch. */
  check(t: number, ok: boolean, given: string | readonly string[]): StuckSignal | null {
    this.checks.push(t);
    this.checks = this.checks.filter((x) => t - x <= STUCK_RAPID_WINDOW_MS);
    if (ok) { this.missedAt = null; return null; }
    this.misses++;
    this.missedAt = t;
    const h = answerHash(given);
    this.sameWrong = h === this.lastWrong ? this.sameWrong + 1 : 1;
    this.lastWrong = h;
    if (this.sameWrong >= STUCK_REPEAT_WRONG && this.fire("repeat")) return "repeat";
    if (this.checks.length >= STUCK_RAPID_CHECKS && this.fire("rapid")) return "rapid";
    if (!this.clue && this.misses >= STUCK_MISSES_NO_CLUE && this.fire("misses")) return "misses";
    return null;
  }

  /** a clue was opened (on this page view or a saved one) */
  clueOpened(): void { this.clue = true; }

  /** any input in the card: the idle clock starts again from `t` */
  activity(t: number): void { if (this.missedAt !== null) this.missedAt = t; }

  /** How long from `t` until idle() could fire, or null when it cannot (no miss pending,
      or it has fired already). The caller sets one timer for that, never a loop. */
  idleIn(t: number): number | null {
    if (this.missedAt === null || this.fired.has("idle")) return null;
    return Math.max(0, this.missedAt + STUCK_IDLE_MS - t);
  }

  /** The caller's timer ran out at `t`: "idle" when the card has been left alone for
      STUCK_IDLE_MS since the last miss or input, with focus still inside it. */
  idle(t: number, focusInCard: boolean): StuckSignal | null {
    if (this.missedAt === null || !focusInCard) return null;
    if (t - this.missedAt < STUCK_IDLE_MS) return null;
    return this.fire("idle") ? "idle" : null;
  }

  /** the exercise was solved: nothing more fires on it */
  solved(): void {
    this.missedAt = null;
    (["rapid", "repeat", "idle", "misses"] as StuckSignal[]).forEach((s) => this.fired.add(s));
  }

  has(signal: StuckSignal): boolean { return this.fired.has(signal); }

  private fire(s: StuckSignal): boolean {
    if (this.fired.has(s)) return false;
    this.fired.add(s);
    return true;
  }
}
