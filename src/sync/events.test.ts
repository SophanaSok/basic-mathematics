import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { merge as installed } from "../ui/core.ts";
import {
  BOX_MAX, CHECKPOINT_DEV, D_MAX, D_MIN, F_MAX, FORMAT, FORMAT_TABLE, N_MAX, R_MAX, T_MAX, T_MIN, X_CANON_MAX,
  base36, checkpointId, checkpointRand, classOf, eventId, fnv1a32, hashOf, isValid, mergeEvents, ordered, prune, randomRand,
  winners, type EventSet, type Payload
} from "./events.ts";
import { later } from "./json.ts";
import { merge } from "./merge.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

/* JSON with object keys sorted at every level, written out here rather than taken from
   the module under test */
function canon(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return "{" + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
  }
  return JSON.stringify(x === undefined ? null : x);
}

/* a small seeded PRNG (xorshift, as tools/lib/random-state.js) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next: any = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.int = (n: number) => Math.floor(next() * n);
  next.pick = <T>(arr: T[]): T => arr[next.int(arr.length)];
  next.maybe = (p?: number) => next() < (p === undefined ? 0.5 : p);
  return next as { (): number; int(n: number): number; pick<T>(a: T[]): T; maybe(p?: number): boolean };
}
type R = ReturnType<typeof rng>;

const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
const randOf = (R: R) => Array.from({ length: 8 }, () => ALPHA[R.int(36)]).join("");
const DEV = "dev00001";
const DAY0 = 20000, T0 = DAY0 * 1440;

/* ------------------------------------------------------------- fixtures -- */

type Pair = [string, Payload];

function pageEntry(R: R, o: { sec: string; ref: string; k: string; ok: number; n: number; r: number; f: number; t?: number; x?: Record<string, unknown>; src?: string }): Pair {
  const t = o.t ?? T0 + R.int(43200);
  const P: Payload = [t, Math.floor(t / 1440), o.src ?? R.pick(["ex", "in", "tw"]), o.sec, o.ref, o.k, o.ok, o.n, o.r, o.f];
  if (o.x) P.push(o.x);
  return [eventId(DEV, P, randOf(R)), P];
}
function arenaEntry(R: R, o: { sec: string; d: number; ok: number; n: number; rand?: string }): Pair {
  const t = o.d * 1440 + R.int(1440);
  const P: Payload = [t, o.d, "ar", o.sec, "g:gen" + R.int(3), "a", o.ok, o.n, 0, 0];
  expect(P.length).toBe(10);
  expect(P[10]).toBeUndefined();
  return [eventId(DEV, P, o.rand ?? randOf(R)), P];
}
function checkpoint(o: { sec: string; b: number; l: number; s: number; n: number; o: number; extra?: Record<string, unknown> }): Pair {
  const d = o.s - 1;
  const P: Payload = [d * 1440, d, "cp", o.sec, "", "z", 1, 0, 0, 0, { b: o.b, l: o.l, s: o.s, n: o.n, o: o.o, ...(o.extra ?? {}) }];
  return [checkpointId(P), P];
}
const setOf = (pairs: Pair[]): EventSet => { const V: EventSet = {}; pairs.forEach(([id, P]) => { V[id] = P; }); return V; };
const union = (...sets: EventSet[]): EventSet => Object.assign({}, ...sets);
/* a hand-built page entry whose time and id are chosen */
function hand(t: number, rand: string, o: { sec?: string; ref?: string; k?: string; ok?: number; src?: string; d?: number }): Pair {
  const P: Payload = [t, o.d ?? Math.floor(t / 1440), o.src ?? "ex", o.sec ?? "ch01#a", o.ref ?? "ch01/e1", o.k ?? "c", o.ok ?? 0, 0, 0, 0];
  return [eventId(DEV, P, rand), P];
}

/* a pool of valid entries with distinct ids: sections, refs, competing checkpoints,
   Arena days, unknown src and kinds, some payloads with x */
