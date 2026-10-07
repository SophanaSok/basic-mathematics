import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { merge as installed } from "../ui/core.ts";
import { maxSection, merge, mergeAttempt, mergeGame } from "./merge.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
/* the random states of tools/check-static.js's `merge` check, shared with it */
const { rng, randomState } = createRequire(import.meta.url)("../../tools/lib/random-state.js");

/* The commit the merge was moved from: assets/account.js as it was there is the merge as
   it was before it moved. Pinned, so the comparison below keeps holding the moved merge
   to the old one whatever happens to account.js later. */
const BEFORE_MOVE = "7feca3e";

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

/* the fields where two devices that disagree each keep their own (merge's `local`) */
function stripLocalFirst(m: any) {
  const c = JSON.parse(JSON.stringify(m));
  delete c.last;
  if (c.activity) delete c.activity.goal;
  if (c.lesson) delete c.lesson.mode;
  if (c.play) Object.keys(c.play).forEach((ch) => { if (c.play[ch]) delete c.play[ch].guess; });
  return c;
}

/* assets/account.js under a stub window: the page's BMStore and BMSite, and whatever else
   `extra` puts there */
function runAccount(src: string, extra: Record<string, unknown>) {
  const noop = () => {};
  const errors: unknown[][] = [];
  const win: Record<string, any> = {
    console: { error: (...a: unknown[]) => errors.push(a), log: noop, warn: noop },
    BM_CONFIG: {},
    location: { hash: "", search: "", href: "http://localhost/" },
    addEventListener: noop,
    localStorage: { getItem: () => null, setItem: noop },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, visibilityState: "visible" },
    BMStore: {
      keys: { progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1", activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1" },
      read: (_k: string, f: unknown) => f, write: noop, on: noop, emit: noop
    },
    BMSite: { rootPrefix: () => "", escapeHtml: (s: unknown) => String(s) },
    ...extra
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: "assets/account.js" });
  return { win, errors };
}

describe("the modules under src/sync/", () => {
  /* in a Node of its own, as tools/ loads them (type stripping) */
  it("add no global when Node imports them", () => {
    const files = fs.readdirSync(path.join(ROOT, "src/sync")).filter((f) => /\.ts$/.test(f) && !/\.(test|d)\.ts$/.test(f)).sort();
    expect(files).toEqual(["merge.ts"]);
    const urls = files.map((f) => new URL("file://" + path.join(ROOT, "src/sync", f)).href);
    const script = "const before = Reflect.ownKeys(globalThis).map(String);" +
      "for (const u of " + JSON.stringify(urls) + ") await import(u);" +
      "const after = Reflect.ownKeys(globalThis).map(String);" +
      "console.log(JSON.stringify(after.filter((k) => !before.includes(k))));";
    const out = execFileSync(process.execPath, ["--input-type=module", "--no-warnings", "-e", script], { encoding: "utf8" });
    expect(JSON.parse(out.trim())).toEqual([]);
  });
});

