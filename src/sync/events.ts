/* The event log (bm.events.v1 = { v, ev: { [id]: P } }): one entry per learner action,
   keyed by an id that carries its own hash, so a copy of the log from any device merges
   into any other by union. This module is format 1: the entry shape, which entries are
   valid, the ids, the prune that bounds the log, and the merge. Format 1 is frozen once
   this merges: any change to a constant, a rule or a keep predicate bumps FORMAT (and the
   hash of FORMAT_TABLE pinned in events.test.ts moves with it).

   Why prune commutes with union. For sets of valid entries with distinct ids,
   prune(prune(X) u Y) = prune(X u Y). Every keep predicate is anti-monotone in the set:
   adding entries can only turn keep into drop, never drop into keep (the before-counts and
   after-counts only grow, an "earliest" only moves earlier, and a section's winning
   checkpoint only moves up). And every drop is witnessed by entries that are themselves
   kept (the EV_PAGE_HEAD predecessors, the earliest check that was right, the earliest
   solution opened, the two before and the two after, the earliest wrong answer, the
   winning checkpoint). So pruning first removes nothing that would have changed any later
   decision. With that, the merge is a union followed by one prune, and so commutative,
   associative and idempotent. Two valid payloads under one id are resolved by the greater
   canon before the prune; that is the user's own data and is not claimed to be lawful.

   Pure: no window, no document, no storage of any kind (tools/check-static.js
   `pure-core` enforces it). */

import { at, canon, carryOver, keysOf, later, num, obj, plain } from "./json.ts";

export const FORMAT = 1;
export const EV_PAGE_HEAD = 8, EV_DAY_HEAD = 2, EV_DAY_TAIL = 2;
export const T_MIN = 27_000_000, T_MAX = 60_000_000;
export const D_MIN = 18_000, D_MAX = 42_000;
export const N_MAX = 999, R_MAX = 9, F_MAX = 65_535, X_CANON_MAX = 256, CP_COUNT_MAX = 1_000_000, BOX_MAX = 4;
export const CHECKPOINT_DEV = "00000000";
export const ID_RE = /^[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{7}$/;
export const SRC_RE = /^[a-z]{1,3}$/, KIND_RE = /^[a-z]$/, REF_RE = /^[a-z0-9:#\/-]{0,90}$/;
/* every constant above, so a test can hash it */
export const FORMAT_TABLE = {
  FORMAT, EV_PAGE_HEAD, EV_DAY_HEAD, EV_DAY_TAIL, T_MIN, T_MAX, D_MIN, D_MAX,
  N_MAX, R_MAX, F_MAX, X_CANON_MAX, CP_COUNT_MAX, BOX_MAX, CHECKPOINT_DEV,
  ID_RE: ID_RE.source, SRC_RE: SRC_RE.source, KIND_RE: KIND_RE.source, REF_RE: REF_RE.source
};

/* t whole UTC minute, d day number, src (ex page exercise, in inline check, ar Arena
   answer, cp checkpoint; others valid), sec section ref like ch02#one-unknown or "", ref
   item ref like ch02/e3, g:<generator id> or "", k kind (c check, o solution opened while
   unsolved, h clue opened, s skipped, a one Arena answer, z checkpoint; others valid), ok
   0/1, n 0..999, r 0..9, f bit flags 0..65535, x optional plain object, required for
   k = "z" as { b, l, s, n, o } */
export type Payload = [t: number, d: number, src: string, sec: string, ref: string, k: string, ok: number, n: number, r: number, f: number, x?: Record<string, unknown>];
/* what bm.events.v1 may hold, damaged shapes included */
export interface EventsStore { v?: unknown; ev?: unknown; [k: string]: unknown }
/* valid entries only, keyed by id */
export type EventSet = Record<string, Payload>;

/* ---------------------------------------------------------- hashes, ids -- */

export function fnv1a32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function base36(n: number, width: number): string {
  const s = n.toString(36);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}
export function hashOf(P: Payload): string { return base36(fnv1a32(canon(P)), 7); }
export function checkpointRand(P: Payload): string { return base36(fnv1a32("z|" + canon(P)), 8); }
export function randomRand(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const c: any = (globalThis as any).crypto;
  let out = "";
  if (c && typeof c.getRandomValues === "function") {
    const bytes: Uint8Array = c.getRandomValues(new Uint8Array(8));
    for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % 36];
  } else {
    for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * 36)];
  }
  return out;
}
/* does not validate dev */
export function eventId(dev: string, P: Payload, rand?: string): string {
  return dev + "-" + (rand ?? randomRand()) + "-" + hashOf(P);
}
export function checkpointId(P: Payload): string { return CHECKPOINT_DEV + "-" + checkpointRand(P) + "-" + hashOf(P); }

/* ------------------------------------------------------------- validity -- */

function int(x: unknown): x is number { return Number.isInteger(x); }
function text(x: unknown, re: RegExp): boolean { return typeof x === "string" && re.test(x); }

/* One entry alone. Unknown src and k values are valid, so a later version's entries pass
   through. Never throws on data that came out of JSON. */
