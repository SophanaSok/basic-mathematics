import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ARENA_SECTIONS } from "../data/arena-sections.ts";
import type { Curriculum } from "../core/curriculum.ts";
import { bandsAll } from "../learn/bands.ts";
import { masteriesAll } from "../learn/mastery.ts";
import { dayNumber } from "../learn/recall.ts";
import { scheduleAll } from "../learn/schedule.ts";
import { base36, checkpointId, eventId, type EventSet, type Payload } from "../sync/events.ts";
import { overview } from "./overview.ts";
import { INSTRUCTIONS, PROMPT } from "./persona.ts";

const curriculum: Curriculum = createRequire(import.meta.url)("../../tools/lib/site.js").curriculum();
const D0 = dayNumber("2026-10-01")!;
const TODAY = "2026-10-20";

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
function arena(sec: string, d: number, ok: 0 | 1): [string, Payload] {
  const P: Payload = [d * 1440 + 600, d, "ar", sec, "", "a", ok, ok ? 1 : 0, 0, 0];
  return [eventId("dev00001", P, freshRand()), P];
}
function pageP(sec: string, ref: string, k: string, ok: number, n: number, r: number, d: number): [string, Payload] {
  const t = d * 1440 + 700;
  const P: Payload = [t, d, /\/e\d+$/.test(ref) ? "ex" : "in", sec, ref, k, ok, n, r, 0];   // e-keys are scored, the rest Your turn
  return [eventId("dev00001", P, freshRand()), P];
}
function cpOf(sec: string, s: number, b: number, l: number, n = 10, o = 5, extra: Record<string, unknown> = {}): [string, Payload] {
  const P: Payload = [(s - 1) * 1440, s - 1, "cp", sec, "", "z", 0, 0, 0, 0, { b, l, s, n, o, ...extra }];
  return [checkpointId(P), P];
}
const build = (entries: [string, Payload][]): EventSet => { const V: EventSet = {}; entries.forEach(([id, P]) => { V[id] = P; }); return V; };
const rowsOf = (V: EventSet): unknown[] => Object.keys(V).map((id) => { const P = V[id]; return [id, ...(P[5] === "z" ? P : P.slice(0, 10))]; });

function fixture(seed: number): EventSet {
  const r = rng(seed), es: [string, Payload][] = [];
  const secs = ARENA_SECTIONS.filter(() => r.next() < 0.5).slice(0, 12);
  secs.forEach((sec) => {
    const ch = sec.split("#")[0];
    for (let i = r.int(0, 8); i > 0; i--) es.push(arena(sec, D0 + r.int(0, 18), r.pick([0, 1] as const)));
    for (let i = r.int(0, 4); i > 0; i--) es.push(pageP(sec, ch + "/e" + r.int(1, 5), r.pick(["c", "o", "h"]), r.pick([0, 1]), r.int(1, 3), r.int(0, 3), D0 + r.int(0, 18)));
    if (r.next() < 0.3) es.push(cpOf(sec, D0 + 5, r.int(0, 4), D0 + 2));
  });
  return build(es);
}

