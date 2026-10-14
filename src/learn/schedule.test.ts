import { describe, expect, it } from "vitest";
import {
  base36, checkpointId, classOf, eventId, isValid, prune, winners,
  type EventSet, type Payload
} from "../sync/events.ts";
import { checkpoint } from "./checkpoint.ts";
import { SCHED_FUTURE_SLACK_DAYS, SCHED_KEEP } from "./constants.ts";
import { checkDue, dayNumber, dueOn, place } from "./recall.ts";
import { dueSplit } from "./review.ts";
import { arenaDays, dayKeyOf, scheduleAll, scheduleOf, startOf, type Schedule } from "./schedule.ts";

const D0 = dayNumber("2026-10-01")!;
const LONG = 60_000;

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

/* one Arena answer; t is the minute of the day d unless given */
function arena(sec: string, d: number, ok: 0 | 1, rand: string = freshRand(), t: number = d * 1440 + 600): [string, Payload] {
  const P: Payload = [t, d, "ar", sec, "", "a", ok, ok ? 1 : 0, 0, 0];
  return [eventId("dev00001", P, rand), P];
}
function page(sec: string, ref: string, k: string, t: number, rand: string = freshRand()): [string, Payload] {
  const P: Payload = [t, Math.floor(t / 1440), "ex", sec, ref, k, k === "c" ? 1 : 0, 1, 0, 0];
  return [eventId("dev00001", P, rand), P];
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
/* the same check as expect(a).toEqual(b), without the cost of one per day of 2,000 histories;
   a difference is reported through expect */
function same(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) expect(a).toEqual(b);
}
const arenaMax = (V: EventSet, sec: string) => Math.max(...Array.from(arenaDays(V, sec).keys()));
const norm = (s: Schedule): Schedule => ({ box: s.box, last: s.last });

describe("dayKeyOf", () => {
  it("is the inverse of dayNumber", () => {
    expect(dayKeyOf(0)).toBe("1970-01-01");
    for (let n = D0 - 200; n < D0 + 200; n++) expect(dayNumber(dayKeyOf(n))).toBe(n);
    for (let i = 0; i < 400; i++) {
      const k = dayKeyOf(D0 + i);
      expect(dayKeyOf(dayNumber(k)!)).toBe(k);
    }
  });
});

describe("proof obligation 1: a step per day equals a step per run", () => {
  /* assets/game.js recordRun places a section once per run. The schedule places it once per
     distinct day. They agree because BOX_DAYS[0] >= 1: a second run on a day that has
     already placed the section is never due, so a clean run changes nothing, and a miss
     gives box 0 and last = that day either way. */
  it("holds over 500 seeded sections", () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const sec = "ch01#s" + i, entries: [string, Payload][] = [];
      let state: unknown = {};
      let day = D0 + r.int(0, 20), last = day;
      const runs = r.int(1, 25);
      for (let j = 0; j < runs; j++) {
        if (r.next() < 0.6) day += r.int(0, 1) === 0 ? 0 : r.int(1, 12);
        const bits: (0 | 1)[] = Array.from({ length: r.int(1, 5) }, () => (r.next() < 0.7 ? 1 : 0));
        state = place(state, bits.some((b) => b === 0), dayKeyOf(day));
        bits.forEach((b) => entries.push(arena(sec, day, b, base36(i * 1000 + entries.length, 8))));
        last = day;
      }
      const V = build(entries);
      const got = scheduleOf(V, sec, dayKeyOf(last + 40));
      expect(got).toEqual({ box: (state as any).box, last: (state as any).last });
    }
  }, LONG);
});

