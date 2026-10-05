/* The shapes of what the site keeps in localStorage, as the scripts write them today.
   Types only: nothing imports this file yet, and it changes nothing at run time. It is
   the written-down contract the typed modules will be held to as each script is
   converted, and what tools/fixtures/state-v1.json is an instance of.

   Read off the writers, not designed:
     assets/site.js     Progress, Play, Attempts, Activity, the theme and `last`
     assets/lesson.js   the lesson store
     assets/game.js     the game, run and prefs stores (readGame, readRun, prefs, recordRun,
                        bankMedals)
     assets/arena.js    the run-store fields game.js carries through untouched
     assets/account.js  merge(): which stores sync, and how each field combines

   Every value is stored as JSON (so the theme is the string "\"dark\"", quotes included),
   and every reader tolerates a missing or malformed store, which is why so much below
   is optional. */

/** A chapter id from data/curriculum.js: "ch01" … "ch16", "interlude". */
export type ChapterId = string;
/** A section id inside its chapter: "one-unknown", "warmup", "practice". */
export type SectionId = string;
/** A section named from anywhere: "ch02#one-unknown". */
export type SectionRef = `${ChapterId}#${SectionId}`;
/** An exercise key: the element id, else "e<n>" (scored) or "i<n>" (inline) by position. */
export type ExerciseKey = string;
/** A local calendar day, "YYYY-MM-DD" (BMSite.dayKey). */
export type DayKey = string;
/** Milliseconds since the epoch (Date.now()). */
export type Timestamp = number;
/** Written as 1, never as true; absent means no. */
export type Flag = 1;

/* ---------------------------------------------------------------- site.js -- */

/** bm.theme */
export type Theme = "light" | "dark";

/** bm.progress.v1: which scored exercises are solved. Merge: union of solved, max of total. */
export type ProgressStore = Record<ChapterId, {
  solved: Record<ExerciseKey, true>;
  /** scored exercises on the page, rewritten on every visit to it */
  total: number;
}>;

/** bm.play.v1: figure missions and the opening-puzzle guess. Merge: union of done, max
    of total; guess is local-first. */
export type PlayStore = Record<ChapterId, {
  /** "<figure name>:<mission index>", e.g. "pythagoras:0" */
  done: Record<string, true>;
  /** missions on the page, rewritten on every visit to it */
  total?: number;
  /** index of the option picked on the opening puzzle */
  guess?: number;
}>;

/** One exercise's road to its first correct answer; frozen once `solved` is set. */
export interface AttemptRecord {
  /** checks made, wrong and right, up to and including the first correct one. Merge: max */
  tries?: number;
  /** the hint level the misses reached on a page view (1 after a first miss on an exercise
      with a hint, 2 after a second with a second hint). It was the hint shown automatically
      until the help ladder, and is still written so: struggle(), Second wind and the
      server's hint_level read it. Merge: max */
  hints?: 1 | 2;
  /** the highest clue opened while the exercise was unsolved (the help ladder: 1 data-hint,
      2 data-hint2, 3 data-hint3); never written once it is solved. Merge: the larger number,
      a number over anything that is not one */
  rung?: 1 | 2 | 3;
  /** the solution was opened before solving. Merge: either */
  opened?: Flag;
  /** an inline check ("Your turn", warm-up): graded, never scored. Merge: either */
  inline?: Flag;
  /** the section it tests: own chapter's ("angles") or another's ("ch02#one-unknown") */
  section?: SectionId | SectionRef;
  /** time of the first correct answer. Merge: the earlier */
  solved?: Timestamp;
  /** set with `solved`: 1 if that was the first check and the solution was not open.
      Merge: 1 only if every device that solved it says 1 */
  first?: 0 | 1;
  /** an inline check passed over in lesson mode; removed when solved */
  skipped?: Flag;
}

/** bm.attempts.v1 */
export type AttemptsStore = Record<ChapterId, Record<ExerciseKey, AttemptRecord>>;

/** bm.activity.v1: XP per day; streak, daily goal and total are derived from it.
    Merge: max per day; goal is local-first. */
export interface ActivityStore {
  days: Record<DayKey, number>;
  /** XP wanted per day, 5 to 500; 30 when absent */
  goal?: number;
}

/** bm.last: where the Continue button goes. Local-first. */
export type LastStore = { id: ChapterId; section: SectionId | null } | null;

