/* A patch of seeds ({box, last} per section, the placement check's) as checkpoint entries for
   the event log: each becomes one content-addressed "z" entry (no device, so two devices
   agree on its id) that the schedule folds like any checkpoint (src/learn/schedule.ts).

   Guards, because a seed never merges with history (its window start s = l + 1 makes prune
   drop every Arena entry of the section dated at or before l): a seed is for a section the log
   has nothing about (`taken` holds the sections with any entry), and its day is before today,
   so a miss made today is never erased. Anything damaged is skipped, never thrown.

   A leaf module on purpose: src/ui/events.ts is in every page's bundle, so this must not pull
   in diagnostic.ts or the skills record. Pure: no window, no document, no storage of any kind
   (tools/check-static.js `pure-core`). */

import { BOX_MAX, checkpointId, isValid, type EventSet, type Payload } from "../sync/events.ts";
import { addDays, dayNumber } from "./recall.ts";

const plain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): unknown => Object.hasOwn(o, k) ? o[k] : undefined;

export function seedEntries(patch: unknown, today: string, taken?: ReadonlySet<string>): EventSet {
  const out: EventSet = {};
  const t = dayNumber(today);
  if (!plain(patch) || t === null) return out;
  Object.keys(patch).forEach((sec) => {
    try {
      if (taken && taken.has(sec)) return;
      const rec = own(patch, sec);
      if (!plain(rec)) return;
      const box = own(rec, "box"), last = own(rec, "last");
      /* dayNumber rolls 2026-13-40 over to a later day, so the key must read back as itself */
      const l = typeof last === "string" && addDays(last, 0) === last ? dayNumber(last) : null;
      if (!Number.isInteger(box) || (box as number) < 0 || (box as number) > BOX_MAX || l === null || l >= t) return;
      const P: Payload = [l * 1440, l, "cp", sec, "", "z", 0, 0, 0, 0, { b: box as number, l, s: l + 1, n: 0, o: 0 }];
      const id = checkpointId(P);
      if (isValid(id, P)) out[id] = P;
    } catch (e) { /* a damaged seed is skipped */ }
  });
  return out;
}