function randomSet(r: ReturnType<typeof rng>, o: { sections?: string[]; maxEntries?: number; maxDays?: number; minDays?: number; cps?: number }): { V: EventSet; days: number[] } {
  const secs = o.sections || ["ch02#a", "ch02#b"];
  const entries: [string, Payload][] = [];
  const nDays = r.int(o.minDays ?? 0, o.maxDays ?? 50);
  const base = D0 - 20 + r.int(0, 10);
  const pool: number[] = [];
  for (let i = 0; i < nDays; i++) pool.push(base + i + r.int(0, 1) * 0);
  const nEntries = nDays === 0 ? 0 : Math.max(o.minDays ?? 0, r.int(0, o.maxEntries ?? 80));
  const used: number[] = [];
  /* every pool day at least once when minDays asks for distinct days */
  for (let i = 0; i < nEntries; i++) {
    const d = (o.minDays && i < nDays) ? pool[i] : r.pick(pool);
    used.push(d);
    entries.push(arena(r.pick(secs), d, r.next() < 0.7 ? 1 : 0));
  }
  const nCp = r.int(0, o.cps ?? 2);
  for (let i = 0; i < nCp && nDays > 0; i++) {
    const s = r.pick(pool) + 1;
    entries.push(cpOf(r.pick(secs), s, r.int(0, 4), s - 1 - r.int(0, 5), r.int(1, 90), 0));
  }
  entries.forEach(([id, P]) => expect(isValid(id, P)).toBe(true));
  return { V: build(entries), days: used };
}

describe("proof obligation 2: prune changes no schedule", () => {
  it("holds over 500 seeded sets", () => {
    const r = rng(22);
    for (let i = 0; i < 500; i++) {
      const { V, days } = randomSet(r, {});
      const last = days.length ? Math.max(...days) : D0, mid = days.length ? days[Math.floor(days.length / 2)] : D0;
      const P = prune(V);
      ["ch02#a", "ch02#b"].forEach((sec) => {
        [dayKeyOf(last), dayKeyOf(last + 40), dayKeyOf(mid)].forEach((today) => {
          expect(scheduleOf(P, sec, today)).toEqual(scheduleOf(V, sec, today));
        });
      });
    }
  }, LONG);
});

describe("proof obligation 3: a checkpoint changes no schedule", () => {
  /* The three todays are at or after the checkpoint's day C (less the slack): a device whose
     clock reads a day before C has not got to the days the checkpoint already folded, and the
     checkpoint, which holds the fold through C, is then ahead of it. The middle day is taken
     from the days from C on. */
  it("holds over 500 seeded sets with at least 30 distinct days", () => {
    const r = rng(33);
    let tested = 0;
    for (let i = 0; i < 500; i++) {
      const sec = "ch03#x";
      const { V } = randomSet(r, { sections: [sec], minDays: 30, maxDays: 50, maxEntries: 120, cps: 1 });
      const cp = checkpoint(V, sec, dayKeyOf(arenaMax(V, sec)));
      if (!cp) continue;
      tested++;
      const D = Array.from(arenaDays(V, sec).keys()), C = cp.P[1];
      const from = D.filter((d) => d >= C), mid = from[Math.floor(from.length / 2)];
      const W = { ...V, [cp.id]: cp.P };
      [D[D.length - 1], D[D.length - 1] + 40, mid].forEach((d) => {
        const today = dayKeyOf(d);
        const want = scheduleOf(V, sec, today);
        expect(scheduleOf(W, sec, today)).toEqual(want);
        expect(scheduleOf(prune(W), sec, today)).toEqual(want);
      });
    }
    expect(tested).toBeGreaterThan(100);
  }, LONG);
});

describe("the future slack", () => {
  it("counts today + 1 and not today + 2; a non-day today folds nothing", () => {
    const today = D0;
    const one = build([arena("ch01#a", today + SCHED_FUTURE_SLACK_DAYS, 1)]);
    expect(scheduleOf(one, "ch01#a", dayKeyOf(today))).toEqual({ box: 1, last: dayKeyOf(today + 1) });
    const two = build([arena("ch01#a", today + SCHED_FUTURE_SLACK_DAYS + 1, 1)]);
    expect(scheduleOf(two, "ch01#a", dayKeyOf(today))).toEqual({ box: 0, last: undefined });
    expect(scheduleOf(one, "ch01#a", "not a day")).toEqual({ box: 0, last: undefined });
    expect(scheduleOf(one, "ch01#a", "")).toEqual({ box: 0, last: undefined });
  });
});

