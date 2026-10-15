import { describe, expect, it } from "vitest";
import { base36, checkpointId, eventId, prune, type EventSet, type Payload } from "../sync/events.ts";
import {
  MASTERY_ALPHA, MASTERY_MIN_EVIDENCE, MASTERY_PRIOR, OPENED_CREDIT, RETRY_CREDIT,
  RUNG_CREDIT, SEED_WEIGHT, TRY_CREDIT
} from "./constants.ts";
import { creditOf, evidenceOf, masteriesAll, masteryOf } from "./mastery.ts";
import { dayNumber } from "./recall.ts";

const D0 = dayNumber("2026-10-01")!;

/* a seeded generator (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T>(l: readonly T[]) => l[Math.floor(next() * l.length)] };
}

let counter = 0;
const freshRand = () => base36(++counter, 8);

function arena(sec: string, d: number, ok: 0 | 1, n = ok ? 1 : 0, t: number = d * 1440 + 600): [string, Payload] {
  const P: Payload = [t, d, "ar", sec, "", "a", ok, n, 0, 0];
  return [eventId("dev00001", P, freshRand()), P];
}
function pageP(sec: string, ref: string, k: string, ok: number, n: number, r: number, t: number): [string, Payload] {
  const P: Payload = [t, Math.floor(t / 1440), "ex", sec, ref, k, ok, n, r, 0];
  return [eventId("dev00001", P, freshRand()), P];
}
function cpOf(sec: string, s: number, b: number, l: number, n = 10, o = 5): [string, Payload] {
  const P: Payload = [(s - 1) * 1440, s - 1, "cp", sec, "", "z", 0, 0, 0, 0, { b, l, s, n, o }];
  return [checkpointId(P), P];
}
function build(entries: [string, Payload][]): EventSet {
  const V: EventSet = {};
  entries.forEach(([id, P]) => { V[id] = P; });
  return V;
}
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12);
const T0 = D0 * 1440;

describe("creditOf", () => {
  const mk = (k: string, ok: number, n: number, r: number): Payload => [T0, D0, "ex", "ch01#a", "ch01/e1", k, ok, n, r, 0];
  it("tabulates checks by try and rung", () => {
    for (let n = 1; n <= 5; n++) {
      for (let r = 0; r <= 5; r++) {
        const want = TRY_CREDIT[Math.min(n - 1, 3)] * RUNG_CREDIT[Math.min(r, 3)];
        near(creditOf(mk("c", 1, n, r)), want);
      }
      near(creditOf(mk("c", 1, n, 4)), 0.6 * TRY_CREDIT[Math.min(n - 1, 3)]);
      near(creditOf(mk("c", 1, n, 5)), 0.6 * TRY_CREDIT[Math.min(n - 1, 3)]);
    }
    near(creditOf(mk("c", 1, 0, 0)), TRY_CREDIT[0]);
  });
  it("gives the other kinds their credit", () => {
    expect(creditOf(mk("o", 0, 1, 0))).toBe(OPENED_CREDIT);
    expect(creditOf(mk("o", 0, 1, 0))).toBe(0.1);
    expect(creditOf(mk("a", 1, 1, 0))).toBe(1);
    expect(creditOf(mk("a", 0, 2, 0))).toBe(RETRY_CREDIT);
    expect(creditOf(mk("a", 0, 2, 0))).toBe(0.5);
    expect(creditOf(mk("a", 0, 0, 0))).toBe(0);
    ["h", "s", "z", "q"].forEach((k) => expect(creditOf(mk(k, 0, 1, 0))).toBe(0));
  });
  it("stays within [0, 1]", () => {
    ["c", "o", "a", "h", "s", "z", "q"].forEach((k) => {
      for (let ok = 0; ok <= 1; ok++) for (let n = 0; n <= 5; n++) for (let r = 0; r <= 9; r++) {
        const v = creditOf(mk(k, ok, n, r));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe("page evidence", () => {
  const sec = "ch01#a";
  it("takes the first right check of a ref", () => {
    const first = pageP(sec, "ch01/e1", "c", 1, 3, 1, T0 + 30);
    const V = build([
      pageP(sec, "ch01/e1", "h", 0, 1, 0, T0 + 10),
      pageP(sec, "ch01/e1", "c", 0, 1, 0, T0 + 20),
      first,
      pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 40)
    ]);
    const ev = evidenceOf(V, sec);
    expect(ev.length).toBe(1);
    expect(ev[0].id).toBe(first[0]);
    near(ev[0].credit, TRY_CREDIT[2] * RUNG_CREDIT[1]);
  });
  it("takes an opened solution that comes before the first right check", () => {
    const o = pageP(sec, "ch01/e1", "o", 0, 1, 0, T0 + 10);
    const V = build([o, pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 20)]);
    const ev = evidenceOf(V, sec);
    expect(ev.length).toBe(1);
    expect(ev[0].id).toBe(o[0]);
    expect(ev[0].credit).toBe(OPENED_CREDIT);
  });
  it("gives a replay days later nothing", () => {
    const a = pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 10);
    const V = build([a, pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 3 * 1440)]);
    expect(evidenceOf(V, sec).map((e) => e.id)).toEqual([a[0]]);
  });
  it("gives one item per ref, none for an empty ref, none for another section", () => {
    const V = build([
      pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 10),
      pageP(sec, "ch01/e2", "c", 1, 1, 0, T0 + 20),
      pageP(sec, "", "c", 1, 1, 0, T0 + 30),
      pageP("ch02#b", "ch02/e1", "c", 1, 1, 0, T0 + 40),
      pageP(sec, "ch01/e3", "h", 0, 1, 0, T0 + 50)
    ]);
    expect(evidenceOf(V, sec).length).toBe(2);
    expect(evidenceOf(V, "ch02#b").length).toBe(1);
  });
});

describe("Arena evidence", () => {
  it("is one item per entry from S0 on", () => {
    const sec = "ch01#a", s = D0 + 5;
    const V = build([
      cpOf(sec, s, 1, D0, 10, 5),
      arena(sec, s - 2, 1), arena(sec, s - 1, 0),
      arena(sec, s, 1), arena(sec, s, 0), arena(sec, s + 3, 1)
    ]);
    expect(evidenceOf(V, sec).length).toBe(3);
    const bare = build([arena(sec, s - 2, 1), arena(sec, s - 1, 0)]);
    expect(evidenceOf(bare, sec).length).toBe(2);
  });
});

describe("order", () => {
  it("folds items in (t, id) order across both kinds", () => {
    const sec = "ch01#a";
    const V = build([pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 10), arena(sec, D0, 0, 1, T0 + 700)]);
    /* page 1 first: 0.5 -> 0.65; then a miss: 0.65 * 0.7 */
    near(masteryOf(V, sec).m, 0.65 * (1 - MASTERY_ALPHA));
    near(masteryOf(V, sec).m, 0.455);
    const W = build([pageP(sec, "ch01/e1", "c", 1, 1, 0, T0 + 800), arena(sec, D0, 0, 1, T0 + 700)]);
    /* the miss first: 0.5 -> 0.35; then 1: 0.35 + 0.3 * 0.65 */
    near(masteryOf(W, sec).m, 0.545);
    expect(masteryOf(W, sec).c).toBe(2);
  });
});

