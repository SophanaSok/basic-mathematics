/* Which section to send a learner back to. The encounter's Regroup advice and the
   change-approach card on an exercise name it the same way: the section behind most of
   the misses. Pure: no window, no DOM, no storage. */

import { APPROACH_MISSES_AFTER_LADDER } from "./constants.ts";

export interface MissItem { sec: string; miss: boolean }

/** The section behind most misses: count misses per non-empty sec; the most wins; a tie goes to
    the section whose first miss came first in `items` order; null when there is no miss with a sec. */
export function mostMissed(items: ReadonlyArray<MissItem>): string | null {
  const tally: Record<string, number> = Object.create(null);
  const order: string[] = [];
  for (const it of items) {
    if (!it || !it.miss || !it.sec) continue;
    if (!tally[it.sec]) { tally[it.sec] = 0; order.push(it.sec); }
    tally[it.sec]++;
  }
  let best: string | null = null;
  for (const s of order) if (best === null || tally[s]! > tally[best]!) best = s;
  return best;
}

/** true once the wrong checks made after the ladder ran out reach APPROACH_MISSES_AFTER_LADDER */
export function approachDue(missesAfterLadder: number): boolean {
  return missesAfterLadder >= APPROACH_MISSES_AFTER_LADDER;
}