describe("scheduleAll", () => {
  it("lists the sections with an s-entry or a checkpoint, memoised and frozen", () => {
    const V = build([
      arena("ch01#a", D0, 1), arena("ch01#b", D0, 0),
      cpOf("ch01#c", D0, 2, D0 - 2),
      page("ch01#d", "ch01/e1", "c", D0 * 1440),
      arena("", D0, 1)
    ]);
    const all = scheduleAll(V, dayKeyOf(D0 + 5));
    expect(Object.keys(all).sort()).toEqual(["ch01#a", "ch01#b", "ch01#c"]);
    expect(all["ch01#c"]).toEqual({ box: 2, last: dayKeyOf(D0 - 2) });
    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all["ch01#a"])).toBe(true);
    expect(() => { "use strict"; (all["ch01#a"] as any).box = 4; }).toThrow();
    expect(scheduleAll(V, dayKeyOf(D0 + 5))["ch01#a"].box).toBe(1);
    expect(scheduleAll(V, dayKeyOf(D0 + 5))).toBe(all);
    const other = scheduleAll(V, dayKeyOf(D0 + 6));
    expect(other).not.toBe(all);
    expect(other).toEqual(all);
  });
});

describe("the start from a checkpoint", () => {
  it("starts at the checkpoint and ignores the days before S0", () => {
    const sec = "ch01#a";
    const cp = cpOf(sec, D0, 2, D0 - 3);
    const before = arena(sec, D0 - 5, 0);
    const V = build([cp, before]);
    expect(startOf(V, sec).s0).toBe(D0);
    expect(scheduleOf(V, sec, dayKeyOf(D0 + 10))).toEqual({ box: 2, last: dayKeyOf(D0 - 3) });
    const V2 = build([cp, before, arena(sec, D0 + 1, 0)]);
    expect(scheduleOf(V2, sec, dayKeyOf(D0 + 10))).toEqual({ box: 0, last: dayKeyOf(D0 + 1) });
    expect(startOf({}, sec)).toEqual({ start: { box: 0, last: undefined }, s0: -Infinity, W: null });
  });
});

/* ------------------------------------------------------------ the fold test -- */

interface Run { day: number; replay: boolean; straddle: boolean; secs: { sec: string; oks: (0 | 1)[] }[] }

