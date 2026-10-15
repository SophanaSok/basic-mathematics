/* Mastery of a section, derived from the event log (src/sync/events.ts).

   Mastery is a function of the stored set, so two devices holding the same merged set
   agree. It steers only the learner's own view (which sections look weak, deck order, the
   support level later); no reward reads it (r2-design.md section 3.12). Page evidence
   survives prune (prune keeps a ref's earliest check that was right and its earliest
   solution opened, which holds because a ref belongs to one section: a ref carrying two
   sections is grouped by ref alone in prune and one section's item may go); Arena evidence is read from what the pruned set holds, by design.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { classOf, ordered, type EventSet, type Payload } from "../sync/events.ts";
import {
  MASTERY_ALPHA, MASTERY_MIN_EVIDENCE, MASTERY_PRIOR, OPENED_CREDIT, RETRY_CREDIT,
  RUNG_CREDIT, SEED_WEIGHT, TRY_CREDIT
} from "./constants.ts";
import { preOf, startOf, type Pre } from "./schedule.ts";

export interface Mastery { m: number; c: number }
export interface Evidence { id: string; P: Payload; credit: number }

/** The credit one entry gives, always in [0, 1]:
    k = "c": TRY_CREDIT[min(max(n, 1) - 1, 3)] * RUNG_CREDIT[min(r, 3)]  (r = 4, faded, uses index 3)
    k = "o": OPENED_CREDIT
    k = "a": 1 when ok === 1, RETRY_CREDIT when n === 2, else 0
    anything else: 0 */
export function creditOf(P: Payload): number {
  const k = P[5];
  if (k === "c") return TRY_CREDIT[Math.min(Math.max(P[7], 1) - 1, 3)] * RUNG_CREDIT[Math.min(P[8], 3)];
  if (k === "o") return OPENED_CREDIT;
  if (k === "a") return P[6] === 1 ? 1 : P[7] === 2 ? RETRY_CREDIT : 0;
  return 0;
}

/** The evidence for `sec`, in (t asc, id asc) order:
    (a) for each non-empty `ref` among the p-class entries of `sec`, the earliest entry with
        (k === "c" && ok === 1) or k === "o"; one item per ref;
    (b) every s-class entry of `sec` with d >= S0 (startOf's s0).
    In fold order: by day, and within a day the page items (which carry their minute) before
    the Arena answers (stamped at the day's first minute, format 1), then (t, id). So a run
    played after the day's page work, a Repair in particular, is the day's latest evidence. */
export function evidenceOf(V: EventSet, sec: string, pre?: Pre): Evidence[] {
  const { s0 } = startOf(V, sec, pre);
  const seen: Record<string, boolean> = Object.create(null);
  const out: Evidence[] = [];
  (pre ? pre.list : ordered(V)).forEach(({ id, P }) => {
    if (P[3] !== sec) return;
    const cls = classOf(P);
    if (cls === "s") {
      if (P[1] >= s0) out.push({ id, P, credit: creditOf(P) });
    } else if (cls === "p") {
      const ref = P[4];
      if (ref === "" || seen[ref]) return;
      if ((P[5] === "c" && P[6] === 1) || P[5] === "o") {
        seen[ref] = true;
        out.push({ id, P, credit: creditOf(P) });
      }
    }
  });
  return out.sort((a, b) => (a.P[1] - b.P[1]) || (rank(a.P) - rank(b.P)) || (a.P[0] - b.P[0]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
const rank = (P: Payload): number => (classOf(P) === "s" ? 1 : 0);

/** Prior, then the fold over the evidence in order. */
export function masteryOf(V: EventSet, sec: string, pre?: Pre): Mastery {
  const { W } = startOf(V, sec, pre);
  let m = MASTERY_PRIOR, c = 0;
  if (W) {
    const x: any = W.P[10];
    m = (MASTERY_PRIOR * SEED_WEIGHT + x.o) / (SEED_WEIGHT + x.n);
    c = Math.min(x.n, MASTERY_MIN_EVIDENCE);
  }
  evidenceOf(V, sec, pre).forEach((e) => {
    m = m + MASTERY_ALPHA * (e.credit - m);
    c = c + 1;
  });
  return { m, c };
}

const cache = new WeakMap<EventSet, Record<string, Mastery>>();

/** Every section with evidence or a checkpoint (never the section ""), one preOf for all,
    memoised by V's identity and frozen. V must never be changed in place after a read: the
    cache keys on V's identity (mergeEvents and prune build new sets; a writer copies V
    before adding). */
export function masteriesAll(V: EventSet): Record<string, Mastery> {
  const hit = cache.get(V);
  if (hit) return hit;
  const secs = new Set<string>();
  Object.keys(V).forEach((id) => {
    const P = V[id];
    if (P[3] === "") return;
    const c = classOf(P);
    if (c === "p" && P[4] === "") return;
    if (c === "p" && !((P[5] === "c" && P[6] === 1) || P[5] === "o")) return;
    secs.add(P[3]);
  });
  const pre = preOf(V);
  const out: Record<string, Mastery> = {};
  Array.from(secs).sort().forEach((sec) => { out[sec] = Object.freeze(masteryOf(V, sec, pre)); });
  Object.freeze(out);
  cache.set(V, out);
  return out;
}
