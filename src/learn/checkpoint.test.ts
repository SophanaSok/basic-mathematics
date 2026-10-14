import { describe, expect, it } from "vitest";
import { base36, checkpointId, eventId, isValid, prune, winners, type EventSet, type Payload } from "../sync/events.ts";
import { checkpoint } from "./checkpoint.ts";
import { SCHED_KEEP } from "./constants.ts";
import { dayNumber, place } from "./recall.ts";
import { arenaDays, dayKeyOf, scheduleOf, type Schedule } from "./schedule.ts";

const D0 = dayNumber("2026-10-01")!;
const SEC = "ch04#one";
const LONG = 60_000;
/* a day after every fixture day below */
const TODAY = dayKeyOf(D0 + 400);

let counter = 0;
function arena(sec: string, d: number, ok: 0 | 1): [string, Payload] {
  const P: Payload = [d * 1440 + 600, d, "ar", sec, "", "a", ok, ok ? 1 : 0, 0, 0];
  return [eventId("dev00001", P, base36(++counter, 8)), P];
}
function cpOf(sec: string, s: number, b: number, l: number, n: number, o: number): [string, Payload] {
  const P: Payload = [(s - 1) * 1440, s - 1, "cp", sec, "", "z", 0, 0, 0, 0, { b, l, s, n, o }];
  return [checkpointId(P), P];
}
function build(entries: [string, Payload][]): EventSet {
  const V: EventSet = {};
  entries.forEach(([id, P]) => { V[id] = P; });
  return V;
}
/* one entry on each of the given days, right unless the day is in `miss` */
function onDays(days: number[], miss: number[] = [], sec = SEC): [string, Payload][] {
  return days.map((d) => arena(sec, d, miss.includes(d) ? 0 : 1));
}
/* distinct days with gaps, n of them */
function gappy(n: number): number[] {
  const out: number[] = [];
  let d = D0;
  for (let i = 0; i < n; i++) { out.push(d); d += 1 + (i % 3); }
  return out;
}
function fold(start: Schedule, days: number[], miss: number[]): Schedule {
  let s: Schedule = start;
  days.forEach((d) => {
    const p = place(s, miss.includes(d), dayKeyOf(d));
    s = { box: p.box, last: p.last as string | undefined };
  });
  return s;
}

describe("when a checkpoint is due", () => {
  it("needs 2 x SCHED_KEEP distinct days, and C is the 13th newest", () => {
    const need = 2 * SCHED_KEEP;
    expect(checkpoint({}, SEC, TODAY)).toBeNull();
    expect(checkpoint(build(onDays(gappy(need - 1))), SEC, TODAY)).toBeNull();
    const days = gappy(need);
    const cp = checkpoint(build(onDays(days)), SEC, TODAY);
    expect(cp).not.toBeNull();
    expect(cp!.P[1]).toBe(days[days.length - 1 - SCHED_KEEP]);
    const more = gappy(30);
    expect(checkpoint(build(onDays(more)), SEC, TODAY)!.P[1]).toBe(more[more.length - 13]);
  });

  it("counts several entries on one day as one day", () => {
    const days = gappy(2 * SCHED_KEEP - 1);
    const V = build([...onDays(days), ...onDays(days), ...onDays(days)]);
    expect(checkpoint(V, SEC, TODAY)).toBeNull();
    const W = build([...onDays(days), ...onDays(days), ...onDays([days[days.length - 1] + 1])]);
    expect(checkpoint(W, SEC, TODAY)).not.toBeNull();
  });

  it("is for one section only", () => {
    const V = build([...onDays(gappy(30)), ...onDays(gappy(5), [], "ch04#two")]);
    expect(checkpoint(V, "ch04#two", TODAY)).toBeNull();
    expect(checkpoint(V, "ch04#none", TODAY)).toBeNull();
  });
});