export function isValid(id: unknown, P: unknown): P is Payload {
  try {
    if (typeof id !== "string" || !ID_RE.test(id)) return false;
    if (!Array.isArray(P) || (P.length !== 10 && P.length !== 11)) return false;
    const [t, d, src, sec, ref, k, ok, n, r, f] = P;
    if (!int(t) || !int(d) || !int(ok) || !int(n) || !int(r) || !int(f)) return false;
    if (t < T_MIN || t > T_MAX || d < D_MIN || d > D_MAX || Math.abs(d - Math.floor(t / 1440)) > 1) return false;
    if (ok !== 0 && ok !== 1) return false;
    if (n < 0 || n > N_MAX || r < 0 || r > R_MAX || f < 0 || f > F_MAX) return false;
    if (!text(src, SRC_RE) || !text(sec, REF_RE) || !text(ref, REF_RE) || !text(k, KIND_RE)) return false;
    const x = P[10];
    if (P.length === 11 && (!plain(x) || canon(x).length > X_CANON_MAX)) return false;
    const parts = id.split("-");
    if (parts[2] !== hashOf(P as Payload)) return false;
    if ((parts[0] === CHECKPOINT_DEV) !== (k === "z")) return false;
    if (k === "z") {
      if (P.length !== 11 || src !== "cp" || sec === "") return false;
      const b = (x as any).b, l = (x as any).l, s = (x as any).s, xn = (x as any).n, o = (x as any).o;
      if (!int(b) || !int(l) || !int(s) || !int(xn) || !int(o)) return false;
      if (b < 0 || b > BOX_MAX || l < D_MIN || l > D_MAX || o < 0 || o > xn || xn > CP_COUNT_MAX) return false;
      if (!(l < s) || d !== s - 1 || l > d || t !== d * 1440) return false;
      if (parts[1] !== checkpointRand(P as Payload)) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function classOf(P: Payload): "z" | "s" | "p" {
  return P[5] === "z" ? "z" : P[5] === "a" ? "s" : "p";
}

/* --------------------------------------------------------------- prune -- */

type Entry = { id: string; P: Payload };
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/* entries in the order: t ascending, then id by UTF-16 code units */
export function ordered(V: EventSet): Entry[] {
  return Object.keys(V).map((id) => ({ id, P: V[id] }))
    .sort((a, b) => (a.P[0] - b.P[0]) || cmpStr(a.id, b.id));
}

function zKey(e: Entry): any { const x: any = e.P[10]; return x; }
/* positive when a is the greater winner: (x.s, x.l, x.b, x.n, x.o, id) */
function cmpWin(a: Entry, b: Entry): number {
  const xa = zKey(a), xb = zKey(b);
  return (xa.s - xb.s) || (xa.l - xb.l) || (xa.b - xb.b) || (xa.n - xb.n) || (xa.o - xb.o) || cmpStr(a.id, b.id);
}

/* sec -> the winning checkpoint of that section */
export function winners(V: EventSet): Record<string, Entry> {
  const out: Record<string, Entry> = Object.create(null);
  Object.keys(V).forEach((id) => {
    const P = V[id];
    if (classOf(P) !== "z") return;
    const e = { id, P }, w = out[P[3]];
    if (!w || cmpWin(e, w) > 0) out[P[3]] = e;
  });
  return out;
}

export function prune(V: EventSet): EventSet {
  const list = ordered(V), W = winners(V), keep: Record<string, boolean> = Object.create(null);
  const groups: Record<string, Entry[]> = Object.create(null);
  const days: Record<string, Entry[]> = Object.create(null);
  list.forEach((e) => {
    const cls = classOf(e.P);
    if (cls === "z") { if (W[e.P[3]].id === e.id) keep[e.id] = true; return; }
    if (cls === "p") { (groups["p|" + e.P[4]] = groups["p|" + e.P[4]] || []).push(e); return; }
    const w = W[e.P[3]], S0 = w ? zKey(w).s : -Infinity;
    if (e.P[1] < S0) return;
    const key = e.P[3] + "|" + e.P[1];
    (days[key] = days[key] || []).push(e);
  });
  Object.keys(groups).forEach((g) => {
    const list = groups[g];
    const c = list.findIndex((e) => e.P[5] === "c" && e.P[6] === 1);
    const o = list.findIndex((e) => e.P[5] === "o");
    list.forEach((e, i) => { if (i < EV_PAGE_HEAD || i === c || i === o) keep[e.id] = true; });
  });
  Object.keys(days).forEach((g) => {
    const list = days[g];
    const w = list.findIndex((e) => e.P[6] === 0);
    list.forEach((e, i) => {
      if (i < EV_DAY_HEAD || list.length - 1 - i < EV_DAY_TAIL || i === w) keep[e.id] = true;
    });
  });
  const out: EventSet = {};
  Object.keys(V).sort().forEach((id) => { if (keep[id]) out[id] = V[id]; });
  return out;
}

/* --------------------------------------------------------------- merge -- */

/* Union of the valid entries of both stores (an invalid one is left out; an id both
   hold with two valid payloads takes the greater canon), pruned; v is the larger number,
   at least 1; unknown top-level keys are carried (later). */
export function mergeEvents(a: unknown, b: unknown): EventsStore {
  const A = obj(a), B = obj(b), EA = obj(at(A, "ev")), EB = obj(at(B, "ev"));
  const union: EventSet = {};
  keysOf(EA, EB).forEach((id) => {
    const pa = at(EA, id), pb = at(EB, id), va = isValid(id, pa), vb = isValid(id, pb);
    if (va && vb) union[id] = later(pa, pb);
    else if (va) union[id] = pa as Payload;
    else if (vb) union[id] = pb as Payload;
  });
  const result: EventsStore = { v: Math.max(1, num(at(A, "v")), num(at(B, "v"))), ev: prune(union) };
  return carryOver(result, A, B, ["v", "ev"]);
}
