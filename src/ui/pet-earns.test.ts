import { describe, expect, it } from "vitest";
import { mergePet } from "../sync/merge.ts";
import { install } from "./pet-earns.ts";

const TODAY = "2026-10-14";
const KEY = "bm.pet.v1";

function fake(o: { strong?: (s: string) => boolean; placed?: boolean; due?: boolean; noDoc?: boolean } = {}) {
  const mem = new Map<string, string>();
  const listeners: ((c: any) => void)[] = [];
  const emitted: any[] = [];
  const Store = {
    keys: { pet: KEY },
    read: (k: string, fb: unknown) => { const r = mem.get(k); return r ? JSON.parse(r) : fb; },
    write: (k: string, v: unknown) => { mem.set(k, JSON.stringify(v)); Store.emit({ type: "state", key: k }); return true; },
    on: (fn: (c: any) => void) => { listeners.push(fn); },
    emit: (c: any) => { emitted.push(c); listeners.slice().forEach((fn) => fn(c)); }
  };
  const attrs = new Map<string, string>([["hidden", ""], ["aria-label", "No facets yet"]]);
  const b = { textContent: "0" };
  const el = {
    setAttribute: (k: string, v: string) => { attrs.set(k, v); },
    removeAttribute: (k: string) => { attrs.delete(k); },
    hasAttribute: (k: string) => attrs.has(k),
    getAttribute: (k: string) => attrs.get(k),
    querySelector: (s: string) => (s === "b" ? b : null)
  };
  const win: any = {
    BMStore: Store,
    BMEvents: { asked: [] as string[], bandOf: o.strong || ((s: string) => (/^ch\d+#strong/.test(s) ? "strong" : "building")), schedule(s: string) { this.asked.push(s); return { sec: s }; } },
    BMReview: { recall: { isPlaced: () => o.placed !== false, dueOn: () => o.due !== false } },
    BMSite: { dayKey: () => TODAY },
    console: { warn: () => {} }
  };
  if (!o.noDoc) win.document = { querySelector: (s: string) => (s === ".hud-facets" ? el : null) };
  const api = install(win);
  const earned = (): string[] => Object.keys((Store.read(KEY, {}) as any).earned || {}).sort();
  return { win, api, Store, emitted, el, b, earned, emit: Store.emit };
}
/* what site.js sends: the bare section id, the chapter beside it */
const att = (extra: object = {}) => ({ type: "attempt", chapter: "ch02", key: "e3", section: "a", correct: true, tryNo: 1, hintLevel: 0, solutionOpen: false, ...extra });

describe("pet earns", () => {
  it("strong once: the same strong section pays one id, a building band none", () => {
    const f = fake();
    f.emit({ type: "event", n: 1, sec: "ch02#strong1" });
    f.emit({ type: "event", n: 2, sec: "ch02#strong1" });
    f.emit({ type: "event", n: 3, sec: "ch02#weak" });
    expect(f.earned()).toEqual(["strong:ch02#strong1"]);
    expect(f.emitted.filter((c) => c.type === "pet")).toEqual([{ type: "pet", what: "earn", id: "strong:ch02#strong1" }]);
    expect((f.Store.read(KEY, {}) as any).earned["strong:ch02#strong1"]).toBe(1);
  });
  it("medal path independence: gold pays the three levels, a later silver adds nothing, devices merge to one set", () => {
    const f = fake(), g = fake();
    f.emit({ type: "encounter", chapter: "ch03", set: "practice", medal: 3 });
    expect(f.earned()).toEqual(["medal:ch03:practice:1", "medal:ch03:practice:2", "medal:ch03:practice:3"]);
    f.emit({ type: "encounter", chapter: "ch03", set: "practice", medal: 2 });
    expect(f.earned()).toHaveLength(3);
    g.emit({ type: "encounter", chapter: "ch03", set: "practice", medal: 2 });
    g.emit({ type: "encounter", chapter: "ch03", set: "practice", medal: 3 });
    const a = mergePet(f.Store.read(KEY, {}), g.Store.read(KEY, {})), b = mergePet(g.Store.read(KEY, {}), f.Store.read(KEY, {}));
    expect(Object.keys(a.earned).sort()).toEqual(f.earned());
    expect(Object.keys(b.earned).sort()).toEqual(f.earned());
  });
  it("arena recorded: medal ids and review ids; no set, no medal; a bad day, no review", () => {
    const f = fake();
    f.emit({ type: "arena", phase: "recorded", set: "ch05/practice", medal: 2, day: TODAY, due: ["ch05#a", "ch05#b"] });
    expect(f.earned()).toEqual(["medal:ch05:practice:1", "medal:ch05:practice:2", "review:" + TODAY + ":ch05#a", "review:" + TODAY + ":ch05#b"]);
    const g = fake();
    g.emit({ type: "arena", phase: "recorded", set: undefined, medal: 2, day: TODAY, due: [] });
    expect(g.earned()).toEqual([]);
    const h = fake();
    h.emit({ type: "arena", phase: "recorded", set: "ch05/practice", medal: 0, day: "yesterday", due: ["ch05#a"] });
    expect(h.earned()).toEqual([]);
    h.emit({ type: "arena", phase: "answer", set: "ch05/practice", medal: 3, day: TODAY, due: ["ch05#a"] });
    expect(h.earned()).toEqual([]);
  });
  it("page attempt: a placed due section pays one review id, the rest none", () => {
    const f = fake();
    f.emit(att());
    f.emit(att());
    f.emit(att({ section: "ch02#a" }));    /* an already qualified id is the same review */
    expect(f.earned()).toEqual(["review:" + TODAY + ":ch02#a"]);
    expect(f.win.BMEvents.asked).toEqual(["ch02#a", "ch02#a", "ch02#a"]);
    const cases: [string, object, any?][] = [
      ["never placed", {}, { placed: false }],
      ["not due", {}, { due: false }],
      ["second try", { tryNo: 2 }],
      ["hinted", { hintLevel: 1 }],
      ["solution open", { solutionOpen: true }],
      ["wrong", { correct: false }],
      ["empty section", { section: "" }],
      ["no chapter", { chapter: "" }],
      ["a section of another shape", { section: "not a ref!" }]
    ];
    for (const [, extra, o] of cases) {
      const g = fake(o || {});
      g.emit(att(extra));
      expect(g.earned()).toEqual([]);
    }
  });
  it("compare and mission: fresh or not, one id each", () => {
    const f = fake();
    f.emit({ type: "compare", chapter: "ch02", key: "e3", fresh: true });
    f.emit({ type: "compare", chapter: "ch02", key: "e3", fresh: false });
    f.emit({ type: "mission", chapter: "ch02", key: "m1", fresh: true });
    f.emit({ type: "mission", chapter: "ch02", key: "m1", fresh: false });
    expect(f.earned()).toEqual(["compare:ch02/e3", "mission:ch02/m1"]);
  });
  it("balance shown: the slot reads the balance, loses hidden, and an empty pet keeps it hidden", () => {
    const f = fake();
    expect(f.el.hasAttribute("hidden")).toBe(true);
    f.api.repaint();
    expect(f.el.hasAttribute("hidden")).toBe(true);
    expect(f.b.textContent).toBe("0");
    f.emit({ type: "event", n: 1, sec: "ch02#strong1" });
    expect(f.b.textContent).toBe("20");
    expect(f.el.hasAttribute("hidden")).toBe(false);
    expect(f.el.getAttribute("aria-label")).toBe("20 facets for Mochi's pool.");
    expect(f.api.balance()).toBe(20);
  });
  it("a balance below zero shows as 0, and the slot stays shown", () => {
    const f = fake();
    f.Store.write(KEY, { v: 1, earned: { "strong:ch02#x": 1 }, spent: { "buy:2026-10-01:hat:d1:1": 30 } });
    expect(f.api.balance()).toBe(-10);
    expect(f.b.textContent).toBe("0");
    expect(f.el.getAttribute("aria-label")).toBe("0 facets for Mochi's pool.");
    expect(f.el.hasAttribute("hidden")).toBe(false);
  });
  it("a sixth review id of a day is stored under the cap but announced as nothing", () => {
    const f = fake();
    const secs = ["ch02#b", "ch02#c", "ch02#d", "ch02#e", "ch02#f"];
    f.emit({ type: "arena", phase: "recorded", set: undefined, medal: 0, day: TODAY, due: secs });
    expect(f.api.balance()).toBe(25);
    const before = f.emitted.filter((c) => c.type === "pet").length;
    expect(f.api.earn("review:" + TODAY + ":ch02#a")).toBe(false);
    expect(f.api.balance()).toBe(25);
    expect(f.emitted.filter((c) => c.type === "pet").length).toBe(before);
  });
  it("learning fills: a recorded Arena run fills Play once, a due section fills Spark once, a bare set neither blocks the other", () => {
    const f = fake();
    f.emit({ type: "arena", phase: "recorded", set: "ch05/practice", medal: 0, day: TODAY, due: ["ch05#a", "ch05#b"] });
    const pet = () => f.Store.read(KEY, {}) as any;
    expect(pet().care[TODAY].runs).toBe(1);
    expect(pet().care[TODAY].spark).toBe(2);
    expect(f.emitted.filter((c) => c.type === "pet" && c.what === "care").map((c) => c.id)).toEqual(["spark", "spark", "play"]);
    f.emit({ type: "arena", phase: "answer", set: "ch05/practice", day: TODAY, due: ["ch05#a"] });
    expect(pet().care[TODAY].runs).toBe(1);
    f.emit({ type: "arena", phase: "recorded", set: undefined, medal: 0, day: TODAY, due: [] });
    expect(pet().care[TODAY].runs).toBe(2);
  });
  it("Spark fills from a page attempt even when the earn cap pays nothing, and not for a section that is not due", () => {
    const f = fake();
    for (let i = 1; i <= 7; i++) f.emit(att({ section: "ch02#s" + i }));
    expect(f.earned()).toHaveLength(5);
    expect((f.Store.read(KEY, {}) as any).care[TODAY].spark).toBe(7);
    const g = fake({ due: false });
    g.emit(att());
    expect(g.Store.read(KEY, null)).toBe(null);
  });
  it("fills stop at ten a day and write nothing after stale", () => {
    const f = fake();
    for (let i = 0; i < 12; i++) f.api.fill("play");
    expect((f.Store.read(KEY, {}) as any).care[TODAY].runs).toBe(10);
    f.emit({ type: "stale" });
    expect(f.api.fill("spark")).toBe(false);
    expect((f.Store.read(KEY, {}) as any).care[TODAY].spark).toBeUndefined();
  });
  it("earned never gains a key with earnAmount 0", () => {
    const f = fake();
    expect(f.api.earn("nonsense:x")).toBe(false);
    expect(f.api.earn("medal:ch02:practice:4")).toBe(false);
    expect(f.api.earn("review:soon:ch02#a")).toBe(false);
    f.emit({ type: "compare", chapter: "", key: "e3", fresh: true });
    expect(f.Store.read(KEY, null)).toBe(null);
  });
  it("after stale, an earn writes nothing", () => {
    const f = fake();
    f.emit({ type: "stale" });
    f.emit({ type: "event", n: 1, sec: "ch02#strong1" });
    expect(f.api.earn("compare:ch02/e3")).toBe(false);
    expect(f.Store.read(KEY, null)).toBe(null);
  });
  it("without a store or a document it does nothing and does not throw", () => {
    expect(install({}).earn("compare:ch02/e3")).toBe(false);
    const f = fake({ noDoc: true });
    f.emit({ type: "compare", chapter: "ch02", key: "e3", fresh: true });
    expect(f.earned()).toEqual(["compare:ch02/e3"]);
  });
});
