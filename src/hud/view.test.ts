import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import * as levels from "./levels.js";
import * as view from "./view.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const shell = require("../../tools/lib/shell.js") as { hudLibrary(): string; hudScript(): string };

/* the HUD script's functions, run from the very text the shell puts into every page */
function inlined(): typeof levels & typeof view {
  const win: Record<string, unknown> = {};
  win.window = win;
  vm.createContext(win);
  vm.runInContext(shell.hudLibrary(), win);
  return win.BMHud as typeof levels & typeof view;
}

/* assets/site.js under a stub window, for its dayKey (what writes the activity days) */
function siteDayKey(): (d?: Date) => string {
  const noop = () => {};
  const el: Record<string, unknown> = {
    setAttribute: noop, getAttribute: () => null, hasAttribute: () => false, removeAttribute: noop,
    appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
  };
  const win: Record<string, unknown> = {
    console, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    document: {
      readyState: "complete", body: el, documentElement: el, querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: () => el, addEventListener: noop
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8"), win, { filename: "assets/site.js" });
  return (win.BMSite as { dayKey(d?: Date): string }).dayKey;
}

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const daysBefore = (now: Date, n: number) => { const d = new Date(now.getTime()); d.setDate(d.getDate() - n); return view.dayKey(d); };

describe("what the HUD shows", () => {
  const now = at(2026, 3, 29);

  it("keys a day the way site.js writes the activity store, across a year and its clock changes", () => {
    const siteKey = siteDayKey();
    for (let i = 0; i < 400; i++) {
      const d = at(2026, 1, 1);
      d.setDate(d.getDate() + i);
      expect(view.dayKey(d)).toBe(siteKey(d));
    }
  });

  it("totals the XP of the days, taking a damaged day as none", () => {
    expect(view.totalXp({ days: { "2026-01-01": 30, "2026-01-02": "12", "2026-01-03": "x", "2026-01-04": null } })).toBe(42);
    expect([undefined, null, 5, "x", [], { days: [1, 2] }].map(view.totalXp)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("counts the streak back from today, or from yesterday before today's work", () => {
    const days: Record<string, number> = {};
    for (let i = 1; i <= 4; i++) days[daysBefore(now, i)] = 10;
    expect(view.streakOf({ days }, now)).toBe(4);
    days[daysBefore(now, 0)] = 5;
    expect(view.streakOf({ days }, now)).toBe(5);
    days[daysBefore(now, 2)] = 0;
    expect(view.streakOf({ days }, now)).toBe(2);
    expect(view.streakOf({ days: { [daysBefore(now, 2)]: 30 } }, now)).toBe(0);
  });

  it("takes the reader's daily goal, and 30 when there is none", () => {
    expect([{ goal: 50 }, { goal: "45" }, { goal: 0 }, { goal: "x" }, {}, null].map(view.goalOf)).toEqual([50, 45, 30, 30, 30, 30]);
  });

  it("shows the combo while it has pips, or a shield on a chapter, and never in Study mode", () => {
    const v = (run: unknown, o: { calm?: boolean; chapter?: boolean } = {}) => view.hudView({ run, now, ...o }).combo;
    expect(v({ combo: { pips: 3 } })).toEqual({ shown: true, pips: 3, shield: false, mult: 1.6 });
    expect(v({ combo: { pips: 9.7, shield: 1 } })).toEqual({ shown: true, pips: 5, shield: true, mult: 2 });
    expect(v({ combo: { pips: 0, shield: true } }).shown).toBe(false);
    expect(v({ combo: { pips: 0, shield: true } }, { chapter: true }).shown).toBe(true);
    expect(v({ combo: { pips: 4 } }, { calm: true }).shown).toBe(false);
    expect(v("junk")).toEqual({ shown: false, pips: 0, shield: false, mult: 1 });
  });

  it("says every slot in a full sentence", () => {
    const days = { [daysBefore(now, 0)]: 12, [daysBefore(now, 1)]: 58 };
    const v = view.hudView({ activity: { days, goal: 40 }, run: { combo: { pips: 2, shield: true } }, prefs: { sound: true }, now });
    expect(v.labels).toEqual({
      level: "Level 3, Reckoner. 10 of 45 XP to level 4. Open your progress.",
      streak: "2-day streak. 12 of 40 XP today.",
      combo: "Combo 2 of 5, XP times 1.4, shield ready"
    });
    expect([v.level, v.into, v.span, v.pct, v.streak, v.today, v.goal, v.ring, v.sound]).toEqual([3, 10, 45, 22, 2, 12, 40, 30, true]);
    expect(view.hudView({ prefs: { sound: true }, calm: true, now }).sound).toBe(false);
  });

  it("is drawn the same by the inline HUD script as by the modules it is made of", () => {
    const H = inlined();
    expect(Object.keys(H).sort()).toEqual(Object.keys({ ...levels, ...view }).sort());
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let i = 0; i < 300; i++) {
      const days: Record<string, unknown> = {};
      for (let k = rnd(12); k > 0; k--) days[daysBefore(now, rnd(20))] = [rnd(400), String(rnd(90)), null, "x"][rnd(4)];
      const input = { activity: { days, goal: [undefined, 20, "35"][rnd(3)] }, run: { combo: { pips: rnd(8) - 1, shield: !!rnd(2) } }, prefs: { sound: !!rnd(2) }, calm: !!rnd(2), chapter: !!rnd(2), now };
      expect(JSON.stringify(H.hudView(input))).toBe(JSON.stringify(view.hudView(input)));
      const xp = rnd(70000);
      expect(H.levelInfo(xp)).toEqual(levels.levelInfo(xp));
    }
  });

  it("leaves a page with no HUD alone, and reads a storage that throws as empty", () => {
    const doc = { querySelector: () => null, documentElement: { hasAttribute: () => false }, body: null } as unknown as Document;
    const throwing = { localStorage: { getItem() { throw new Error("blocked"); } } } as unknown as { localStorage: Storage };
    expect(view.prefill(doc, throwing)).toBe(false);
  });

  it("goes into the page whole: the shell's script parses and ends by filling the HUD", () => {
    const text = shell.hudScript();
    expect(() => new vm.Script(text)).not.toThrow();
    expect(text).toMatch(/prefill\(document, window\);/);
    expect(text).not.toMatch(/^\s*(export|import)\b/m);
    expect(text.length).toBeLessThan(8000);
  });
});