function genPool(R: R): EventSet {
  const V: EventSet = {};
  const add = ([id, P]: Pair) => { if (!(id in V)) V[id] = P; };
  const secs = Array.from({ length: 3 + R.int(4) }, (_, i) => `ch0${i}#s${i}`);
  const refs = Array.from({ length: 3 + R.int(10) }, (_, i) => `ch0${R.int(3)}/e${i}`);
  secs.forEach((sec) => {
    for (let c = R.int(4); c > 0; c--) {
      const n = R.int(4);
      add(checkpoint({ sec, b: R.int(BOX_MAX + 1), l: DAY0 + R.int(5), s: DAY0 + 5 + R.int(8), n, o: R.int(n + 1) }));
    }
  });
  for (let c = R.int(41); c > 0; c--) add(arenaEntry(R, { sec: R.pick(secs), d: DAY0 + R.int(31), ok: R.int(2), n: R.int(50) }));
  for (let c = R.int(61); c > 0; c--) {
    add(pageEntry(R, {
      sec: R.pick(secs), ref: R.pick(refs), k: R.pick(["c", "o", "h", "s", "q"]), ok: R.int(2), n: R.int(10), r: R.int(4), f: R.int(256),
      t: T0 + R.int(200) * 7, x: R.maybe(0.2) ? { a: R.int(9) } : undefined
    }));
  }
  return V;
}
const subset = (R: R, V: EventSet, p: number): EventSet => {
  const out: EventSet = {};
  Object.keys(V).forEach((id) => { if (R.maybe(p)) out[id] = V[id]; });
  return out;
};

/* ------------------------------------------------------------ the tests -- */

describe("hashes and ids", () => {
  it("fnv1a32 has its published vectors", () => {
    expect(fnv1a32("")).toBe(2166136261);
    expect(fnv1a32("a")).toBe(3826002220);
    expect(fnv1a32("foobar")).toBe(3214735720);
  });

  it("base36 pads on the left", () => {
    expect(base36(0, 7)).toBe("0000000");
    expect(base36(35, 3)).toBe("00z");
    expect(base36(36 ** 3, 2)).toBe("1000");
  });

  it("hashOf is 7 characters, checkpointRand 8, and the key order of x does not matter", () => {
    const [, P] = pageEntry(rng(1), { sec: "ch01#a", ref: "ch01/e1", k: "c", ok: 1, n: 1, r: 0, f: 0, x: { a: 1, b: 2 } });
    expect(hashOf(P)).toMatch(/^[0-9a-z]{7}$/);
    expect(checkpointRand(P)).toMatch(/^[0-9a-z]{8}$/);
    const Q = [...P] as Payload; Q[10] = { b: 2, a: 1 };
    expect(hashOf(Q)).toBe(hashOf(P));
    expect(checkpointRand(Q)).toBe(checkpointRand(P));
  });

  it("checkpointId is the same for the same payload, whatever order x was written in", () => {
    const [id, P] = checkpoint({ sec: "ch01#a", b: 1, l: 20001, s: 20010, n: 5, o: 2 });
    expect(id).toBe(CHECKPOINT_DEV + "-" + checkpointRand(P) + "-" + hashOf(P));
    const Q = [...P] as Payload; Q[10] = { o: 2, n: 5, s: 20010, l: 20001, b: 1 };
    expect(checkpointId(Q)).toBe(id);
  });

  it("eventId without a rand draws 8 characters from [0-9a-z], and two calls differ", () => {
    const [, P] = pageEntry(rng(2), { sec: "", ref: "", k: "c", ok: 0, n: 0, r: 0, f: 0 });
    const a = eventId(DEV, P), b = eventId(DEV, P);
    expect(a).toMatch(/^dev00001-[0-9a-z]{8}-[0-9a-z]{7}$/);
    expect(a).not.toBe(b);
    expect(randomRand()).toMatch(/^[0-9a-z]{8}$/);
    expect(eventId(DEV, P, "abcd1234")).toBe(DEV + "-abcd1234-" + hashOf(P));
  });
});