describe("the prior", () => {
  it("is 0.5 with no evidence", () => {
    expect(masteryOf({}, "ch01#a")).toEqual({ m: 0.5, c: 0 });
  });
  it("is seeded from the winning checkpoint", () => {
    const sec = "ch01#a", s = D0 + 5;
    const a = masteryOf(build([cpOf(sec, s, 1, D0, 10, 8)]), sec);
    near(a.m, (MASTERY_PRIOR * SEED_WEIGHT + 8) / (SEED_WEIGHT + 10));
    near(a.m, (0.5 * 2 + 8) / (2 + 10));
    expect(a.c).toBe(MASTERY_MIN_EVIDENCE);
    const b = masteryOf(build([cpOf(sec, s, 1, D0, 1, 1)]), sec);
    expect(b.c).toBe(1);
  });
});

describe("determinism", () => {
  function randomSet(r: ReturnType<typeof rng>, pageOnly: boolean): [string, Payload][] {
    const entries: [string, Payload][] = [];
    const secs = ["ch01#a", "ch01#b", "ch02#a"];
    const count = r.int(0, 40);
    for (let i = 0; i < count; i++) {
      const sec = r.pick(secs), d = D0 + r.int(0, 30);
      if (!pageOnly && r.next() < 0.4) entries.push(arena(sec, d, r.int(0, 1) as 0 | 1, r.int(0, 3), d * 1440 + r.int(0, 1439)));
      else entries.push(pageP(sec, r.next() < 0.15 ? "" : sec.replace("#", "-") + r.pick(["/e1", "/e2", "/e3"]), r.pick(["c", "o", "h", "s"]), r.int(0, 1), r.int(0, 5), r.int(0, 5), d * 1440 + r.int(0, 1439)));
    }
    if (!pageOnly && r.next() < 0.3) entries.push(cpOf(r.pick(secs), D0 + r.int(5, 15), r.int(0, 4), D0 + r.int(0, 3), 10, r.int(0, 10)));
    return entries;
  }
  it("does not depend on the order the entries are inserted", () => {
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      const entries = randomSet(r, false);
      const shuffled = entries.slice().sort(() => r.next() - 0.5);
      const A = build(entries), B = build(shuffled);
      ["ch01#a", "ch01#b", "ch02#a"].forEach((sec) => expect(masteryOf(B, sec)).toEqual(masteryOf(A, sec)));
    }
  });
  it("is unchanged by prune over page-only sets", () => {
    const r = rng(8);
    for (let i = 0; i < 300; i++) {
      const V = build(randomSet(r, true));
      const P = prune(V);
      ["ch01#a", "ch01#b", "ch02#a"].forEach((sec) => expect(masteryOf(P, sec)).toEqual(masteryOf(V, sec)));
    }
  });
});

