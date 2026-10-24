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
  /* the placement check's takes: synced, and kept through a reset (decision 0003) */
  diag: "bm.diag.v1",
  /* Mochi's pool: synced (decision 0015) */
  pet: "bm.pet.v1",
  /* the game layer (assets/game.js): game is synced, run and prefs stay on this device */
  game: "bm.game.v1",
  run: "bm.run.v1",
  prefs: "bm.prefs.v1",
  /* the first-run guide: device-only, never synced, kept through a reset (U-6) */
  guide: "bm.guide.v1",
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
  | ({ type: "attempt"; correct: boolean; tryNo: number; hintLevel: number; solutionOpen: boolean; faded?: boolean; detector?: string | null } & ExerciseChange)
  /** the solution was opened; `ex` is the exercise's element */
  | ({ type: "opened"; solved: boolean; tries: number; ex: unknown } & ExerciseChange)
  /** a clue of the help ladder was opened */
  | ({ type: "ladder"; rung: number } & ExerciseChange)
  /** a near-transfer twin was checked; never an `attempt`, and the event log ignores it */
  | ({ type: "twin"; correct: boolean; paid: boolean; xp: number } & ExerciseChange)
  /** the stuck watch fired on an exercise (src/ui/ladder.ts), at most once per signal per exercise per page view */
  | { type: "stuck"; chapter: ChapterId; key: ExerciseKey; signal: "rapid" | "repeat" | "idle" | "misses"; offer: "clue" | "steps" | "solution" | "none" }
  /** an exercise was marked correct; `fresh` is true on its first solve, false on a re-check */
  | { type: "solved"; chapter: ChapterId; key: ExerciseKey; inline: boolean; fresh?: boolean }
  /** XP was added to today (BMActivity.add); bonus and mult when the combo added a share */
  | { type: "xp"; xp: number; why: string; goalMet: boolean; bonus?: number; mult?: number }
  /** every store was emptied */
  | { type: "reset" }
  /** an account merged another device's progress into this one */
  | { type: "sync" }
  /** another tab chose a different learner: this page is about to reload and must write nothing more */
  | { type: "stale" }
  | { type: "theme"; theme: string }
  /** the contents page drew its cards; `current` is the chapter to continue */
  | { type: "home"; current: ChapterId | null }
  | { type: "combo"; pips: number; shield: boolean; mult: number; why: string }
  | { type: "prefs"; prefs: Record<string, unknown> }
  /** the Arena: a run started, an answer given, a run ended or was recorded. `phase: "recorded"` carries
      `mode`, `xp`, `medal`, `set` (the medal set id `<boss>/practice`, undefined when the run was not a boss
      fight), `day` (the run's day key) and `due: string[]` (section ids answered right first try while due,
      sorted, no duplicates) */
  | { type: "arena"; phase: "start" | "answer" | "end" | "recorded"; [field: string]: unknown }
  /** the event log changed; `n` is its size, `sec` the section just recorded (absent when absorbed or pruned) */
  | { type: "event"; n: number; sec?: string }
  /** a solution was compared after a correct answer; `fresh` is true the first time for that exercise */
  | { type: "compare"; chapter: ChapterId; key: ExerciseKey; fresh: boolean }
  /** a mission was marked done; `fresh` is true on its first completion */
  | { type: "mission"; chapter: ChapterId; key: string; fresh: boolean }
  /** the pet changed: an earn (src/ui/pet-earns.ts), a care act or the daily gift (src/ui/pet/actions.ts); the shop (src/ui/pet/shop.ts) emits buy, care and wear; grew comes with X-8 */
  | { type: "pet"; what: "earn" | "care" | "buy" | "wear" | "grew" | "gift"; id?: string }
  | { type: "chapterDone"; chapter: ChapterId | null; fresh: boolean }
  | { type: "achievement"; id: string; title: string }
  | { type: "level"; level: number; rank: string }
  /** a practice or review set's boss changed (assets/encounter.js) */
  | { type: "encounter"; chapter: ChapterId; set: string; hp: number; total: number; hearts: number; medal: number; state: string; cue: unknown; fresh: boolean };