describe("isValid", () => {
  const sec = "ch02#one-unknown", ref = "ch02/e3";
  const page = (): Payload => [T0, DAY0, "ex", sec, ref, "c", 1, 2, 1, 0];
  const withId = (P: Payload, dev = DEV, rand = "abcd1234") => eventId(dev, P, rand);
  const valid = (P: Payload, dev = DEV, rand = "abcd1234") => isValid(withId(P, dev, rand), P);
  const mutate = (f: (P: any[]) => void): Payload => { const P: any[] = page(); f(P); return P as Payload; };
  const cpArgs = () => ({ sec, b: 2, l: 20005, s: 20010, n: 10, o: 7 });
  const cpMutate = (f: (P: any[], x: any) => void): [string, Payload] => {
    const [, P0] = checkpoint(cpArgs());
    const P: any[] = JSON.parse(JSON.stringify(P0));
    f(P, P[10]);
    return [checkpointId(P as Payload), P as Payload];
  };

  it("passes a page entry, an Arena entry and a checkpoint", () => {
    expect(valid(page())).toBe(true);
    const [aid, AP] = arenaEntry(rng(3), { sec, d: DAY0, ok: 1, n: 5 });
    expect(isValid(aid, AP)).toBe(true);
    const [cid, CP] = checkpoint(cpArgs());
    expect(isValid(cid, CP)).toBe(true);
  });

  it("fails a wrong hash part and a bad id shape", () => {
    const P = page();
    const id = withId(P);
    expect(isValid(id.slice(0, -1) + (id.endsWith("a") ? "b" : "a"), P)).toBe(false);
    ["", "x", id + "x", id.toUpperCase(), id.replace(/-/g, "_"), "dev0001-abcd1234-" + hashOf(P), "dev00001-abcd123-" + hashOf(P) + "0"]
      .forEach((bad) => expect(isValid(bad, P)).toBe(false));
  });

  it("fails lengths 9 and 12", () => {
    const P: any[] = page();
    expect(valid(P.slice(0, 9) as Payload)).toBe(false);
    expect(valid([...P, {}, 1] as unknown as Payload)).toBe(false);
  });

  it("fails each numeric field below, above and not an integer", () => {
    const at = (i: number, v: number, extra?: (P: any[]) => void) => mutate((P) => { P[i] = v; if (extra) extra(P); });
    expect(valid(at(0, T_MIN - 1, (P) => { P[1] = Math.floor((T_MIN - 1) / 1440); }))).toBe(false);
    expect(valid(at(0, T_MAX + 1, (P) => { P[1] = Math.floor((T_MAX + 1) / 1440); }))).toBe(false);
    expect(valid(at(0, T0 + 0.5))).toBe(false);
    expect(valid(at(1, D_MIN - 1))).toBe(false);
    expect(valid(at(1, D_MAX + 1))).toBe(false);
    expect(valid(at(1, DAY0 + 0.5))).toBe(false);
    expect(valid(at(6, -1))).toBe(false);
    expect(valid(at(6, 2))).toBe(false);
    expect(valid(at(6, 0.5))).toBe(false);
    expect(valid(at(7, -1))).toBe(false);
    expect(valid(at(7, N_MAX + 1))).toBe(false);
    expect(valid(at(7, 1.5))).toBe(false);
    expect(valid(at(8, -1))).toBe(false);
    expect(valid(at(8, R_MAX + 1))).toBe(false);
    expect(valid(at(8, 1.5))).toBe(false);
    expect(valid(at(9, -1))).toBe(false);
    expect(valid(at(9, F_MAX + 1))).toBe(false);
    expect(valid(at(9, 1.5))).toBe(false);
    [at(7, N_MAX), at(7, 0), at(8, R_MAX), at(9, F_MAX), at(9, 0), at(6, 0)].forEach((P) => expect(valid(P)).toBe(true));
    expect(valid(at(0, T_MIN, (P) => { P[1] = Math.floor(T_MIN / 1440); }))).toBe(true);
    expect(valid(at(0, T_MAX, (P) => { P[1] = Math.floor(T_MAX / 1440); }))).toBe(true);
    expect(valid(mutate((P) => { P[7] = "3"; }))).toBe(false);
    expect(valid(mutate((P) => { P[7] = null; }))).toBe(false);
  });

  it("holds d to within one of floor(t / 1440)", () => {
    expect(valid(mutate((P) => { P[1] = DAY0 + 1; }))).toBe(true);
    expect(valid(mutate((P) => { P[1] = DAY0 - 1; }))).toBe(true);
    expect(valid(mutate((P) => { P[1] = DAY0 + 2; }))).toBe(false);
    expect(valid(mutate((P) => { P[1] = DAY0 - 2; }))).toBe(false);
  });

  it("holds src, k, sec and ref to their patterns", () => {
    expect(valid(mutate((P) => { P[2] = "abcd"; }))).toBe(false);
    expect(valid(mutate((P) => { P[2] = "Ex"; }))).toBe(false);
    expect(valid(mutate((P) => { P[2] = ""; }))).toBe(false);
    expect(valid(mutate((P) => { P[2] = 5; }))).toBe(false);
    expect(valid(mutate((P) => { P[5] = "cc"; }))).toBe(false);
    expect(valid(mutate((P) => { P[5] = "C"; }))).toBe(false);
    expect(valid(mutate((P) => { P[5] = ""; }))).toBe(false);
    [3, 4].forEach((i) => {
      expect(valid(mutate((P) => { P[i] = "ch 02"; }))).toBe(false);
      expect(valid(mutate((P) => { P[i] = "Ch02"; }))).toBe(false);
      expect(valid(mutate((P) => { P[i] = "a".repeat(91); }))).toBe(false);
      expect(valid(mutate((P) => { P[i] = "a".repeat(90); }))).toBe(true);
      expect(valid(mutate((P) => { P[i] = ""; }))).toBe(true);
      expect(valid(mutate((P) => { P[i] = null; }))).toBe(false);
    });
  });

  it("holds x to a plain object of at most 256 canonical characters", () => {
    const withX = (x: unknown) => mutate((P) => { P[10] = x; });
    expect(valid(withX({ a: "y".repeat(248) }))).toBe(true);
    expect(canon({ a: "y".repeat(248) }).length).toBe(X_CANON_MAX);
    expect(valid(withX({ a: "y".repeat(249) }))).toBe(false);
    [[], [1], "x", null, 5, undefined].forEach((x) => expect(valid(withX(x))).toBe(false));
    expect(valid(withX({ a: 1 }))).toBe(true);
    expect(valid(withX({}))).toBe(true);
  });

  it("couples the first part of the id to k = z", () => {
    expect(valid(page(), CHECKPOINT_DEV)).toBe(false);
    const [, CP] = checkpoint(cpArgs());
    expect(isValid(eventId("dev00001", CP, checkpointRand(CP)), CP)).toBe(false);
  });

  it("holds a checkpoint to its rules, one at a time", () => {
    const ok = (f: (P: any[], x: any) => void) => { const [id, P] = cpMutate(f); return isValid(id, P); };
    expect(ok(() => {})).toBe(true);
    expect(ok((P, x) => { x.extra = 1; })).toBe(true);
    expect(ok((P) => { P[2] = "ex"; })).toBe(false);
    expect(ok((P) => { P[3] = ""; })).toBe(false);
    expect(ok((P) => { P[1] = 20008; P[0] = 20008 * 1440; })).toBe(false);
    expect(ok((P) => { P[1] = 20010; P[0] = 20010 * 1440; })).toBe(false);
    expect(ok((P, x) => { x.l = 20010; })).toBe(false);
    expect(ok((P, x) => { x.l = 20011; })).toBe(false);
    expect(ok((P, x) => { x.o = 11; })).toBe(false);
    expect(ok((P, x) => { x.n = 1000001; x.o = 5; })).toBe(false);
    expect(ok((P, x) => { x.b = 5; })).toBe(false);
    expect(ok((P, x) => { x.b = -1; })).toBe(false);
    expect(ok((P, x) => { x.l = D_MIN - 1; })).toBe(false);
    expect(ok((P) => { P[0] += 1; })).toBe(false);
    expect(ok((P, x) => { delete x.o; })).toBe(false);
    expect(ok((P, x) => { x.b = 1.5; })).toBe(false);
    expect(ok((P) => { P.pop(); })).toBe(false);
    expect(ok((P) => { P[5] = "z"; P[10] = []; })).toBe(false);
    const [, CP] = checkpoint(cpArgs());
    expect(isValid(CHECKPOINT_DEV + "-abcd1234-" + hashOf(CP), CP)).toBe(false);
  });

  it("passes unknown src and k values and an x on a check", () => {
    expect(valid(mutate((P) => { P[2] = "tw"; }))).toBe(true);
    expect(valid(mutate((P) => { P[5] = "q"; }))).toBe(true);
    expect(valid(mutate((P) => { P[10] = { why: "later version" }; }))).toBe(true);
  });

  it("never throws on junk", () => {
    const id = withId(page());
    const junk: unknown[] = [undefined, null, 7, "x", {}, [], [1], Array.from({ length: 10 }, () => ({})), () => 1, Array.from({ length: 11 }, () => [])];
    junk.forEach((j) => {
      expect(isValid(id, j)).toBe(false);
      expect(isValid(j, page())).toBe(false);
      expect(isValid(j, j)).toBe(false);
    });
    expect(isValid(7, page())).toBe(false);
  });
});