describe("the entry", () => {
  it("is valid, content-addressed, and the same whatever the key order", () => {
    const V = build(onDays(gappy(30), [gappy(30)[4]]));
    const cp = checkpoint(V, SEC, TODAY)!;
    expect(isValid(cp.id, cp.P)).toBe(true);
    expect(cp.id).toBe(checkpointId(cp.P));
    const reversed: EventSet = {};
    Object.keys(V).reverse().forEach((id) => { reversed[id] = V[id]; });
    const again = checkpoint(reversed, SEC, TODAY)!;
    expect(again.id).toBe(cp.id);
    expect(again.P).toEqual(cp.P);
  });

  it("holds the fold through C, the next day as s, and the counts", () => {
    const days = gappy(30), miss = [days[3], days[20]];
    const V = build(onDays(days, miss));
    const cp = checkpoint(V, SEC, TODAY)!, C = days[days.length - 13], upTo = days.filter((d) => d <= C);
    const want = fold({ box: 0, last: undefined }, upTo, miss);
    const x = cp.P[10] as any;
    expect(x.b).toBe(want.box);
    expect(dayKeyOf(x.l)).toBe(want.last);
    expect(x.s).toBe(C + 1);
    expect(x.n).toBe(upTo.length);
    expect(x.o).toBe(upTo.filter((d) => !miss.includes(d)).length);
    expect(cp.P.slice(0, 10)).toEqual([C * 1440, C, "cp", SEC, "", "z", 0, 0, 0, 0]);
  });

  it("builds on an earlier checkpoint and ignores the days before it", () => {
    const S = D0 + 100;
    const earlier = cpOf(SEC, S, 3, S - 4, 50, 40);
    const days = Array.from({ length: 30 }, (_, i) => S + i);
    const before = onDays([S - 10, S - 9, S - 8], [S - 9]);
    const V = build([earlier, ...before, ...onDays(days, [days[2]])]);
    const cp = checkpoint(V, SEC, TODAY)!, C = days[days.length - 13];
    const upTo = days.filter((d) => d <= C);
    const x = cp.P[10] as any;
    expect(x.n).toBe(50 + upTo.length);
    expect(x.o).toBe(40 + upTo.length - 1);
    const want = fold({ box: 3, last: dayKeyOf(S - 4) }, upTo, [days[2]]);
    expect(x.b).toBe(want.box);
    expect(dayKeyOf(x.l)).toBe(want.last);
    expect(isValid(cp.id, cp.P)).toBe(true);
  });

  it("caps the counts so the entry stays valid", () => {
    const S = D0 + 100;
    const big = cpOf(SEC, S, 1, S - 2, 999_999, 999_999);
    const days = Array.from({ length: 30 }, (_, i) => S + i);
    const cp = checkpoint(build([big, ...onDays(days)]), SEC, TODAY)!;
    expect((cp.P[10] as any).n).toBe(1_000_000);
    expect((cp.P[10] as any).o).toBe(1_000_000);
    expect(isValid(cp.id, cp.P)).toBe(true);
  });
});

