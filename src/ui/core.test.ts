import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { core } from "./core.ts";
import { chapterById, exerciseRef, generatorRef, sectionRef } from "../core/curriculum.ts";
import { readConfig } from "../core/config.ts";
import { STORE_KEYS } from "../core/store.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("the modules under src/core/", () => {
  /* in a Node of its own, as tools/ loads them (type stripping): every name on globalThis
     before the imports is every name after. Every module under src/core/, the grader's in
     src/core/answer/ too, so one added there is imported here with no edit to this list:
     it has to hold the five at the top, and every name has to be one this walk reads */
  it("add no global when Node imports them, and neither does the installer", () => {
    const files = (fs.readdirSync(path.join(ROOT, "src/core"), { recursive: true }) as string[])
      .map((f) => f.split(path.sep).join("/")).filter((f) => /\.ts$/.test(f) && !/\.(test|d)\.ts$/.test(f)).sort();
    expect(files).toEqual(expect.arrayContaining(["config.ts", "curriculum.ts", "grade.ts", "rules.ts", "store.ts"]));
    for (const f of files) expect(f).toMatch(/^(answer\/)?[a-z]+\.ts$/);
    const urls = files.map((f) => "src/core/" + f).concat("src/ui/core.ts").map((f) => new URL("file://" + path.join(ROOT, f)).href);
    const script = "const before = Reflect.ownKeys(globalThis).map(String);" +
      "for (const u of " + JSON.stringify(urls) + ") await import(u);" +
      "const after = Reflect.ownKeys(globalThis).map(String);" +
      "console.log(JSON.stringify(after.filter((k) => !before.includes(k))));";
    const out = execFileSync(process.execPath, ["--input-type=module", "--no-warnings", "-e", script], { encoding: "utf8" });
    expect(JSON.parse(out.trim())).toEqual([]);
  });
});

describe("window.BMCore", () => {
  it("is the grader, its verdicts and messages, the rules, the refs and the settings reader", () => {
    expect(Object.keys(core)).toEqual(["grade", "matches", "alternatives", "judge", "specOf", "messages", "rules", "curriculum", "config"]);
    expect(Object.keys(core.rules).sort()).toEqual(["CLUE_FREE", "FADED_RUNG", "Road", "STRONG", "WEAK", "XP", "fadedOf", "isMiss", "medalMark", "paysFirst", "setStats", "struggle", "xpFor"]);
    expect(Object.keys(core.messages)).toEqual(["unreadMessage", "formMessage", "readMessage", "lowestMessage"]);
    expect(core.grade("1/2", "0.5", "number")).toBe(true);
  });

  /* the typed grader as a page will call it: still over the old grader, so a verdict is
     right exactly where grade() says true; judgeOff() is the tools' and never on the page */
  it("judges an answer from what the page holds, and leaves the tools' switch off", () => {
    const spec = core.specOf({ answer: "1/2", type: "number", tol: "" });
    expect(spec).toEqual({ answer: "1/2", type: "number", tol: 0 });
    expect(core.judge(" 0.5 ", spec)).toEqual({ kind: "right", alt: 0, read: "0.5", notes: [] });
    expect(core.judge("2", spec)).toEqual({ kind: "wrong", read: null });
    expect(core.judge("  ", spec)).toEqual({ kind: "unread", reason: "empty", at: 0 });
    expect(core.messages.unreadMessage("empty", "a")).toBe("Type an answer, then press Check.");
    expect("judgeOff" in core).toBe(false);
  });
});

describe("a page without it", () => {
  /* assets/site.js under a stub window that nothing put BMCore on: a forgotten import */
  it("says so, and site.js builds nothing", () => {
    const errors: unknown[][] = [];
    const noop = () => {};
    const el = {
      getAttribute: () => null, setAttribute: noop, removeAttribute: noop, hasAttribute: () => false,
      appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
    };
    const win: Record<string, unknown> = {
      console: { error: (...a: unknown[]) => errors.push(a), log: noop, warn: noop },
      addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
      document: {
        readyState: "complete", body: el, documentElement: el, querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => null, createElement: () => el, addEventListener: noop
      },
      localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
    };
    win.window = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8"), win, { filename: "assets/site.js" });
    expect(errors).toEqual([["[BM] BMCore missing"]]);
    expect([win.BMSite, win.BMStore]).toEqual([undefined, undefined]);
  });
});

describe("the curriculum refs", () => {
  const C = { title: "t", parts: [{ id: "a", num: "I", name: "A", dir: "1-a", chapters: [{ id: "ch01", label: "1", title: "One", file: "01.html", sections: [{ id: "x", title: "X" }] }] }] };

  it("find a chapter in the parts, flattened or not", () => {
    expect(chapterById(C, "ch01")?.title).toBe("One");
    expect([chapterById(C, "ch02"), chapterById(null, "ch01"), chapterById({ title: "t", parts: [] }, "ch01")]).toEqual([null, null, null]);
  });

  it("name a section, an exercise and a generator from anywhere", () => {
    expect([sectionRef("ch02", "one-unknown"), sectionRef("ch16", "ch02#one-unknown"), sectionRef("ch02", ""), sectionRef("ch02", "warmup"), sectionRef("ch02", null)])
      .toEqual(["ch02#one-unknown", "ch02#one-unknown", "", "", ""]);
    expect(exerciseRef("ch02", "e3")).toBe("ch02/e3");
    expect(generatorRef("lin-solve")).toBe("g:lin-solve");
  });
});

describe("the settings", () => {
  it("fill every default, and read an unknown events value as on", () => {
    expect(readConfig(undefined)).toEqual({ supabaseUrl: "", supabaseAnonKey: "", providers: [], emailDelivery: true, learn: { events: "on" } });
    expect(readConfig({ supabaseUrl: "u", supabaseAnonKey: "k", providers: ["google", 3], emailDelivery: false, learn: { events: "off" } }))
      .toEqual({ supabaseUrl: "u", supabaseAnonKey: "k", providers: ["google"], emailDelivery: false, learn: { events: "off" } });
    expect(readConfig({ learn: { events: "OFF" }, providers: "google" }).learn.events).toBe("on");
    expect(readConfig({ learn: { events: "OFF" }, providers: "google" }).providers).toEqual([]);
  });
});

describe("the store keys", () => {
  it("are the keys the scripts use", () => {
    const site = fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8");
    for (const k of ["bm.theme", "bm.progress.v1", "bm.play.v1", "bm.last", "bm.attempts.v1", "bm.activity.v1", "bm.lesson.v1", "bm.game.v1", "bm.run.v1", "bm.prefs.v1"]) {
      expect(site).toContain('"' + k + '"');
      expect(Object.values(STORE_KEYS)).toContain(k);
    }
    const account = fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8");
    expect(account).toContain('"' + STORE_KEYS.sync + '"');
    expect(account).toContain('"' + STORE_KEYS.syncPending + '"');
  });
});