describe("classOf", () => {
  it("is z for a checkpoint, s for an Arena answer and p for the rest", () => {
    expect(classOf(checkpoint({ sec: "a", b: 0, l: 20000, s: 20001, n: 0, o: 0 })[1])).toBe("z");
    expect(classOf(arenaEntry(rng(4), { sec: "a", d: DAY0, ok: 1, n: 1 })[1])).toBe("s");
    expect(classOf(hand(T0, "aaaaaaaa", { k: "c" })[1])).toBe("p");
    expect(classOf(hand(T0, "aaaaaaaa", { k: "q" })[1])).toBe("p");
  });
});

describe("prune", () => {
  const sizeOf = (V: EventSet) => Object.keys(V).length;

  it("keeps a ref group's first 8, its earliest right check and its earliest opened solution", () => {
    const pairs: Pair[] = [];
    for (let i = 0; i < 8; i++) pairs.push(hand(T0 + i, "r000000" + i, { k: "h", ok: 0 }));
    pairs.push(hand(T0 + 8, "r0000008", { k: "c", ok: 0 }));
    pairs.push(hand(T0 + 9, "r0000009", { k: "c", ok: 1 }));
    pairs.push(hand(T0 + 10, "r000000a", { k: "o", ok: 0 }));
    pairs.push(hand(T0 + 11, "r000000b", { k: "c", ok: 1 }));
    const V = setOf(pairs), out = prune(V);
    expect(sizeOf(out)).toBe(10);
    expect(Object.keys(out).sort()).toEqual(pairs.slice(0, 8).concat([pairs[9], pairs[10]]).map(([id]) => id).sort());
    expect(pairs[8][0] in out).toBe(false);
    expect(pairs[11][0] in out).toBe(false);
  });

  it("treats the empty ref as one group and different refs as different groups", () => {
    const a: Pair[] = [], b: Pair[] = [];
    for (let i = 0; i < 10; i++) { a.push(hand(T0 + i, "a00000" + (10 + i), { ref: "", k: "h" })); b.push(hand(T0 + i, "b00000" + (10 + i), { ref: "ch01/e2", k: "h" })); }
    expect(sizeOf(prune(setOf(a.concat(b))))).toBe(16);
    expect(sizeOf(prune(setOf(a)))).toBe(8);
  });

  it("keeps an s group's first two, last two and earliest wrong answer", () => {
    const day = DAY0 + 3, R = rng(5);
    const mk = (n: number, wrong: number[]) => Array.from({ length: n }, (_, i): Pair => {
      const P: Payload = [day * 1440 + i, day, "ar", "ch01#a", "g:x", "a", wrong.includes(i) ? 0 : 1, 0, 0, 0];
      return [eventId(DEV, P, "s000000" + i), P];
    });
    const seven = mk(7, [3, 4]), out = prune(setOf(seven));
    expect(sizeOf(out)).toBe(5);
    expect(Object.keys(out).sort()).toEqual([0, 1, 3, 5, 6].map((i) => seven[i][0]).sort());
    expect(sizeOf(prune(setOf(mk(4, []))))).toBe(4);
    expect(sizeOf(prune(setOf(mk(5, []))))).toBe(4);
    expect(sizeOf(prune(setOf(mk(7, []))))).toBe(4);
    expect(R()).toBeGreaterThan(-1);
  });

  it("keeps only the maximum checkpoint of a section, a tie broken at each level in turn", () => {
    const base = { sec: "ch01#a", b: 2, l: 20005, s: 20010, n: 5, o: 3 };
    const levels: Array<[string, Record<string, number>]> = [["s", { s: 20011 }], ["l", { l: 20006 }], ["b", { b: 3 }], ["n", { n: 6 }], ["o", { o: 4 }]];
    levels.forEach(([name, bump]) => {
      const lo = checkpoint(base), hi = checkpoint({ ...base, ...bump });
      const out = prune(setOf([lo, hi]));
      expect(Object.keys(out), name).toEqual([hi[0]]);
    });
    /* equal on all five fields: the greater id (the payloads differ by an extra key in x) */
    const p = checkpoint({ ...base, extra: { q: 1 } }), q = checkpoint({ ...base, extra: { q: 2 } });
    const winner = p[0] > q[0] ? p : q;
    expect(Object.keys(prune(setOf([p, q])))).toEqual([winner[0]]);
    expect(winners(setOf([p, q]))["ch01#a"].id).toBe(winner[0]);
    /* the earlier level wins over every later one */
    const early = checkpoint({ ...base, s: 20011, l: 20000, b: 0, n: 0, o: 0 }), late = checkpoint({ ...base, b: 4, n: 99, o: 99 });
    expect(Object.keys(prune(setOf([early, late])))).toEqual([early[0]]);
  });

  it("drops s-entries before the winner's s and keeps those from it on", () => {
    const R = rng(6);
    const cp = checkpoint({ sec: "ch01#a", b: 1, l: 20000, s: 20010, n: 1, o: 1 });
    const before = arenaEntry(R, { sec: "ch01#a", d: 20009, ok: 1, n: 1, rand: "e0000001" });
    const on = arenaEntry(R, { sec: "ch01#a", d: 20010, ok: 1, n: 1, rand: "e0000002" });
    const after = arenaEntry(R, { sec: "ch01#a", d: 20011, ok: 1, n: 1, rand: "e0000003" });
    const out = prune(setOf([cp, before, on, after]));
    expect(Object.keys(out).sort()).toEqual([cp[0], on[0], after[0]].sort());
    /* no checkpoint: nothing is dropped for its day */
    expect(Object.keys(prune(setOf([before, on, after]))).sort()).toEqual([before[0], on[0], after[0]].sort());
  });

  it("does not let one section's checkpoint touch another section's entries", () => {
    const R = rng(7);
    const cpA = checkpoint({ sec: "ch01#a", b: 1, l: 20000, s: 20010, n: 1, o: 1 });
    const inB = arenaEntry(R, { sec: "ch01#b", d: 20001, ok: 1, n: 1, rand: "f0000001" });
    const cpB = checkpoint({ sec: "ch01#b", b: 1, l: 20000, s: 20003, n: 1, o: 1 });
    const out = prune(setOf([cpA, inB, cpB]));
    expect(Object.keys(out).sort()).toEqual([cpA[0], cpB[0]].sort());
    expect(Object.keys(prune(setOf([cpA, inB]))).sort()).toEqual([cpA[0], inB[0]].sort());
    expect(Object.keys(winners(setOf([cpA, cpB]))).sort()).toEqual(["ch01#a", "ch01#b"]);
  });

  it("orders by t, then id by code units", () => {
    const e1 = hand(T0 + 5, "bbbbbbbb", {}), e2 = hand(T0 + 5, "aaaaaaaa", {}), e3 = hand(T0 + 1, "zzzzzzzz", {});
    const list = ordered(setOf([e1, e2, e3])).map((e) => e.id);
    expect(list).toEqual([e3[0], e2[0], e1[0]]);
    expect(Object.keys(prune(setOf([e1, e2, e3])))).toEqual([e1[0], e2[0], e3[0]].sort());
  });
});

