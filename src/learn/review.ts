/* A due review: which sections it asks about, and in what order.

   The Arena's `review` mode (arena.html?mode=review) serves only sections that are due today
   by the schedule in recall.ts, most overdue first. Every due section gets one question
   before any gets a second, so a review spreads over as many due sections as it can; at
   most REVIEW_PER_SECTION questions come from one section and REVIEW_MAX in all. The
   questions go round the sections in turn, so two in a row share a section only when one
   section is all there is.

   A due section the Arena has no generator for cannot be asked about there. It is listed
   apart ("due, on the page"), with a link to the section, and nothing here moves its box:
   only an answer counts as evidence, never a reader saying they reread it.

   Pure: no `window`, no DOM. assets/arena.js calls it through window.BMReview. */

import { REVIEW_MAX, REVIEW_PER_SECTION } from "./constants.ts";
import { byOverdue, type Placed } from "./recall.ts";

export interface DueRow extends Placed {
  /** due today (game.js deck(), by recall.ts dueOn) */
  due: boolean;
  /** the Arena can generate problems for it */
  arena: boolean;
}

/** Today's due sections, most overdue first, split into those the Arena can ask about and
    those only the chapter page can. */
export function dueSplit<T extends DueRow>(rows: readonly T[], day: string): { arena: T[]; page: T[] } {
  const due = byOverdue(rows.filter((r) => r.due), day);
  return { arena: due.filter((r) => r.arena), page: due.filter((r) => !r.arena) };
}

/** The sections of a review's questions, in the order they are asked, from the due
    sections the Arena can ask about, most overdue first: round after round, one question
    per section, until `max` questions or `per` rounds. */
export function planReview(ids: readonly string[], max: number = REVIEW_MAX, per: number = REVIEW_PER_SECTION): string[] {
  const seen = new Set<string>(), order: string[] = [];
  ids.forEach((id) => { if (!seen.has(id)) { seen.add(id); order.push(id); } });
  const out: string[] = [];
  for (let round = 0; round < per && out.length < max; round++) {
    for (const id of order) {
      if (out.length >= max) break;
      out.push(id);
    }
  }
  return out;
}

/** True when no two neighbours in `slots` share a section, or when that cannot be helped
    (a single section). For the tests, and as a statement of what planReview promises. */
export function interleaved(slots: readonly string[]): boolean {
  if (new Set(slots).size < 2) return true;
  return slots.every((id, i) => i === 0 || slots[i - 1] !== id);
}