describe("bounds", () => {
  it("keeps every credit within [0, 1] over 2,000 seeded payloads", () => {
    const r = rng(21);
    for (let i = 0; i < 2000; i++) {
      const P: Payload = [T0 + r.int(0, 5000), D0, r.pick(["ex", "in", "ar", "cp", "zz"]), "ch01#a", "ch01/e1",
        r.pick(["c", "o", "h", "s", "a", "z", "q", "x"]), r.int(0, 1), r.int(0, 999), r.int(0, 9), r.int(0, 65535)];
      const v = creditOf(P);
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("keeps m in [0, 1] and c whole over 300 seeded sets", () => {
    const r = rng(22);
    for (let i = 0; i < 300; i++) {
      const entries: [string, Payload][] = [];
      const count = r.int(0, 50);
      for (let j = 0; j < count; j++) {
        const d = D0 + r.int(0, 20);
        if (r.next() < 0.5) entries.push(arena("ch01#a", d, r.int(0, 1) as 0 | 1, r.int(0, 999), d * 1440 + r.int(0, 1439)));
        else entries.push(pageP("ch01#a", "ch01/e" + r.int(1, 6), r.pick(["c", "o", "h"]), r.int(0, 1), r.int(0, 999), r.int(0, 9), d * 1440 + r.int(0, 1439)));
      }
      if (r.next() < 0.5) entries.push(cpOf("ch01#a", D0 + 25, 2, D0, 1_000_000, r.int(0, 1_000_000)));
      const m = masteryOf(build(entries), "ch01#a");
      expect(m.m).toBeGreaterThanOrEqual(0);
      expect(m.m).toBeLessThanOrEqual(1);
      expect(Number.isInteger(m.c)).toBe(true);
    }
  });
  it("moves m by at most MASTERY_ALPHA for one entry", () => {
    const sec = "ch01#a";
    const hit = masteryOf(build([arena(sec, D0, 1)]), sec).m;
    const miss = masteryOf(build([arena(sec, D0, 0)]), sec).m;
    near(hit - 0.5, MASTERY_ALPHA * 0.5);
    near(0.5 - miss, MASTERY_ALPHA * 0.5);
    expect(Math.abs(hit - 0.5)).toBeLessThanOrEqual(MASTERY_ALPHA);
    expect(Math.abs(miss - 0.5)).toBeLessThanOrEqual(MASTERY_ALPHA);
  });
});

describe("masteriesAll", () => {
  it("holds masteryOf for every section with evidence, once per log, frozen", () => {
    const V = build([pageP("ch01#a", "ch01/e1", "c", 1, 1, 0, T0 + 10), arena("ch01#b", D0, 0, 1, T0 + 700), arena("", D0, 1, 1, T0 + 800)]);
    const all = masteriesAll(V);
    expect(Object.keys(all)).toEqual(["ch01#a", "ch01#b"]);
    expect(all["ch01#a"]).toEqual(masteryOf(V, "ch01#a"));
    expect(all["ch01#b"]).toEqual(masteryOf(V, "ch01#b"));
    expect(masteriesAll(V)).toBe(all);
    expect(Object.isFrozen(all)).toBe(true);
  });
});
