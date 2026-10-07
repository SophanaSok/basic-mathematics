/* The names of the stores in localStorage, and what is announced on the bus (BMStore.emit,
   assets/site.js) when one of them changes. Read off the scripts as they are: site.js's
   Store.keys and every Store.emit in assets/. Types and constants only; nothing here
   reads or writes storage. The shapes of the stores themselves are src/types/state.ts's. */

import type { ChapterId, ExerciseKey, SectionId, SectionRef } from "../types/state.ts";

/** Every key the site keeps in localStorage, by the name the scripts use for it. */
export const STORE_KEYS = {
  theme: "bm.theme",
  progress: "bm.progress.v1",
  play: "bm.play.v1",
  last: "bm.last",
  attempts: "bm.attempts.v1",
  activity: "bm.activity.v1",
  lesson: "bm.lesson.v1",
  /* the game layer (assets/game.js): game is synced, run and prefs stay on this device */
  game: "bm.game.v1",
  run: "bm.run.v1",
  prefs: "bm.prefs.v1",
  /* assets/account.js: what was last synced, and what waits to be sent */
  sync: "bm.sync.v1",
  syncPending: "bm.sync.pending.v1"
} as const;

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];

/** Where an exercise's change came from, as site.js announces it. */
interface ExerciseChange {
  chapter: ChapterId;
  key: ExerciseKey;
  section: SectionId | SectionRef | "";
  inline: boolean;
}

/** One change announced on the bus. Listeners switch on `type`; a field a listener does
    not know is ignored, so a later version may add fields. */
export type StoreChange =
  /** a store was written (BMStore.write, unless silent) */
  | { type: "state"; key: string }
  /** a check, right or wrong (site.js check) */
  | ({ type: "attempt"; correct: boolean; tryNo: number; hintLevel: number; solutionOpen: boolean } & ExerciseChange)
  /** the solution was opened; `ex` is the exercise's element */
  | ({ type: "opened"; solved: boolean; tries: number; ex: unknown } & ExerciseChange)
  /** a clue of the help ladder was opened */
  | ({ type: "ladder"; rung: number } & ExerciseChange)
  /** an exercise was solved for the first time */
  | { type: "solved"; chapter: ChapterId; key: ExerciseKey; inline: boolean }
  /** XP was added to today (BMActivity.add); bonus and mult when the combo added a share */
  | { type: "xp"; xp: number; why: string; goalMet: boolean; bonus?: number; mult?: number }
  /** every store was emptied */
  | { type: "reset" }
  /** an account merged another device's progress into this one */
  | { type: "sync" }
  | { type: "theme"; theme: string }
  /** the contents page drew its cards; `current` is the chapter to continue */
  | { type: "home"; current: ChapterId | null }
  | { type: "combo"; pips: number; shield: boolean; mult: number; why: string }
  | { type: "prefs"; prefs: Record<string, unknown> }
  /** the Arena: a run started, an answer given, a run ended or was recorded */
  | { type: "arena"; phase: "start" | "answer" | "end" | "recorded"; [field: string]: unknown }
  | { type: "chapterDone"; chapter: ChapterId | null; fresh: boolean }
  | { type: "achievement"; id: string; title: string }
  | { type: "level"; level: number; rank: string }
  /** a practice or review set's boss changed (assets/encounter.js) */
  | { type: "encounter"; chapter: ChapterId; set: string; hp: number; total: number; hearts: number; medal: number; state: string; cue: unknown; fresh: boolean };
