import { describe, expect, it, vi } from "vitest";
import { checkpoint } from "../learn/checkpoint.ts";
import { dayNumber } from "../learn/recall.ts";
import { eventId, isValid, type EventSet, type Payload } from "../sync/events.ts";
import { DEVICE_KEY, EVENTS_KEY, OUTBOX_KEY } from "../learn/recorder.ts";
import { install } from "./events.ts";

const TODAY = "2026-10-14";
const D = dayNumber(TODAY)!;

function fake(opts: { writeResult?: boolean; writeThrows?: boolean; noStore?: boolean; mem?: Map<string, string>; failWrites?: { n: number } } = {}) {
  const mem = opts.mem || new Map<string, string>();
  const listeners: ((c: any) => void)[] = [];
  const emitted: any[] = [];
  const warn = vi.fn(), error = vi.fn();
  const Store = {
    read: (k: string, fb: unknown) => { const r = mem.get(k); return r ? JSON.parse(r) : fb; },
    write: vi.fn((k: string, v: unknown) => {
      if (opts.writeThrows) throw new Error("boom");
      if (opts.writeResult === false) return false;
      if (opts.failWrites && k === EVENTS_KEY && opts.failWrites.n > 0) { opts.failWrites.n--; return false; }
      mem.set(k, JSON.stringify(v)); return true;
    }),
    on: vi.fn((fn: (c: any) => void) => { listeners.push(fn); }),
    emit: (c: any) => { emitted.push(c); listeners.slice().forEach((fn) => fn(c)); }
  };
  const storage: ((e: any) => void)[] = [];
  const win: any = {
    BMSite: { dayKey: () => TODAY },
    addEventListener: (_t: string, fn: any) => { storage.push(fn); },
    localStorage: { removeItem: (k: string) => { mem.delete(k); } },
    console: { warn, error }
  };
  if (!opts.noStore) win.BMStore = Store;
  const api = install(win);
  const seed = (k: string, v: unknown) => { mem.set(k, JSON.stringify(v)); };
  const get = (k: string): any => { const r = mem.get(k); return r ? JSON.parse(r) : undefined; };
  return { win, api, Store, mem, emitted, warn, error, seed, get, storage };
}
const att = (extra: object = {}) => ({ type: "attempt", chapter: "ch02", key: "e3", section: "one-unknown", correct: true, tryNo: 1, ...extra });
const run = (k: number, sec = (i: number) => "ch02#s" + i, day = TODAY) => ({ day, answers: Array.from({ length: k }, (_, i) => ({ section: sec(i), g: "g" + i, first: true, el: 4321, pts: 7 })) });
const kinds = (api: { all(): EventSet }) => Object.values(api.all()).map((P) => P[5]);