describe("overview", () => {
  it("folds each section as the *All folds do", () => {
    for (const seed of [1, 2, 3, 4]) {
      const V = fixture(seed), o = overview({ events: rowsOf(V), last: null }, curriculum, TODAY);
      const B = bandsAll(V), M = masteriesAll(V), S = scheduleAll(V, TODAY);
      let checked = 0;
      o.chapters.forEach((ch) => ch.sections.forEach((s) => {
        const ref = ch.id + "#" + s.id;
        expect(s.band).toBe(B[ref] ?? "none");
        expect(s.evidence).toBe(M[ref]?.c ?? 0);
        expect(s.box).toBe(S[ref]?.box ?? 0);
        if (B[ref]) checked++;
      }));
      expect(checked).toBeGreaterThan(0);
    }
  });

  it("reads the rows as the database sends them, and drops bad ones", () => {
    const V = fixture(7), good = rowsOf(V), want = overview({ events: good, last: null }, curriculum, TODAY);
    expect(want.totals.events).toBe(Object.keys(V).length);
    const [id0, ...P0] = good[0] as [string, ...unknown[]];
    const bad: unknown[] = [
      [id0.slice(0, -1) + (id0.endsWith("a") ? "b" : "a"), ...P0], [id0, ...P0.slice(0, 5)], "row", 7, null, { 0: 1 },
      [42, ...P0], [id0, ...P0, 1, 2]
    ];
    const got = overview({ events: [...bad, ...good], last: null }, curriculum, TODAY);
    expect(got).toEqual(want);
  });

  it("never lets a string from the events or `last` through", () => {
    const sec = "ch02#one-unknown";
    const V = build([arena(sec, D0 + 1, 1), arena(sec, D0 + 2, 1), arena(sec, D0 + 3, 0), arena("zz#EVILSEC", D0, 1),
      pageP("ch02#EVILSEC2", "evilref/x9", "c", 1, 1, 0, D0),
      cpOf("ch02#addition", D0 + 6, 2, D0 + 1, 10, 5, { ev: "EVILX" })]);
    const rows = rowsOf(V);
    const hostile: unknown[] = [{ id: "<script>", section: "x" }, "ch02", ["ch02"], { id: "x".repeat(100000), section: "y" }, { id: "ch02", section: "<b>EVILLAST</b>" }];
    hostile.forEach((last) => {
      const s = JSON.stringify(overview({ events: rows, last }, curriculum, TODAY));
      ["EVIL", "<script>", "<b>", "xxxxxxxx"].forEach((bad) => expect(s).not.toContain(bad));
    });
    const cont = overview({ events: rows, last: { id: "ch02", section: "<b>EVILLAST</b>" } }, curriculum, TODAY).continue;
    expect(cont?.chapterId).toBe("ch02");
    expect(overview({ events: rows, last: { id: "<script>", section: "x" } }, curriculum, TODAY).continue).toBeNull();
    expect(JSON.stringify(overview({ events: rows, last: null }, curriculum, TODAY))).not.toMatch(/https?:|href/);
  });

  it("answers junk with the empty overview, fast", () => {
    const empty = overview({ events: [], last: null }, curriculum, TODAY);
    expect(empty.totals.events).toBe(0);
    expect(empty.chapters.every((c) => c.sections.every((s) => s.band === "none" && !s.due))).toBe(true);
    const junk = Array.from({ length: 50_000 }, (_, i) => [String(i), i, "x", [], {}, null, "q", 1, 2, 3]);
    const t0 = Date.now();
    const inputs: unknown[] = [null, undefined, 3, "x", {}, { events: "x" }, { events: junk }, { events: [[]], last: 5, truncated: "yes" }];
    inputs.forEach((i) => expect(overview(i as any, curriculum, TODAY)).toEqual(empty));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(overview({ events: [], last: null }, null as any, "nonsense").chapters).toEqual([]);
    expect(overview({ events: [], last: null, truncated: true }, curriculum, TODAY).totals.truncated).toBe(true);
  });

  it("marks due only what the Arena's deck would hold", () => {
    const sec = "ch03#order", ch = "ch03", d = D0 + 2;   // 17 days before TODAY
    const due = (es: [string, Payload][]) => overview({ events: rowsOf(build(es)), last: null }, curriculum, TODAY).chapters
      .find((c) => c.id === ch)!.sections.find((s) => s.id === "order")!.due;
    expect(due([])).toBe(false);                                                   // never touched
    expect(due([pageP(sec, ch + "/t1", "c", 1, 1, 0, d)])).toBe(false);            // one Your-turn check: still new
    expect(due([pageP(sec, ch + "/t1", "c", 1, 1, 0, d), pageP(sec, ch + "/t2", "c", 1, 2, 0, d)])).toBe(true);   // two exercises solved
    expect(due([pageP(sec, ch + "/e1", "c", 1, 1, 0, d)])).toBe(true);             // a scored exercise right first time
    expect(due([pageP(sec, ch + "/e1", "c", 1, 2, 0, d)])).toBe(false);            // a scored exercise right on the second try, alone
    expect(due([arena(sec, d, 1)])).toBe(true);                                    // an Arena first-try right, 17 days ago
    expect(due([arena(sec, d, 0), arena(sec, d + 1, 0)])).toBe(false);             // misses only
    expect(due([arena(sec, D0 + 17, 1)])).toBe(false);                             // placed in box 1 two days ago: not yet
    expect(due([cpOf(sec, D0 + 5, 0, D0 + 2)])).toBe(true);                        // a checkpoint: under the clock already
    expect(due([pageP(sec, ch + "/t1", "c", 1, 1, 0, d), pageP(sec, ch + "/t2", "c", 1, 1, 0, D0 + 18)])).toBe(true);    // seen yesterday: box 0 waits one day
    expect(due([pageP(sec, ch + "/t1", "c", 1, 1, 0, d), pageP(sec, ch + "/t2", "c", 1, 1, 0, D0 + 19)])).toBe(false);   // seen today: not yet
  });

  it("adds up", () => {
    const V = fixture(11), o = overview({ events: rowsOf(V), last: { id: "ch02", section: "one-unknown" } }, curriculum, TODAY);
    const t = o.totals, all = o.chapters.flatMap((c) => c.sections);
    expect(t.strong + t.building + t.weak + t.none).toBe(t.sections);
    expect(all.length).toBe(t.sections);
    expect(o.due).toBe(all.filter((s) => s.due).length);
    expect(o.continue?.chapterId).toBe("ch02");
    expect(o.continue).not.toHaveProperty("href");
  });
});

describe("persona", () => {
  it("says the rules", () => {
    [INSTRUCTIONS, PROMPT.text].forEach((t) => {
      expect(t.length).toBeGreaterThan(100);
      expect(t).toMatch(/attempt/i);
      expect(t).toMatch(/in order/i);
      expect(t).toMatch(/on the page/i);
    });
    expect(PROMPT.name).toBe("mochi");
    expect(PROMPT.description.length).toBeGreaterThan(0);
  });
});