describe("the prune lemma", () => {
  it("prune(prune(X) u Y) = prune(X u Y), and prune is idempotent, over 2,000 seeded pairs", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const R = rng(seed * 7919);
      const pool = genPool(R), X = subset(R, pool, 0.6), Y = subset(R, pool, 0.6);
      const lhs = canon(prune(union(prune(X), Y))), rhs = canon(prune(union(X, Y)));
      if (lhs !== rhs) throw new Error("lemma fails at seed " + seed);
      if (canon(prune(prune(X))) !== canon(prune(X))) throw new Error("idempotence fails at seed " + seed);
    }
  }, 60_000);
});

describe("mergeEvents", () => {
  const junkFor = (R: R): EventSet => {
    const V: Record<string, unknown> = {};
    const base = (): Payload => [T0 + R.int(1000), DAY0, "ex", "ch01#a", "ch01/e1", "c", 1, 1, 0, 0];
    const rand = () => "junk" + randOf(R).slice(0, 4);
    if (R.maybe(0.7)) { const P = base(); const id = eventId("junkdev1", P, rand()); P[7] = 2; V[id] = P; }
    if (R.maybe(0.7)) { const P = base(); P[0] = 5; V[eventId("junkdev1", P, rand())] = P; }
    if (R.maybe(0.7)) { const P = base(); V[eventId(CHECKPOINT_DEV, P, rand())] = P; }
    if (R.maybe(0.7)) { const P = base(); P[5] = "z"; V[eventId("junkdev1", P, rand())] = P; }
    if (R.maybe(0.7)) V[eventId("junkdev1", base(), rand())] = R.pick<unknown>(["x", {}, 5, null, [1], [[], []]]);
    return V as EventSet;
  };
  const genStore = (R: R, pool: EventSet): any => {
    if (R.maybe(0.03)) return R.pick<unknown>(["junk", [], null, 7]);
    const s: any = {};
    if (R.maybe(0.8)) s.v = R.pick<unknown>([1, 2, 3, "2", "x", null]);
    s.ev = R.maybe(0.05) ? R.pick<unknown>(["str", [], null, 4]) : { ...subset(R, pool, 0.6), ...junkFor(R) };
    if (R.maybe(0.3)) s.zz = R.pick<unknown>(["a", 5, { k: 1 }, [1, 2], null, { k: 2 }]);
    return s;
  };

  it("is commutative, associative and idempotent, and drops every invalid entry, over 2,000 seeded triples", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const R = rng(seed * 104729);
      const pool = genPool(R), a = genStore(R, pool), b = genStore(R, pool), c = genStore(R, pool);
      const ab = mergeEvents(a, b);
      if (canon(ab) !== canon(mergeEvents(b, a))) throw new Error("commutativity fails at seed " + seed);
      if (canon(mergeEvents(ab, c)) !== canon(mergeEvents(a, mergeEvents(b, c)))) throw new Error("associativity fails at seed " + seed);
      if (canon(mergeEvents(ab, ab)) !== canon(ab)) throw new Error("idempotence fails at seed " + seed);
      const ev = ab.ev as Record<string, unknown>;
      Object.keys(ev).forEach((id) => {
        if (!isValid(id, ev[id])) throw new Error("invalid entry kept at seed " + seed);
        if (id.startsWith("junkdev1") || id.split("-")[1].startsWith("junk")) throw new Error("junk kept at seed " + seed);
      });
      const plainSides = [a, b].every((s) => s && typeof s === "object" && !Array.isArray(s));
      if (plainSides) {
        const own = (s: any) => (Object.prototype.hasOwnProperty.call(s, "zz") ? s.zz : undefined);
        const want = later(own(a), own(b));
        if (canon((ab as any).zz) !== canon(want)) throw new Error("unknown key not later() at seed " + seed);
      }
    }
  }, 60_000);

  it("takes v as the larger number, at least 1", () => {
    expect(mergeEvents({ v: 2 }, {}).v).toBe(2);
    expect(mergeEvents({}, { v: 3, ev: {} }).v).toBe(3);
    expect(mergeEvents({}, {}).v).toBe(1);
    expect(mergeEvents(undefined, null).v).toBe(1);
    expect(mergeEvents({ v: 0 }, { v: -4 }).v).toBe(1);
    expect(mergeEvents({ v: "x" }, { v: 2 }).v).toBe(2);
    expect(mergeEvents({}, {}).ev).toEqual({});
  });

  it("resolves two valid payloads under one id by the greater canon (T3)", () => {
    const R = rng(8);
    const seen = new Map<string, Payload>();
    let pair: [Payload, Payload] | null = null;
    for (let i = 0; i < 600_000 && !pair; i++) {
      const t = T_MIN + R.int(1_000_000), ok = R.int(2);
      const P: Payload = [t, Math.floor(t / 1440), "ex", "ch01#a", "ch01/e1", "c", ok, R.int(N_MAX + 1), R.int(R_MAX + 1), R.int(F_MAX + 1)];
      const h = hashOf(P), prior = seen.get(h);
      if (prior && canon(prior) !== canon(P)) pair = [prior, P]; else seen.set(h, P);
    }
    if (!pair) throw new Error("no hash collision found in 600,000 draws");
    const [P, Q] = pair, id = eventId(DEV, P, "coll0001");
    expect(eventId(DEV, Q, "coll0001")).toBe(id);
    expect(isValid(id, P) && isValid(id, Q)).toBe(true);
    const want = canon(P) >= canon(Q) ? P : Q;
    expect(mergeEvents({ ev: { [id]: P } }, { ev: { [id]: Q } }).ev).toEqual({ [id]: want });
    expect(mergeEvents({ ev: { [id]: Q } }, { ev: { [id]: P } }).ev).toEqual({ [id]: want });
  }, 60_000);
});

