/* Arena XP that rewards spacing rather than volume.

   Massed practice on one section in one sitting teaches less than the same practice spread
   over days, so the Arena's XP for a section falls the more of it is done on one day, and
   comes back the next. It never falls to nothing: practice is never worthless.

     answers   the k-th XP-paying answer from one section on one local day is worth
               ARENA_DECAY[k - 1] of its usual XP, then ARENA_DECAY_FLOOR; first-try answers
               and paid retries alike. A run's answers are summed and rounded once.
     finishing the bonus for finishing a run is paid in full for the first
               ARENA_FINISH_FULL_PER_DAY runs of a day that earn it, ARENA_FINISH_AFTER after.
     the Daily its bonus is not touched (game.js pays it, once a day, as before).

   The counts are this device's (bm.run.v1.arenaDay, never synced): { day, sec: { <section>:
   answers paid today }, finishes: runs that earned the finishing bonus today }. A new local
   day starts them again. The values are engineering judgement (constants.ts says why).

   Pure: no `window`, no DOM. assets/game.js (recordRun) and the Arena's fallback call it
   through window.BMReview. */

import { ARENA_DECAY, ARENA_DECAY_FLOOR, ARENA_FINISH_AFTER, ARENA_FINISH_FULL_PER_DAY, ARENA_FINISH_XP } from "./constants.ts";
import { dayNumber } from "./recall.ts";

export interface ArenaDay {
  day: string;
  sec: Record<string, number>;
  finishes: number;
}

function count(x: unknown): number {
  const n = Number(x);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The counts for `day`: the stored ones when they are that day's, a fresh set otherwise
    (another day, nothing stored, or something damaged). Always a copy. */
export function arenaDayFor(stored: unknown, day: string): ArenaDay {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  if (s.day !== day || dayNumber(day) === null) return { day, sec: {}, finishes: 0 };
  const sec: Record<string, number> = {};
  const from = s.sec && typeof s.sec === "object" && !Array.isArray(s.sec) ? (s.sec as Record<string, unknown>) : {};
  Object.keys(from).forEach((k) => { const n = count(from[k]); if (n) sec[k] = n; });
  return { day, sec, finishes: count(s.finishes) };
}

/** What to keep in the store after settling a run of day `next.day`: that, unless the store
    already holds a later day's counts (a run dealt yesterday and banked today counts against
    its own day and leaves today's alone). */
export function toStore(stored: unknown, next: ArenaDay): ArenaDay {
  const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const was = typeof s.day === "string" ? s.day : "";
  return was > next.day && dayNumber(was) !== null ? arenaDayFor(stored, was) : next;
}

/** The multiplier for the k-th paid answer (1-based) from one section on one day. */
export function decay(k: number): number {
  const i = Math.max(1, Math.floor(k)) - 1;
  return i < ARENA_DECAY.length ? ARENA_DECAY[i] : ARENA_DECAY_FLOOR;
}

/** The finishing bonus for the n-th run (1-based) of a day that earns one. */
export function finishBonus(n: number): number {
  return n <= ARENA_FINISH_FULL_PER_DAY ? ARENA_FINISH_XP : ARENA_FINISH_AFTER;
}

/** One answer that pays XP: its section and its usual XP (2, or 3 when the section was due,
    for a first try; 1 for a paid retry). */
export interface PaidAnswer {
  section: string;
  xp: number;
}

export interface Settled {
  /** the run's answers, after the decay, rounded once */
  answers: number;
  /** what they would have paid at the full rate */
  full: number;
  /** the finishing bonus paid (0 when the run did not earn one) */
  finish: number;
  /** the sections whose answers paid less than the full rate, in the order first met;
      empty when the rounded total is the full one */
  reduced: string[];
  /** true when the run earned the finishing bonus and was paid the reduced one */
  finishReduced: boolean;
  /** the day's counts after this run */
  day: ArenaDay;
}

/** Settle a run's XP against the day's counts. `earned` is true when the run earns the
    finishing bonus at all (game.js decides: finished, a right answer, a heart left). */
export function settleRun(paid: readonly PaidAnswer[], earned: boolean, before: ArenaDay): Settled {
  const day: ArenaDay = { day: before.day, sec: Object.assign({}, before.sec), finishes: before.finishes };
  let sum = 0, full = 0;
  const reduced: string[] = [];
  paid.forEach((a) => {
    const xp = Number(a.xp);
    if (!(xp > 0)) return;
    const id = String(a.section || "");
    const k = (day.sec[id] || 0) + 1;
    day.sec[id] = k;
    const f = decay(k);
    sum += xp * f;
    full += xp;
    if (f < 1 && reduced.indexOf(id) < 0) reduced.push(id);
  });
  let finish = 0;
  if (earned) {
    day.finishes += 1;
    finish = finishBonus(day.finishes);
  }
  const answers = Math.round(sum);
  /* rounding can make a reduced half point whole again: then nothing was reduced to say */
  return {
    answers, full, finish, reduced: answers < full ? reduced : [],
    finishReduced: earned && finish < ARENA_FINISH_XP, day
  };
}
