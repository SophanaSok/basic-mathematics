/* The Arena's spaced-review schedule, folded from the event log (src/sync/events.ts).

   A section's schedule is { box, last }, as recall.ts reads it. It starts from the section's
   winning checkpoint (its box and last day, good for every day before x.s) or from box 0
   never placed, and then folds the section's Arena entries (class "s") one distinct day at
   a time with recall.ts `place`: a day with any entry that was not right first time (ok = 0)
   is a miss, any other day a clean showing. One step a day equals one step a run, because
   BOX_DAYS[0] is at least a day: a second showing on a day is never due, so a clean one
   leaves box and clock alone, and a miss gives box 0 and last = that day either way.

   Entries dated more than SCHED_FUTURE_SLACK_DAYS past today are left out, so a device with
   its clock far ahead cannot push a section out of the schedule.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { classOf, ordered, winners, type EventSet, type Payload } from "../sync/events.ts";
import { SCHED_FUTURE_SLACK_DAYS } from "./constants.ts";
import { addDays, dayNumber, place } from "./recall.ts";

export interface Schedule { box: number; last: string | undefined }
/** What a caller folding many sections computes once: the winning checkpoints and the
    entries in order. */
export interface Pre { W: ReturnType<typeof winners>; list: ReturnType<typeof ordered> }
export function preOf(V: EventSet): Pre { return { W: winners(V), list: ordered(V) }; }

/** The day key of day number n (recall.ts dayNumber's inverse). */
export function dayKeyOf(n: number): string {
  return addDays("1970-01-01", n)!;
}

/** The Arena entries (classOf === "s") of `sec` in V with d at or after S0, S0 being the
    winning checkpoint's x.s, or -Infinity without one. Keys ascending. */
export function arenaDays(V: EventSet, sec: string, pre?: Pre): Map<number, Payload[]> {
  const W = (pre ? pre.W : winners(V))[sec];
  const s0 = W ? (W.P[10] as any).s as number : -Infinity;
  const byDay = new Map<number, Payload[]>();
  const add = (P: Payload) => {
    if (P[3] !== sec || classOf(P) !== "s" || P[1] < s0) return;
    const list = byDay.get(P[1]);
    if (list) list.push(P); else byDay.set(P[1], [P]);
  };
  if (pre) pre.list.forEach((e) => add(e.P)); else Object.keys(V).forEach((id) => add(V[id]));
  return new Map(Array.from(byDay.keys()).sort((a, b) => a - b).map((d) => [d, byDay.get(d)!] as [number, Payload[]]));
}

export function startOf(V: EventSet, sec: string, pre?: Pre): { start: Schedule; s0: number; W: { id: string; P: Payload } | null } {
  const W = (pre ? pre.W : winners(V))[sec] || null;
  if (!W) return { start: { box: 0, last: undefined }, s0: -Infinity, W: null };
  const x: any = W.P[10];
  return { start: { box: x.b, last: dayKeyOf(x.l) }, s0: x.s, W };
}

/** One placement per day, as scheduleOf and checkpoint both fold. */
export function foldDays(start: Schedule, days: Map<number, Payload[]>, upTo: number): Schedule {
  let state: Schedule = start;
  days.forEach((list, d) => {
    if (d > upTo) return;
    const r = place(state, list.some((P) => P[6] === 0), dayKeyOf(d));
    state = { box: r.box, last: typeof r.last === "string" ? r.last : undefined };
  });
  return state;
}

export function scheduleOf(V: EventSet, sec: string, today: string, pre?: Pre): Schedule {
  const { start } = startOf(V, sec, pre);
  const t = dayNumber(today);
  if (t === null) return start;
  return foldDays(start, arenaDays(V, sec, pre), t + SCHED_FUTURE_SLACK_DAYS);
}

const cache = new WeakMap<EventSet, Map<string, Record<string, Schedule>>>();

/** Every section with an Arena entry or a checkpoint (the section "" never), memoised by V's
    identity and today, deeply frozen. V must never be changed in place after a read: the
    cache keys on V's identity (mergeEvents and prune build new sets; a writer copies V
    before adding). */
export function scheduleAll(V: EventSet, today: string): Record<string, Schedule> {
  let byToday = cache.get(V);
  if (!byToday) { byToday = new Map(); cache.set(V, byToday); }
  const hit = byToday.get(today);
  if (hit) return hit;
  const secs = new Set<string>();
  Object.keys(V).forEach((id) => {
    const P = V[id], c = classOf(P);
    if ((c === "s" || c === "z") && P[3] !== "") secs.add(P[3]);
  });
  const pre = preOf(V);
  const out: Record<string, Schedule> = {};
  Array.from(secs).sort().forEach((sec) => { out[sec] = Object.freeze(scheduleOf(V, sec, today, pre)); });
  Object.freeze(out);
  byToday.set(today, out);
  return out;
}