describe("the clock", () => {
  it("leaves out days past today + 1, and refuses a today that is not a day", () => {
    const days = gappy(30), V = build(onDays(days));
    const at = dayKeyOf(days[days.length - 1]);
    const base = checkpoint(V, SEC, at)!;
    /* more answers on the newest day add no day, so C stays */
    const same = checkpoint({ ...V, ...build([arena(SEC, days[days.length - 1], 1)]) }, SEC, at)!;
    expect(same.id).toBe(base.id);
    /* days a year ahead are not counted: a wrong clock cannot move C into the future */
    const ahead = Array.from({ length: 13 }, (_, i) => D0 + 365 + i);
    const W = { ...V, ...build(onDays(ahead)) };
    const cp = checkpoint(W, SEC, at)!;
    expect(cp.id).toBe(base.id);
    expect(cp.P[1]).toBeLessThanOrEqual(days[days.length - 1] + 1);
    const today = at;
    const want = scheduleOf(V, SEC, today);
    expect(scheduleOf({ ...W, [cp.id]: cp.P }, SEC, today)).toEqual(want);
    expect(scheduleOf(prune({ ...W, [cp.id]: cp.P }), SEC, today)).toEqual(want);
    /* a miss played today still gives box 0 */
    const miss = build([arena(SEC, days[days.length - 1] + 1, 0)]);
    expect(scheduleOf(prune({ ...W, [cp.id]: cp.P, ...miss }), SEC, dayKeyOf(days[days.length - 1] + 1)))
      .toEqual({ box: 0, last: dayKeyOf(days[days.length - 1] + 1) });
    expect(checkpoint(V, SEC, "not a day")).toBeNull();
  });

  it("is null for the section \"\" and never an invalid entry", () => {
    const empty = build(onDays(gappy(30), [], ""));
    expect(checkpoint(empty, "", TODAY)).toBeNull();
    /* an edge date: C below d = 18750 would put t below T_MIN (the fixtures are not valid
       entries either), and the checkpoint is not built */
    const edge = Array.from({ length: 30 }, (_, i) => 18_000 + i);
    const E = build(edge.map((d) => arena(SEC, d, 1)));
    const cp = checkpoint(E, SEC, dayKeyOf(18_100));
    expect(cp).toBeNull();
  });
});

describe("300 days of one section", () => {
  it("keeps the log short and the schedule the same", () => {
    let V: EventSet = {};
    let H: EventSet = {};
    const miss = (i: number) => i % 7 === 3 || i % 11 === 5;
    for (let i = 0; i < 300; i++) {
      const d = D0 + i;
      const adds = [arena(SEC, d, miss(i) ? 0 : 1)];
      if (i % 4 === 0) adds.push(arena(SEC, d, 1));
      adds.forEach(([id, P]) => { V[id] = P; H[id] = P; });
      const cp = checkpoint(V, SEC, dayKeyOf(d));
      if (cp) V[cp.id] = cp.P;
      V = prune(V);
      expect(scheduleOf(V, SEC, dayKeyOf(d))).toEqual(scheduleOf(H, SEC, dayKeyOf(d)));
    }
    const cps = Object.values(V).filter((P) => P[5] === "z");
    expect(cps).toHaveLength(1);
    /* a checkpoint leaves SCHED_KEEP days and is next written at 2 x SCHED_KEEP, so a log
       holds up to 2 x SCHED_KEEP - 1 */
    expect(arenaDays(V, SEC).size).toBeLessThanOrEqual(2 * SCHED_KEEP - 1);
    expect(Object.keys(V).length).toBeLessThan(Object.keys(H).length / 4);
  }, LONG);
});

describe("competing checkpoints", () => {
  it("start from the winner, and the next one builds on its counts", () => {
    const S1 = D0 + 100, S2 = D0 + 110;
    const low = cpOf(SEC, S1, 4, S1 - 1, 900, 800);
    const high = cpOf(SEC, S2, 1, S2 - 3, 70, 60);
    const days = Array.from({ length: 30 }, (_, i) => S2 + i);
    const V = build([low, high, ...onDays(days)]);
    expect(winners(V)[SEC].id).toBe(high[0]);
    expect(scheduleOf(build([low, high]), SEC, dayKeyOf(S2 + 5))).toEqual({ box: 1, last: dayKeyOf(S2 - 3) });
    const cp = checkpoint(V, SEC, TODAY)!, C = days[days.length - 13];
    const x = cp.P[10] as any;
    expect(x.n).toBe(70 + days.filter((d) => d <= C).length);
    expect(x.o).toBe(60 + days.filter((d) => d <= C).length);
    const want = fold({ box: 1, last: dayKeyOf(S2 - 3) }, days.filter((d) => d <= C), []);
    expect(x.b).toBe(want.box);
    expect(dayKeyOf(x.l)).toBe(want.last);
  });
});
