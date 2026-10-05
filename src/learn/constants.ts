/* The numbers behind the help ladder's stuck signals, and (below) the Arena's due review
   and its XP against farming, in one place.

   These are engineering judgement, not research results. What the research supports is
   the shape (offer help when a learner looks stuck, never reveal it unasked, never charge
   for asking); it gives no threshold for "stuck", and neither does anything measured on
   this site yet. Each value below is a first guess, chosen to be quiet rather than eager:
   a signal only ever produces a one-line offer inside the card, so a threshold that fires
   too late costs little and one that fires too early is noise. Change them here and
   nowhere else; src/learn/stuck.ts reads them, and its tests read them too.

   No module here writes to `window` or touches the DOM, so Node and Vitest can load it. */

/** Checks that count as rapid when this many fall inside STUCK_RAPID_WINDOW_MS. */
export const STUCK_RAPID_CHECKS = 3;
/** The window, in milliseconds, for STUCK_RAPID_CHECKS. */
export const STUCK_RAPID_WINDOW_MS = 20_000;
/** The same wrong answer (normalised) this many times in a row is a signal. */
export const STUCK_REPEAT_WRONG = 2;
/** Milliseconds without input, focus still in the card, after a miss. */
export const STUCK_IDLE_MS = 90_000;
/** Wrong checks on this page view with no clue opened. */
export const STUCK_MISSES_NO_CLUE = 2;

/** Clue rungs the engine knows: data-hint, data-hint2, data-hint3. The worked solution
    comes after them and is not a rung of the ladder's state (it is `opened`). */
export const CLUE_RUNGS = 3;

/* ---------------------------------------------------------------- review --

   The Arena's spaced review, reading the boxes it has always kept in bm.game.v1.sec.

   BOX_DAYS is not new: it is the schedule assets/game.js has used since the Arena began
   (box 0 to 4, due again 1, 3, 7, 14 and 30 days after the section was last placed), moved
   here so that game.js and the Arena's fallback read one table instead of two that
   disagreed. Changing it changes which sections are due for every reader.

   The rest are engineering judgement, not research results. The research supports the
   shape: spaced retrieval beats massed practice, so a review serves what is due, spread
   across sections and interleaved, and Arena XP should reward spacing rather than volume
   (diminishing, never zero, so practice is never worthless). It gives no number for how
   many questions a review should hold or how fast XP should fall; nothing measured on this
   site does yet. Change them here and nowhere else: src/learn/review.ts, practice.ts and
   next.ts read them, and so do their tests. */

/** Days until a section in box 0..4 is due again (the existing schedule, see above). */
export const BOX_DAYS: readonly number[] = [1, 3, 7, 14, 30];
/** Questions in one due review, at most. */
export const REVIEW_MAX = 10;
/** Questions from one due section in one review, at most. */
export const REVIEW_PER_SECTION = 2;

/** An Arena run's answers from one section, when earlier runs that local day paid k - 1
    answers from it, are each worth ARENA_DECAY[k - 1] of their usual XP, and
    ARENA_DECAY_FLOOR from then on. Answers in the same run never lower each other's rate
    (practice.ts says why). Applied to first-try answers and paid retries alike; a run's
    answers are summed, then rounded once. */
export const ARENA_DECAY: readonly number[] = [1, 1, 0.5, 0.5];
export const ARENA_DECAY_FLOOR = 0.25;
/** The finishing bonus of a run, and how many finished runs a local day pay it in full;
    each one after that pays ARENA_FINISH_AFTER instead. The Daily's bonus is not touched. */
export const ARENA_FINISH_XP = 5;
export const ARENA_FINISH_FULL_PER_DAY = 2;
export const ARENA_FINISH_AFTER = 1;

/** Items on the "next best step" card, at most. */
export const NEXT_MAX_ITEMS = 3;
