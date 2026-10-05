/* What the site's scripts reach through window.BMReview: the spaced-review schedule
   (src/learn/recall.ts), the due review's plan (review.ts), the Arena's XP against farming
   (practice.ts), and the list of sections the Arena can ask about (src/data/arena-sections.ts).

   assets/game.js and assets/arena.js are scripts that cannot import a module (tools run
   them in a vm, as they are), so every entry that loads game.js imports this file first,
   and they find it on window. One copy of each rule: game.js's deck and recordRun and the
   Arena's fallback for a page without the game layer call the same functions. The modules
   under src/learn/ write nothing to window; this file and src/ui/ladder.ts are where the
   page gets them. */

import { ARENA_DECAY, ARENA_DECAY_FLOOR, ARENA_FINISH_AFTER, ARENA_FINISH_FULL_PER_DAY, ARENA_FINISH_XP, BOX_DAYS, NEXT_MAX_ITEMS, REVIEW_MAX, REVIEW_PER_SECTION } from "../learn/constants.ts";
import { addDays, boxOf, byOverdue, checkDate, checkDue, dayNumber, dueDate, dueOn, isPlaced, nextDue, overdue, place } from "../learn/recall.ts";
import { dueSplit, interleaved, planReview } from "../learn/review.ts";
import { arenaDayFor, decay, finishBonus, settleRun, toStore } from "../learn/practice.ts";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";

export const api = {
  recall: { dueOn, place, dueDate, overdue, byOverdue, nextDue, boxOf, dayNumber, addDays, checkDue, checkDate, isPlaced },
  review: { dueSplit, planReview, interleaved },
  practice: { arenaDayFor, toStore, settleRun, decay, finishBonus },
  ARENA_SECTIONS,
  constants: { BOX_DAYS, REVIEW_MAX, REVIEW_PER_SECTION, ARENA_DECAY, ARENA_DECAY_FLOOR, ARENA_FINISH_XP, ARENA_FINISH_FULL_PER_DAY, ARENA_FINISH_AFTER, NEXT_MAX_ITEMS }
};

if (typeof window !== "undefined") window.BMReview = api;
