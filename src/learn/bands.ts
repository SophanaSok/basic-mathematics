/* A section's mastery as one of four bands, for the learner's own view only.

   Pure: no window, no document, no storage of any kind (tools/check-static.js `pure-core`). */

import { classOf, type EventSet } from "../sync/events.ts";
import { MASTERY_MIN_EVIDENCE, MASTERY_STRONG, MASTERY_WEAK } from "./constants.ts";
import { masteryOf, type Mastery } from "./mastery.ts";

export type Band = "none" | "weak" | "building" | "strong";

/** none when c < MASTERY_MIN_EVIDENCE; weak when m < MASTERY_WEAK; building when m < MASTERY_STRONG; else strong. */
export function bandFor(m: Mastery): Band {
  if (m.c < MASTERY_MIN_EVIDENCE) return "none";
  if (m.m < MASTERY_WEAK) return "weak";
  if (m.m < MASTERY_STRONG) return "building";
  return "strong";
}

export function bandOf(V: EventSet, sec: string): Band {
  return bandFor(masteryOf(V, sec));
}

const cache = new WeakMap<EventSet, Record<string, Band>>();

/** Every section with any entry (evidence or a checkpoint), memoised by V's identity, frozen. */
export function bandsAll(V: EventSet): Record<string, Band> {
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
  const out: Record<string, Band> = {};
  Array.from(secs).sort().forEach((sec) => { out[sec] = bandOf(V, sec); });
  Object.freeze(out);
  cache.set(V, out);
  return out;
}