describe("format 1", () => {
  it("is pinned", () => {
    expect(FORMAT).toBe(1);
    /* a change here is a format bump: bump FORMAT and move this number in the same change */
    expect(fnv1a32(canon(FORMAT_TABLE))).toBe(1161217912);
  });
});

describe("where the module is used", () => {
  it("adds no global when Node imports events.ts and json.ts", () => {
    const urls = ["events.ts", "json.ts"].map((f) => new URL("file://" + path.join(ROOT, "src/sync", f)).href);
    const script = "const before = Reflect.ownKeys(globalThis).map(String);" +
      "for (const u of " + JSON.stringify(urls) + ") await import(u);" +
      "const after = Reflect.ownKeys(globalThis).map(String);" +
      "console.log(JSON.stringify(after.filter((k) => !before.includes(k))));";
    const out = execFileSync(process.execPath, ["--input-type=module", "--no-warnings", "-e", script], { encoding: "utf8" });
    expect(JSON.parse(out.trim())).toEqual([]);
  });

  it("merge() carries events only when a side has them", () => {
    const R = rng(9);
    const a = { ev: subset(R, genPool(R), 0.5) }, b = { v: 2, ev: subset(R, genPool(R), 0.5) };
    expect("events" in merge({ progress: {} }, { progress: {} })).toBe(false);
    expect(merge({ events: a }, {}).events).toEqual(mergeEvents(a, undefined));
    expect(merge({}, { events: b }).events).toEqual(mergeEvents(undefined, b));
    expect(merge({ events: a }, { events: b }).events).toEqual(mergeEvents(a, b));
  });

  it("is on window.BMMerge as the same function", () => {
    expect(installed.mergeEvents).toBe(mergeEvents);
  });
});
