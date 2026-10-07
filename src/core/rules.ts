/* The exercise rules: what a right answer pays, how an exercise's record changes on the
   road to its first correct answer, how hard it was for the reader, and how a practice
   set's misses become hearts and a medal. The one copy, for assets/site.js and
   assets/game.js (through window.BMCore.rules, src/ui/core.ts) and the tests.

   Moved from assets/site.js (XP, struggle, the pay rules and Road) and assets/game.js
   (isMiss, medalMark, setStats) as they were; tools/game/rules.test.js runs every road
   through them. Pure: no `window`, no DOM, no storage. setStats is handed the stores it
   reads (game.js passes its own). */

import type { AttemptsStore, ChapterId, ExerciseKey, ProgressStore } from "../types/state.ts";

/* XP per day. The streak, the daily goal and the total are all derived from this one
   map, so two devices merge by taking the larger number for each day. */
export const XP = { first: 10, solved: 6, opened: 3, inlineFirst: 5, inline: 3, inlineOpened: 1, mission: 5 };

/* How hard one exercise was for this reader, from 0 (right first time) to 1.
   null when there is nothing to go on. */
export function struggle(rec: any): number | null {
  if (!rec || (!rec.tries && !rec.opened && !rec.skipped)) return null;
  var s;
  if (rec.solved) s = rec.first ? 0 : Math.min(0.8, 0.35 + 0.15 * Math.max(0, (rec.tries || 2) - 2));
  else s = rec.tries ? 0.7 : 0.45;
  if (rec.opened) s += 0.25;
  if ((rec.hints || 0) >= 2) s += 0.1;
  return Math.min(1, s);
}

export const WEAK = 0.34, STRONG = 0.12;

/* A clue is never charged, and no help pays more than effort. A right first check pays the
   first-time rate (and lights a combo pip, assets/game.js bonus) when no clue or only
   the first was opened before it: clue 1 says where to look and gives nothing away.
   After clue 2 or 3 it pays what a solve after a miss pays, and the combo neither
   gains nor loses. The record's `first` keeps its meaning (right on the first check,
   solution not open), since the struggle score and the achievements read it. */
export const CLUE_FREE = 1;
export function paysFirst(rec: any): boolean {
  var rung = Number(rec && rec.rung);
  return !!(rec && rec.first && !rec.opened) && !(isFinite(rung) && rung > CLUE_FREE);
}
export function xpFor(rec: any, inline?: unknown): number {
  if (rec.opened) return inline ? XP.inlineOpened : XP.opened;
  if (paysFirst(rec)) return inline ? XP.inlineFirst : XP.first;
  return inline ? XP.inline : XP.solved;
}

/* The faded worked solution, one rung past the three clues (the help ladder's rung 4).
   No page writes it yet; an exercise solved after it is not right first time. */
export const FADED_RUNG = 4;
export function fadedOf(rec: any): boolean {
  var rung = Number(rec && rec.rung);
  return isFinite(rung) && rung >= FADED_RUNG;
}

/* How one exercise's record changes on the road to its first correct answer, as pure
   functions of the record, so the rules can be held to on their own
   (tools/game/rules.test.js runs every road through them). initExercises applies them
   through Attempts.update, only while the exercise is unsolved. */
export const Road = {
  /* a check, right or wrong; `level` is the hint level the misses reached (`hints`) */
  check: function (a: any, ok: unknown, level: number, inline?: unknown, section?: string | null) {
    a.tries = (a.tries || 0) + 1;
    if (section) a.section = section;
    if (inline) a.inline = 1;
    if (level > (a.hints || 0)) a.hints = level;
    if (ok) {
      a.solved = Date.now();
      a.first = a.tries === 1 && !a.opened ? 1 : 0;
      delete a.skipped;
    }
    return a;
  },
  /* the solution opened before solving */
  reveal: function (a: any, inline?: unknown, section?: string | null) {
    a.opened = 1;
    if (section) a.section = section;
    if (inline) a.inline = 1;
    return a;
  },
  /* clue `rung` opened before solving: the highest is kept */
  clue: function (a: any, rung: number, inline?: unknown, section?: string | null) {
    var was = Number(a.rung);
    if (!(isFinite(was) && was >= rung)) a.rung = rung;
    if (section) a.section = section;
    if (inline) a.inline = 1;
    return a;
  }
};

function obj(x: any): any { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
function num(x: unknown): number { x = Number(x); return isFinite(x as number) ? x as number : 0; }

/* A miss is a wrong check on the road to the first correct answer: solved after one,
   or tried and not solved yet. Asking for help is not a miss: a clue or the solution
   opened never costs a heart. */
export function isMiss(rec: unknown): boolean {
  var r = obj(rec);
  return r.solved ? num(r.tries) > 1 : num(r.tries) > 0;
}
/* What the medal counts against a set: a miss, or an exercise solved without being
   right first time some other way (the solution was open). So reading the solution
   and then answering can never earn a better medal than missing and then solving:
   both count once. For a solved record this is exactly "not right first time", the
   rule medals were always earned by, so no medal a cleared set showed before changes. */
export function medalMark(rec: unknown): boolean {
  var r = obj(rec);
  return isMiss(r) || !!(r.solved && (r.opened || !r.first));
}

/** The stores setStats reads: game.js's stores() has these and more. Each is read as
    whatever it holds, a damaged one too, so each is `unknown`; whole, they are a
    {@link ProgressStore} and an {@link AttemptsStore}. */
export interface SetStores {
  progress?: unknown;
  attempts?: unknown;
}

/** How one set stands (setStats). */
export interface SetStats {
  total: number; solved: number; first: number; misses: number; marks: number;
  /** per key, in order: "first", "opened", "solved", "unknown" (solved, no record) or "open" */
  how: string[];
  lastSolved: number; tried: number;
  /** unsolved exercises left */
  hp: number;
  hearts: number;
  won: boolean;
  /** 0 until won, then 1 to 3 */
  medal: number;
}

/* How one practice or review set stands: health is what is left unsolved, hearts are
   three less the misses (wrong checks only), and the medal, earned only once the set
   is cleared, is three less the misses and solutions opened before solving. */
export function setStats(S: SetStores, chapterId: ChapterId, keys?: ExerciseKey[] | null): SetStats {
  keys = keys || [];
  var solvedMap = obj(obj(obj(obj(S).progress)[chapterId]).solved);
  var recs = obj(obj(obj(S).attempts)[chapterId]);
  var out: SetStats = { total: keys.length, solved: 0, first: 0, misses: 0, marks: 0, how: [], lastSolved: 0, tried: 0, hp: 0, hearts: 0, won: false, medal: 0 };
  keys.forEach(function (k) {
    var rec = obj(recs[k]), how = "open";
    if (solvedMap[k]) {
      out.solved++;
      how = rec.solved ? (rec.first ? "first" : rec.opened ? "opened" : "solved") : "unknown";
      if (rec.solved && rec.first) out.first++;
      if (num(rec.solved) > out.lastSolved) out.lastSolved = num(rec.solved);
    }
    if (isMiss(rec)) out.misses++;
    if (medalMark(rec)) out.marks++;
    if (rec.tries || rec.opened || solvedMap[k]) out.tried++;
    out.how.push(how);
  });
  out.hp = out.total - out.solved;
  out.hearts = Math.max(0, 3 - out.misses);
  out.won = out.total > 0 && out.solved >= out.total;
  var kept = Math.max(0, 3 - out.marks);
  out.medal = out.won ? (kept >= 3 ? 3 : kept >= 1 ? 2 : 1) : 0;
  return out;
}
