/* The numbers behind the help ladder's stuck signals, in one place.

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