/* -------------------------------------------------------------- lesson.js -- */

/** bm.lesson.v1. Merge: max of reached; mode is local-first. */
export interface LessonStore {
  /** how many steps of each chapter have been opened */
  reached: Record<ChapterId, number>;
  /** absent means "steps" */
  mode?: "steps" | "page";
}

/* ---------------------------------------------------------------- game.js -- */

/** An Arena run's kind (MODES in assets/arena.js). */
export type ArenaMode = "standard" | "daily" | "boss" | "repair";
/** 0 none, 1 Bronze, 2 Silver, 3 Gold. */
export type Medal = 0 | 1 | 2 | 3;

/** One section's place in the Arena's spaced review. */
export interface SectionRecall {
  /** Arena answers given on the section, and how many were right first time (ok <= n). Merge: max */
  n: number;
  ok: number;
  /** review box 0 to 4; due again after 1, 3, 7, 14, 30 days. Merge: taken with `last`
      from whichever side placed it later */
  box: number;
  /** the day the section was last placed in its box */
  last?: DayKey;
  /** when a Repair run last cleared the section's weak mark. Merge: max */
  fix?: Timestamp;
}

/** bm.game.v1: the synced game record. Every field merges so that order, grouping and
    repetition never matter (mergeGame in assets/account.js). */
export interface GameStore {
  /** achievement id -> when it was unlocked. Merge: union, earliest time */
  ach: Record<string, Timestamp>;
  /** solutions compared with a correct answer. Merge: union */
  cmp: Record<ChapterId, Record<ExerciseKey, Flag>>;
  sec: Record<SectionRef, SectionRecall>;
  /** best ranked run per mode. Merge: higher score, then more hearts, then earlier day */
  best: Partial<Record<ArenaMode, { score: number; hearts: number; day: DayKey }>>;
  /** medal per set, "<chapter>/practice" or "<chapter>/review": banked when the set is
      seen cleared, raised by a rematch. Merge: higher medal, then earlier day */
  enc: Record<string, { medal: Exclude<Medal, 0>; day: DayKey }>;
  /** days a Daily was played through; the latest 60 are kept. Merge: union */
  daily: Record<DayKey, Flag>;
  /** how often the combo meter filled. Merge: max */
  maxed: number;
}

/** bm.run.v1: this device's scratchpad. Never synced; emptied by a reset or a sign-out. */
export interface RunStore {
  combo: { pips: number; shield: boolean };
  /** what has already been announced, so a reload repeats nothing */
  seen: { level?: number; ach?: Flag };
  /** which exercises make up each set of a chapter this device has opened */
  sets: Record<ChapterId, { practice?: ExerciseKey[]; review?: ExerciseKey[]; inline: ExerciseKey[] }>;
  /** the Arena run in play, or the last one finished (assets/arena.js owns its shape) */
  arena: unknown;
  /** ids of the runs already paid, newest last, at most 30 */
  paid?: string[];
  /** sections picked by hand for the next run */
  picks?: Record<SectionRef, Flag>;
  /** today's Daily, once settled */
  daily?: { day: DayKey; score: number; firstTry: number; n: number; planned: number; ended: string };
}

/** bm.prefs.v1: this device only, never cleared. */
export interface PrefsStore {
  sound: boolean;
  calm: boolean;
  /** unset until the reader chooses: 3D, except on a low-end device */
  map?: "3d" | "list";
  tempo: "standard" | "extended" | "untimed";
}

/* ------------------------------------------------------------- everything -- */

/** localStorage key -> the parsed value stored under it. */
export interface StoredState {
  "bm.theme": Theme;
  "bm.progress.v1": ProgressStore;
  "bm.play.v1": PlayStore;
  "bm.attempts.v1": AttemptsStore;
  "bm.activity.v1": ActivityStore;
  "bm.lesson.v1": LessonStore;
  "bm.last": LastStore;
  "bm.game.v1": GameStore;
  "bm.run.v1": RunStore;
  "bm.prefs.v1": PrefsStore;
}

/** What an account carries between devices: the argument and result of BMAccount.merge.
    (The run store, the prefs and the theme stay on the device.) */
export interface SyncedState {
  progress: ProgressStore;
  play: PlayStore;
  attempts: AttemptsStore;
  activity: ActivityStore;
  lesson: LessonStore;
  last: LastStore;
  game: GameStore;
}
