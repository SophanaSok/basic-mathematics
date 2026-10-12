import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { equip } from "./forms.ts";
import { threshold } from "../hud/levels.js";

/* equip() reads the game store and the XP off window and writes form.wear through BMStore;
   forms.ts mounts only where a document and [data-form] exist, so in Node only the
   exports are live */
const KEY = "bm.game.v1";
let store: Record<string, unknown>;
let writes: Array<[string, unknown]>;
let events: any[];
let xp = 0;

function setup(initial: unknown, xpNow: number) {
  store = { [KEY]: initial };
  writes = [];
  events = [];
  xp = xpNow;
  (globalThis as any).window = {
    BMGame: {
      game: () => (store[KEY] as any) ?? {},
      info: () => ({ xp }),
      announce: () => {}
    },
    BMStore: {
      keys: { game: KEY, last: "bm.last" },
      read: (k: string, f: unknown) => (k in store ? store[k] : f),
      write: (k: string, v: unknown) => { writes.push([k, v]); store[k] = v; },
      emit: (e: unknown) => { events.push(e); },
      on: () => {}
    }
  };
}
afterEach(() => { delete (globalThis as any).window; });

const xp3 = threshold(6);
const base = () => ({ ach: { a: 1 }, sec: {}, v: 1, form: { got: { "1": 5, "2": 6 }, wear: { n: 1, at: 10 }, extra: true } });

describe("equip", () => {
  beforeEach(() => setup(base(), xp3));

  it("writes only form.wear, later than the one it replaces, and tells the bus", () => {
    const before = Date.now();
    expect(equip(2)).toBe(true);
    expect(writes.length).toBe(1);
    const g: any = store[KEY];
    expect(g.form.wear.n).toBe(2);
    expect(g.form.wear.at).toBeGreaterThanOrEqual(before);
    expect(g.form.wear.at).toBeGreaterThan(10);
    const expected: any = base();
    expected.form.wear = g.form.wear;
    expect(g).toEqual(expected);
    expect(events).toEqual([{ type: "form", highest: 3, worn: 2, fresh: [] }]);
  });

  it("refuses what is not a reached stage", () => {
    for (const bad of [NaN, "2", 0, 99, 4, Infinity, -1]) {
      expect(equip(bad as any)).toBe(false);
    }
    expect(writes).toEqual([]);
    expect(events).toEqual([]);
  });

  it("is a no-op for the stage already worn", () => {
    expect(equip(1)).toBe(true);
    expect(writes).toEqual([]);
    expect(events).toEqual([]);
  });

  it("writes a fresh record over a damaged store or form, with only wear", () => {
    setup("junk", xp3);
    expect(equip(2)).toBe(true);
    expect((store[KEY] as any)).toEqual({ form: { wear: { n: 2, at: expect.any(Number) } } });
    setup({ ach: {}, form: [1, 2] }, xp3);
    expect(equip(2)).toBe(true);
    expect((store[KEY] as any)).toEqual({ ach: {}, form: { wear: { n: 2, at: expect.any(Number) } } });
  });

  it("does not let a huge or odd old `at` carry through", () => {
    for (const at of [1e308, "9e15", Infinity, NaN, -5]) {
      setup({ form: { wear: { n: 1, at } } }, xp3);
      expect(equip(2)).toBe(true);
      const w = (store[KEY] as any).form.wear;
      expect(Number.isFinite(w.at)).toBe(true);
      expect(w.at).toBeLessThanOrEqual(4102444800000 + 1);
      expect(w.at).toBeGreaterThan(0);
    }
  });
});
