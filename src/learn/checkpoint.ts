/* The checkpoint a section is due to write: its schedule folded through all but its newest
   SCHED_KEEP Arena days, so prune (src/sync/events.ts) can drop the entries behind it and
   the log stays bounded. Writing it changes no schedule: scheduleOf over the log with the
   checkpoint equals scheduleOf over the log without it, because the checkpoint holds the
   fold through day C and the entries left are exactly the days after C.

   C is a day that exists in the log at or before today + SCHED_FUTURE_SLACK_DAYS: entries
   dated further ahead (a device with a wrong clock, or a hostile client) are left out of the
   choice, so they cannot fold into the start or let prune delete the present-day history.
   The id is a function of the payload, so two devices that write it from the same log and
   the same today write the same entry.

   Accepted cost (open question 1 of the design): a device offline across 12 or more
   practice days of a section, holding an unsynced miss older than another device's
   checkpoint, loses that miss to prune (d < S0); its box stays one step high until the next
   miss.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { checkpointId, CP_COUNT_MAX, isValid, type EventSet, type Payload } from "../sync/events.ts";
import { SCHED_FUTURE_SLACK_DAYS, SCHED_KEEP } from "./constants.ts";
import { dayNumber } from "./recall.ts";
import { arenaDays, foldDays, startOf } from "./schedule.ts";

/** The checkpoint section `sec` is due to write, or null: null when the section has fewer
    than 2 × SCHED_KEEP distinct Arena days at or after S0 and at or before today + 1, for
    the section "" and for a `today` that is not a day key. */
export function checkpoint(V: EventSet, sec: string, today: string): { id: string; P: Payload } | null {
  const t = dayNumber(today);
  if (sec === "" || t === null) return null;
  const limit = t + SCHED_FUTURE_SLACK_DAYS;
  const days = arenaDays(V, sec), D = Array.from(days.keys()).filter((d) => d <= limit);
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
  const id = checkpointId(P);
  return isValid(id, P) ? { id, P } : null;
}