describe("window.BMMerge", () => {
  it("is the merge and what account.js takes with it", () => {
    expect(Object.keys(installed)).toEqual(["merge", "mergeGame", "SCHEMA", "versionOf", "canon", "obj", "str"]);
    expect([installed.merge, installed.mergeGame, installed.SCHEMA]).toEqual([merge, mergeGame, 1]);
  });

  it("is what BMAccount.merge and .mergeGame are", () => {
    const { win, errors } = runAccount(fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8"), { BMMerge: installed });
    expect(errors).toEqual([]);
    expect([win.BMAccount.merge, win.BMAccount.mergeGame]).toEqual([merge, mergeGame]);
  });
});

describe("a page without it", () => {
  /* a forgotten import: account.js says so and does nothing, so nothing is signed in to,
     read or written with a merge it does not have */
  it("says so, and account.js does nothing", () => {
    const { win, errors } = runAccount(fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8"), {});
    expect(errors).toEqual([["[BM] BMMerge missing"]]);
    expect(win.BMAccount).toBeUndefined();
  });
});

describe("the merge moved from assets/account.js", () => {
  /* the merge as it was, from the commit it was moved from, run as the page ran it */
  const old = runAccount(execFileSync("git", ["show", BEFORE_MOVE + ":assets/account.js"], { cwd: ROOT, encoding: "utf8" }), {}).win.BMAccount;

  it("gives the old merge's result, byte for byte once canonical, over 2,000 seeded triples", () => {
    expect(typeof old.merge).toBe("function");
    const R = rng(20261006);
    let unknown = 0, sections = 0;
    for (let i = 0; i < 2000; i++) {
      const seed = R.int(2 ** 31), S = rng(seed);
      /* the states the old merge's laws were held to: two devices never disagree about a
         section, which the old merge took from either side */
      const [a, b, c] = [0, 1, 2].map(() => randomState(S, { sectionConflicts: false }));
      const pairs: [string, (m: any) => unknown][] = [
        ["merge(a, b)", (m) => m.merge(a, b)],
        ["merge(b, a)", (m) => m.merge(b, a)],
        ["merge(merge(a, b), c)", (m) => m.merge(m.merge(a, b), c)],
        ["merge(a, merge(b, c))", (m) => m.merge(a, m.merge(b, c))],
        ["merge(a, a)", (m) => m.merge(a, a)],
        ["mergeGame(a.game, b.game)", (m) => m.mergeGame(a.game, b.game)]
      ];
      for (const [name, run] of pairs) {
        const now = canon(run({ merge, mergeGame })), then = canon(run(old));
        if (now !== then) expect(now, "seed " + seed + ": " + name).toBe(then);
      }
      /* what the states held: fields no version knows, and sections on both sides */
      if (/"(zz|~later|faded|constructor)":/.test(JSON.stringify([a, b, c]))) unknown++;
      Object.keys(a.attempts).forEach((ch) => Object.keys(a.attempts[ch] || {}).forEach((k) => {
        const p = a.attempts[ch][k], q = b.attempts && b.attempts[ch] && b.attempts[ch][k];
        if (p && q && typeof p.section === "string" && typeof q.section === "string") sections++;
      }));
    }
    expect(unknown).toBeGreaterThan(1900);
    expect(sections).toBeGreaterThan(1000);
  });
});

describe("the merge laws", () => {
  /* the states of tools/lib/random-state.js as they come (sectionConflicts on): one
     attempt section in ten is another non-empty one, so two devices often disagree */
  it("hold over 2,000 seeded triples where devices disagree about sections, the fields kept local aside", () => {
    const R = rng(20261007);
    let disagree = 0;
    for (let i = 0; i < 2000; i++) {
      const seed = R.int(2 ** 31), S = rng(seed);
      const [a, b, c] = [0, 1, 2].map(() => randomState(S));
      const law = (name: string, x: unknown, y: unknown) => {
        const p = canon(stripLocalFirst(x)), q = canon(stripLocalFirst(y));
        if (p !== q) expect(p, "seed " + seed + ": " + name).toBe(q);
      };
      const ab = merge(a, b);
      law("merge(a, b) = merge(b, a)", ab, merge(b, a));
      law("merge(merge(a, b), c) = merge(a, merge(b, c))", merge(ab, c), merge(a, merge(b, c)));
      law("merge(m, m) = m", merge(ab, ab), ab);
      /* and every record both sides hold has the greater of their two sections */
      Object.keys(a.attempts).forEach((ch) => Object.keys(a.attempts[ch] || {}).forEach((k) => {
        const p = a.attempts[ch][k], q = b.attempts && b.attempts[ch] && b.attempts[ch][k];
        if (!p || typeof p !== "object" || !q || typeof q !== "object") return;
        if (p.section && q.section && p.section !== q.section) disagree++;
        const want = [p.section, q.section].filter((s) => typeof s === "string" && s !== "").sort().pop();
        const got = ab.attempts[ch][k].section;
        if (got !== want) expect(got, "seed " + seed + ": attempts." + ch + "." + k + ".section from " + canon([p.section, q.section])).toBe(want);
      }));
    }
    expect(disagree).toBeGreaterThan(200);
  });
});

describe("an attempt record's section", () => {
  const sec = (x: unknown, y: unknown) => (mergeAttempt(x, y) as any).section;
  const both = (x: unknown, y: unknown) => [sec(x, y), sec(y, x)];

  it("is the one side's when the other has none, and the greater string when both have one", () => {
    expect(both({ section: "a" }, { section: "b" })).toEqual(["b", "b"]);
    expect(both({ section: "a" }, {})).toEqual(["a", "a"]);
    expect(both({}, { section: "" })).toEqual([undefined, undefined]);
    expect(mergeAttempt({}, { section: "" })).toEqual({});
    expect(both({ section: "a" }, { section: "" })).toEqual(["a", "a"]);
    expect(both({ section: "a" }, { section: "a" })).toEqual(["a", "a"]);
  });

  it("orders two strings by UTF-16 code units, not by code points", () => {
    /* U+FF5E is one code unit, 0xFF5E; U+1F600 is the pair 0xD83D 0xDE00, the smaller by
       code units and the larger by code points */
    expect(both({ section: "\uff5e" }, { section: "\ud83d\ude00" })).toEqual(["\uff5e", "\uff5e"]);
    expect(both({ section: "Warmup" }, { section: "warmup" })).toEqual(["warmup", "warmup"]);
    expect(both({ section: "ch02" }, { section: "ch02#one-unknown" })).toEqual(["ch02#one-unknown", "ch02#one-unknown"]);
  });

  it("puts a non-empty string over anything else, and orders two other values by their canonical JSON", () => {
    expect(both({ section: 7 }, { section: "a" })).toEqual(["a", "a"]);
    expect(both({ section: { a: 1 } }, {})).toEqual([{ a: 1 }, { a: 1 }]);
    expect(both({ section: 7 }, { section: [1] })).toEqual([[1], [1]]);
    expect(both({ section: 0 }, { section: null })).toEqual([undefined, undefined]);
    expect(both({ section: false }, { section: "" })).toEqual([undefined, undefined]);
  });

  it("is a maximum over one order: commutative, associative and idempotent over every pair and triple of values", () => {
    const values = [undefined, "", "a", "b", "A", "ch02#one-unknown", "\uff5e", "\ud83d\ude00", 0, 7, null, false, true, [1], { a: 1 }];
    for (const p of values) {
      expect(canon(maxSection(p, p)), canon(p)).toBe(canon(maxSection(p, undefined)));
      for (const q of values) {
        expect(canon(maxSection(p, q)), canon([p, q])).toBe(canon(maxSection(q, p)));
        for (const r of values) expect(canon(maxSection(maxSection(p, q), r)), canon([p, q, r])).toBe(canon(maxSection(p, maxSection(q, r))));
      }
    }
  });
});
