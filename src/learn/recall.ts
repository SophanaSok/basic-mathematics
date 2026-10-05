/* The Arena's spaced review of a section: when it is due, and where an Arena showing puts it.

   A section's record is bm.game.v1.sec[<chapter>#<section>] = { n, ok, box, last, fix }
   (src/types/state.ts SectionRecall). `box` is 0 to 4 and `last` the local day (YYYY-MM-DD)
   it was last placed. The rule is the one assets/game.js has kept since the Arena began, and
   this is now its only copy: game.js (the deck, recordRun) and the Arena's fallback for a page
   without the game layer (assets/arena.js) both call it through window.BMReview.

     due      at least BOX_DAYS[box] days since `last`; a section never placed is due at once
     placed   a miss sends it to box 0 and restarts its clock; a clean showing moves it up one
              box only once it is due, and an early one leaves box and clock alone, so daily
              cramming does not fake spacing

   Days are local day keys, compared as calendar days (UTC arithmetic on the key itself, so a
   daylight-saving change never makes a day 23 or 25 hours long). Nothing here writes to
   `window` or touches the DOM. */

import { BOX_DAYS } from "./constants.ts";

/** The parts of a section's record the schedule reads. Anything else is ignored here and
    carried by whoever writes the record. */
export interface Recall {
  box?: unknown;
  last?: unknown;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A day key as a whole number of days, or null for anything that is not one. */
export function dayNumber(key: unknown): number | null {
  const m = DAY.exec(String(key ?? ""));
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

/** The day key `n` days after `key` (n may be negative); null when `key` is not a day. */
export function addDays(key: string, n: number): string | null {
  const d = dayNumber(key);
  if (d === null) return null;
  const at = new Date((d + n) * 86_400_000);
  const two = (v: number) => (v < 10 ? "0" : "") + v;
  return at.getUTCFullYear() + "-" + two(at.getUTCMonth() + 1) + "-" + two(at.getUTCDate());
}

function rec(sec: unknown): Recall {
  return sec && typeof sec === "object" && !Array.isArray(sec) ? (sec as Recall) : {};
}

/** The box a record holds, as the schedule reads it: a whole number 0..4. */
export function boxOf(sec: unknown): number {
  const n = Number(rec(sec).box);
  return Math.max(0, Math.min(BOX_DAYS.length - 1, Math.floor(isFinite(n) ? n : 0)));
}

/** Due on `day`: at least the box's interval since the section was last placed. A section
    never placed (or a day that cannot be read) is due. */
export function dueOn(sec: unknown, day: string): boolean {
  const last = dayNumber(rec(sec).last), now = dayNumber(day);
  if (last === null || now === null) return true;
  return now - last >= BOX_DAYS[boxOf(sec)];
}

/** The day a placed section comes due, or null for one never placed. */
export function dueDate(sec: unknown): string | null {
  const last = rec(sec).last;
  if (dayNumber(last) === null) return null;
  return addDays(String(last), BOX_DAYS[boxOf(sec)]);
}

/** Days past its due date on `day` (0 on the day it falls due, negative before), or null
    for a section never placed. */
export function overdue(sec: unknown, day: string): number | null {
  const last = dayNumber(rec(sec).last), now = dayNumber(day);
  if (last === null || now === null) return null;
  return now - last - BOX_DAYS[boxOf(sec)];
}

/** Where an Arena showing on `day` leaves a section: `missed` is true when any answer on it
    was not right first time. `last` is unchanged (and may be absent) when the box is. */
export function place(sec: unknown, missed: boolean, day: string): { box: number; last: unknown } {
  const due = dueOn(sec, day);
  let box = boxOf(sec);
  if (missed) box = 0;
  else if (due) box = Math.min(BOX_DAYS.length - 1, box + 1);
  return { box, last: missed || due ? day : rec(sec).last };
}

export interface Placed {
  id: string;
  box?: unknown;
  last?: unknown;
  /** reading order in the course, for ties; the id breaks any that remain */
  index?: number;
}

/** Most overdue first: sections placed before, by days past due (most first), then the
    sections never placed, which have no schedule yet to be behind; ties in reading order. */
export function byOverdue<T extends Placed>(rows: readonly T[], day: string): T[] {
  const late = (r: T) => overdue(r, day);
  const order = (a: T, b: T) => (a.index ?? 0) - (b.index ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return rows.slice().sort((a, b) => {
    const x = late(a), y = late(b);
    if (x === null && y === null) return order(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || order(a, b);
  });
}

/** Of the sections not due on `day`, the one that comes due first, and when; null when
    every section is due or none has been placed. */
export function nextDue<T extends Placed>(rows: readonly T[], day: string): { id: string; day: string } | null {
  let best: { id: string; day: string } | null = null;
  for (const r of rows) {
    if (dueOn(r, day)) continue;
    const d = dueDate(r);
    if (d && (!best || d < best.day || (d === best.day && r.id < best.id))) best = { id: r.id, day: d };
  }
  return best;
}
