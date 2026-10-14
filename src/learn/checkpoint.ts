/* The checkpoint a section is due to write: its schedule folded through all but its newest
   SCHED_KEEP Arena days, so prune (src/sync/events.ts) can drop the entries behind it and
   the log stays bounded. Writing it changes no schedule: scheduleOf over the log with the
   checkpoint equals scheduleOf over the log without it, because the checkpoint holds the
   fold through day C and the entries left are exactly the days after C.

   The checkpoint reads no clock. C is a day that exists in the log, so a wrong clock cannot
   widen it beyond the entries there are. The id is a function of the payload, so two devices
   that write it from the same log write the same entry.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { checkpointId, CP_COUNT_MAX, type EventSet, type Payload } from "../sync/events.ts";
import { SCHED_KEEP } from "./constants.ts";
import { dayNumber } from "./recall.ts";
import { arenaDays, foldDays, startOf } from "./schedule.ts";

/** The checkpoint section `sec` is due to write, or null: null when the section has fewer
    than 2 × SCHED_KEEP distinct Arena days at or after S0. Never reads today's date. */
export function checkpoint(V: EventSet, sec: string): { id: string; P: Payload } | null {
  const days = arenaDays(V, sec), D = Array.from(days.keys());
  if (D.length < 2 * SCHED_KEEP) return null;
  const C = D[D.length - 1 - SCHED_KEEP];
  const { start, W } = startOf(V, sec);
  const { box, last } = foldDays(start, days, C);
  if (last === undefined) return null;
  const l = dayNumber(last);
  if (l === null) return null;
  let count = 0, right = 0;
  days.forEach((list, d) => {
    if (d > C) return;
    list.forEach((P) => { count++; if (P[6] === 1) right++; });
  });
  const wx: any = W ? W.P[10] : null;
  const x = {
    b: box, l, s: C + 1,
    n: Math.min(CP_COUNT_MAX, (wx ? wx.n : 0) + count),
    o: Math.min(CP_COUNT_MAX, (wx ? wx.o : 0) + right)
  };
  const P: Payload = [C * 1440, C, "cp", sec, "", "z", 0, 0, 0, 0, x];
  return { id: checkpointId(P), P };
}