describe("install", () => {
  it("puts the api up and listens once", () => {
    const f = fake();
    expect(Object.keys(f.api)).toEqual(["all", "version", "ahead", "device", "record", "fromRun", "clear", "stamp", "outbox", "enqueue", "dequeue", "payloads", "absorb", "scheduleAll", "schedule", "mastery", "bandOf"]);
    expect(f.Store.on).toHaveBeenCalledTimes(1);
  });
  it("records an attempt, and no secret reaches storage", () => {
    const f = fake();
    f.Store.emit(att({ given: "SECRET-7Q", typed: "SECRET-7Q" }));
    const stored = f.get(EVENTS_KEY);
    const ids = Object.keys(stored.ev);
    expect(ids).toHaveLength(1);
    expect(isValid(ids[0], stored.ev[ids[0]])).toBe(true);
    expect(f.emitted.filter((c) => c.type === "event")).toEqual([{ type: "event", n: 1 }]);
    expect(Object.keys(f.api.all())).toEqual(ids);
    expect(f.mem.get(EVENTS_KEY)).not.toContain("SECRET-7Q");
  });
  it("opened solved writes nothing; ladder and skipped write h and s", () => {
    const f = fake();
    f.Store.emit({ type: "opened", chapter: "ch02", key: "e3", section: "x", solved: true, ex: { tagName: "DIV" } });
    expect(f.mem.has(EVENTS_KEY)).toBe(false);
    f.Store.emit({ type: "ladder", chapter: "ch02", key: "e3", section: "x", rung: 2 });
    f.Store.emit({ type: "skipped", chapter: "ch02", key: "e4", section: "x" });
    const P = Object.values(f.api.all());
    expect(P.map((p) => p[5]).sort()).toEqual(["h", "s"]);
    expect(P.find((p) => p[5] === "h")![8]).toBe(2);
  });
  it("merges two records and replaces junk", () => {
    const f = fake();
    f.Store.emit(att({ key: "e1" }));
    f.Store.emit(att({ key: "e2" }));
    expect(Object.keys(f.api.all())).toHaveLength(2);
    expect(f.get(EVENTS_KEY).v).toBe(1);
    f.seed(EVENTS_KEY, { v: 1, ev: { junk: [1], "x-y-z": 5 } });
    f.Store.emit(att({ key: "e3" }));
    expect(Object.keys(f.get(EVENTS_KEY).ev)).toHaveLength(1);
  });
  it("fromRun writes a run in one write and one emit", () => {
    const f = fake();
    f.api.device();
    f.Store.write.mockClear();
    expect(f.api.fromRun(run(10))).toBe(10);
    expect(f.Store.write.mock.calls.filter((c) => c[0] === EVENTS_KEY)).toHaveLength(1);
    expect(f.emitted.filter((c) => c.type === "event")).toEqual([{ type: "event", n: 10 }]);
    expect(Object.keys(f.api.all())).toHaveLength(10);
    expect(f.api.fromRun({ ...run(2), replay: true })).toBe(0);
  });
  it("keeps one device id, stamps and clears", () => {
    const f = fake();
    const id = f.api.device();
    expect(id).toMatch(/^[0-9a-z]{8}$/);
    expect(f.api.device()).toBe(id);
    f.Store.emit(att());
    f.seed(OUTBOX_KEY, { x: 1 });
    f.api.clear();
    expect(f.mem.has(EVENTS_KEY) || f.mem.has(OUTBOX_KEY)).toBe(false);
    const id2 = f.api.device();
    expect(id2).not.toBe(id);
    f.api.stamp("u1");
    expect(f.get(DEVICE_KEY)).toEqual({ id: id2, uid: "u1" });
    f.Store.emit(att());
    f.api.stamp("u1");
    expect(Object.keys(f.api.all())).toHaveLength(1);
    expect(f.api.device()).toBe(id2);
    f.api.stamp("u2");
    expect(f.mem.has(EVENTS_KEY)).toBe(false);
    expect(f.api.device()).not.toBe(id2);
    expect(f.get(DEVICE_KEY).uid).toBe("u2");
  });
  it("stamp(null) keeps the id of an anonymous record, and a first sign-in keeps its log", () => {
    const f = fake();
    f.Store.emit(att());
    const id = f.api.device();
    f.api.stamp(null);
    expect(f.api.device()).toBe(id);
    f.api.stamp("u1");
    expect(f.api.device()).toBe(id);
    expect(Object.keys(f.api.all())).toHaveLength(1);
  });
  it("writes nothing when the log is ahead", () => {
    const f = fake();
    f.seed(EVENTS_KEY, { v: 2, ev: {} });
    expect(f.api.ahead()).toBe(true);
    f.Store.write.mockClear();
    expect(f.api.record([D * 1440, D, "ex", "", "ch02/e3", "c", 1, 1, 0, 0])).toBeNull();
    expect(f.api.fromRun(run(2))).toBe(0);
    f.Store.emit(att());
    expect(f.Store.write).not.toHaveBeenCalled();
    f.seed(EVENTS_KEY, { v: "2", ev: {} });
    expect(f.api.version()).toBe(1);
    expect(f.api.ahead()).toBe(false);
  });
  it("writes a checkpoint and prunes behind it", () => {
    const f = fake();
    const sec = "ch02#s0";
    const ev: EventSet = {};
    for (let i = 0; i < 24; i++) {
      const d = D - 30 + i, P: Payload = [d * 1440, d, "ar", sec, "g:g0", "a", 1, 1, 0, 0];
      ev[eventId("dev00001", P, "r" + String(i).padStart(7, "0"))] = P;
    }
    f.seed(EVENTS_KEY, { v: 1, ev });
    const newP: Payload = [D * 1440, D, "ar", sec, "g:g0", "a", 1, 1, 0, 0];
    const want = checkpoint({ ...ev, [eventId("dev00001", newP, "rnew0001")]: newP }, sec, TODAY)!;
    expect(want).not.toBeNull();
    expect(f.api.fromRun(run(1, () => sec))).toBe(1);
    const after = f.api.all();
    const zs = Object.values(after).filter((P) => P[5] === "z");
    expect(zs).toHaveLength(1);
    const s = (zs[0][10] as any).s;
    expect(s).toBe((want.P[10] as any).s);
    expect(s).toBe(D - 30 + 12 + 1);
    Object.values(after).filter((P) => P[5] === "a").forEach((P) => expect(P[1]).toBeGreaterThanOrEqual(s));
  });
  it("keeps the entry when the write returns false, and survives one that throws", () => {
    const a = fake({ writeResult: false });
    const id = a.api.record([D * 1440, D, "ex", "ch02#x", "ch02/e3", "c", 1, 1, 0, 0]);
    expect(id).toBeTruthy();
    expect(Object.keys(a.api.all())).toEqual([id]);
    a.api.record([D * 1440 + 1, D, "ex", "ch02#x", "ch02/e4", "c", 1, 1, 0, 0]);
    expect(a.warn).toHaveBeenCalledTimes(1);
    expect(Object.keys(a.api.all())).toHaveLength(2);
    const b = fake({ writeThrows: true });
    expect(b.api.record([D * 1440, D, "ex", "ch02#x", "ch02/e3", "c", 1, 1, 0, 0])).toBeNull();
    expect(b.api.fromRun(run(2))).toBe(0);
    expect(b.warn).toHaveBeenCalledTimes(1);
  });
  it("clears on reset", () => {
    const f = fake();
    f.Store.emit(att());
    const id = f.api.device();
    f.Store.emit({ type: "reset" });
    expect(f.mem.has(EVENTS_KEY)).toBe(false);
    expect(f.api.device()).not.toBe(id);
  });
  it("catches a change that throws", () => {
    const f = fake();
    const bad = { type: "attempt", chapter: "ch02", key: "e3", section: "x", get tryNo(): number { throw new Error("no"); } };
    expect(() => f.Store.emit(bad)).not.toThrow();
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.mem.has(EVENTS_KEY)).toBe(false);
  });
  it("drops its cache on a storage event", () => {
    const f = fake();
    f.Store.emit(att());
    expect(Object.keys(f.api.all())).toHaveLength(1);
    f.mem.delete(EVENTS_KEY);
    expect(Object.keys(f.api.all())).toHaveLength(1);
    f.storage.forEach((fn) => fn({ key: EVENTS_KEY }));
    expect(Object.keys(f.api.all())).toHaveLength(0);
  });
  it("clear(true) forgets the account, clear() keeps it", () => {
    const f = fake();
    f.api.stamp("u1");
    f.Store.emit(att());
    const id = f.api.device();
    f.api.clear();
    expect(f.get(DEVICE_KEY).uid).toBe("u1");
    expect(f.api.device()).not.toBe(id);
    f.Store.emit(att());
    f.api.clear(true);
    expect(Object.keys(f.get(DEVICE_KEY))).toEqual(["id"]);
    expect(f.mem.has(EVENTS_KEY)).toBe(false);
  });
  for (const how of ["stamp", "clear"] as const) {
    it("a failed write kept in one tab does not bring back a log another tab wiped (" + how + ")", () => {
      const mem = new Map<string, string>();
      const failWrites = { n: 1 };
      const A = fake({ mem }), B = fake({ mem, failWrites });
      A.api.stamp("u1");
      B.Store.emit(att({ key: "e1" }));
      expect(B.warn).toHaveBeenCalledTimes(1);
      if (how === "stamp") A.api.stamp("u2"); else A.api.clear();
      expect(mem.has(EVENTS_KEY)).toBe(false);
      const newDev = A.api.device();
      B.storage.forEach((fn) => fn({ key: DEVICE_KEY }));
      B.Store.emit(att({ key: "e2" }));
      const ids = Object.keys(A.get(EVENTS_KEY).ev);
      expect(ids).toHaveLength(1);
      expect(ids[0].slice(0, 8)).toBe(newDev);
      expect(A.get(EVENTS_KEY).ev[ids[0]][4]).toBe("ch02/e2");
    });
  }
  it("a held copy is dropped by device id even with no storage event", () => {
    const mem = new Map<string, string>();
    const A = fake({ mem }), B = fake({ mem, failWrites: { n: 1 } });
    B.Store.emit(att({ key: "e1" }));
    A.api.clear();
    B.Store.emit(att({ key: "e2" }));
    expect(Object.keys(A.get(EVENTS_KEY).ev)).toHaveLength(1);
  });
  it("with no BMStore logs once and does nothing", () => {
    const f = fake({ noStore: true });
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.error.mock.calls[0][0]).toBe("[BM] BMStore missing");
    expect(f.api.record([D * 1440, D, "ex", "", "ch02/e3", "c", 1, 1, 0, 0])).toBeNull();
    expect(f.api.fromRun(run(2))).toBe(0);
    expect(f.api.all()).toEqual({});
  });
});