describe("the fold test: events fold to what recordRun would have placed", () => {
  it("holds over 2,000 seeded single-device histories", () => {
    const r = rng(44);
    const rand = (n: number) => base36(n, 8);
    for (let h = 0; h < 2000; h++) {
      const sections = Array.from({ length: r.int(1, 4) }, (_, i) => "ch0" + (i + 1) + "#h" + h);
      const span = r.int(1, 120), nRuns = r.int(1, 40);
      const runs: Run[] = [];
      for (let i = 0; i < nRuns; i++) {
        const how = r.int(1, sections.length);
        const chosen = sections.slice().sort(() => r.next() - 0.5).slice(0, how);
        runs.push({
          day: D0 + r.int(0, span),
          replay: r.int(1, 8) === 1,
          straddle: r.int(1, 10) === 1,
          secs: chosen.map((sec) => ({ sec, oks: Array.from({ length: r.int(1, 5) }, () => (r.next() < 0.65 ? 1 : 0) as 0 | 1) }))
        });
      }
      /* played in order of the dealt day */
      runs.sort((a, b) => a.day - b.day);
      let n = 0;
      /* build entries run by run, so the checkpoints can come in as the days pass */
      const entriesOf = (run: Run): [string, Payload][] => {
        if (run.replay) return [];
        const out: [string, Payload][] = [];
        run.secs.forEach(({ sec, oks }) => oks.forEach((ok, j) => {
          /* A run that straddles midnight is dated by its dealt day on both sides: recordRun
             takes `result.day` and the event's d is dayNumber(result.day) for every answer,
             so an answer given after midnight (its minute t falls in the next day, which the
             format allows) still lands on the dealt day. It is a no-op by construction. */
          const t = run.day * 1440 + (run.straddle && j > 0 ? 1440 + 5 : 600);
          out.push(arena(sec, run.day, ok, rand(h * 100_000 + (n++)), t));
        }));
        return out;
      };
      const noise = Array.from({ length: r.int(0, 10) }, () => {
        const sec = r.pick(sections), kind = r.pick(["c", "o", "h"]);
        return page(sec, "ch01/e" + r.int(1, 3), kind, (D0 + r.int(0, span)) * 1440 + 30, rand(h * 100_000 + 50_000 + (n++)));
      });

      /* what recordRun would have left, run by run: the state of every section after each
         prefix of the runs, in one forward pass */
      const prefix: Record<string, Schedule>[] = [];
      {
        let state: Record<string, Schedule> = {};
        sections.forEach((s) => { state[s] = { box: 0, last: undefined }; });
        prefix.push(state);
        runs.forEach((run) => {
          if (!run.replay) {
            state = { ...state };
            run.secs.forEach(({ sec, oks }) => {
              const p = place(state[sec], oks.some((b) => b === 0), dayKeyOf(run.day));
              state[sec] = { box: p.box, last: p.last as string | undefined };
            });
          }
          prefix.push(state);
        });
      }
      /* the runs with a dealt day up to `day` (runs are in dealt-day order) */
      const upTo = (day: number): number => {
        let k = 0;
        while (k < runs.length && runs[k].day <= day) k++;
        return k;
      };
      const agree = (V: EventSet, X: number, played: number, from: Record<string, number>) => {
        const want = prefix[played], day = dayKeyOf(X), rowsOf = (get: (s: string) => Schedule) =>
          sections.filter((id) => !(X < from[id])).map((id) => { const s = get(id); return { id, due: dueOn(s, day), arena: true, box: s.box, last: s.last }; });
        const folded: Record<string, Schedule> = {};
        sections.forEach((sec) => { if (!(X < from[sec])) folded[sec] = scheduleOf(V, sec, day); });
        const got = (s: string) => folded[s];
        sections.forEach((sec) => {
          if (X < from[sec]) return;
          same(norm(got(sec)), norm(want[sec]));
          same(checkDue({ ...got(sec) }, day), checkDue({ ...want[sec] }, day));
        });
        same(dueSplit(rowsOf(got), day), dueSplit(rowsOf((s) => want[s]), day));
      };

      const first = runs[0].day, last = runs[runs.length - 1].day;
      /* the days compared: every dealt day, the day after each, every seventh day of the
         span, and last + 40 */
      const pick = new Set<number>([last + 40]);
      runs.forEach((run) => { pick.add(run.day); pick.add(run.day + 1); });
      for (let X = first; X <= last; X += 7) pick.add(X);
      const sampled = Array.from(pick).sort((a, b) => a - b);
      const noFrom: Record<string, number> = {};
      sections.forEach((s) => { noFrom[s] = -Infinity; });
      const all: [string, Payload][] = [];
      const made = new Map<Run, [string, Payload][]>();
      runs.forEach((run) => { const e = entriesOf(run); made.set(run, e); all.push(...e); });
      all.push(...noise);
      if (h < 100) all.forEach(([id, P]) => same(isValid(id, P), true));

      /* pruned alone */
      const V1 = prune(build(all));
      sampled.forEach((X) => agree(V1, X, upTo(X + SCHED_FUTURE_SLACK_DAYS), noFrom));

      /* with checkpoints written every 20 days as the history goes */
      let V: EventSet = {};
      const writeCheckpoints = (today: number) => {
        sections.forEach((sec) => {
          const cp = checkpoint(V, sec, dayKeyOf(today));
          if (cp) { expect(isValid(cp.id, cp.P)).toBe(true); V[cp.id] = cp.P; }
        });
        V = prune(V);
      };
      const from = (): Record<string, number> => {
        const out: Record<string, number> = {};
        const W = winners(V);
        sections.forEach((s) => { out[s] = W[s] ? (W[s].P[10] as any).s - 1 : -Infinity; });
        return out;
      };
      for (let day = first; day <= last; day++) {
        runs.filter((run) => run.day === day).forEach((run) => {
          made.get(run)!.forEach(([id, P]) => { V[id] = P; });
        });
        noise.filter(([, P]) => P[1] === day).forEach(([id, P]) => { V[id] = P; });
        if ((day - first) % 20 === 19) {
          writeCheckpoints(day);
          agree(V, day, upTo(day), from());
        }
      }
      writeCheckpoints(last);
      const f = from();
      sampled.forEach((X) => agree(V, X, upTo(X + SCHED_FUTURE_SLACK_DAYS), f));
      sections.forEach((sec) => {
        const count = Object.values(V).filter((P) => classOf(P) === "s" && P[3] === sec).length;
        expect(count).toBeLessThanOrEqual((2 * SCHED_KEEP + 2) * 5);
      });
    }
  }, LONG);
});
