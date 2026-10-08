import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { merge as installed } from "../ui/core.ts";
import { maxSection, merge, mergeAttempt, mergeDiag, mergeGame } from "./merge.ts";

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

/* the old merge has no `diag`, so the comparison with it is over everything else */
function stripDiag(m: any) {
  if (!m || typeof m !== "object" || !("diag" in m)) return m;
  const c = { ...m };
  delete c.diag;
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

/* the two 2,000-triple tests: about 4s and 2s here, past vitest's 5s default on a slower
   CI runner (5.8s for the first one there) */
const LONG = 60_000;

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
      const [a, b, c] = [0, 1, 2].map(() => randomState(S, { sectionConflicts: false, diag: false }));
      const pairs: [string, (m: any) => unknown][] = [
        ["merge(a, b)", (m) => m.merge(a, b)],
        ["merge(b, a)", (m) => m.merge(b, a)],
        ["merge(merge(a, b), c)", (m) => m.merge(m.merge(a, b), c)],
        ["merge(a, merge(b, c))", (m) => m.merge(a, m.merge(b, c))],
        ["merge(a, a)", (m) => m.merge(a, a)],
        ["mergeGame(a.game, b.game)", (m) => m.mergeGame(a.game, b.game)]
      ];
      for (const [name, run] of pairs) {
        const now = canon(stripDiag(run({ merge, mergeGame }))), then = canon(run(old));
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
  }, LONG);
});

describe("the merge laws", () => {
  /* the states of tools/lib/random-state.js as they come (sectionConflicts on): one
     attempt section in ten is another non-empty one, so two devices often disagree, and
     one in twenty is not a string (SECTION_DAMAGED) */
  it("hold over 2,000 seeded triples where devices disagree about sections, the fields kept local aside", () => {
    const R = rng(20261007);
    let disagree = 0, damaged = 0;
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
        if ([p.section, q.section].some((s) => s && typeof s !== "string")) damaged++;
        /* non-empty strings first, the greater by code units; then truthy values that are
           not strings, the greater by canonical JSON */
        const strs = [p.section, q.section].filter((s) => typeof s === "string" && s !== "").sort();
        const others = [p.section, q.section].filter((s) => s && typeof s !== "string").sort((s, t) => (canon(s) < canon(t) ? -1 : canon(s) > canon(t) ? 1 : 0));
        const want = strs.length ? strs.pop() : others.pop();
        const got = ab.attempts[ch][k].section;
        if (canon(got) !== canon(want)) expect(got, "seed " + seed + ": attempts." + ch + "." + k + ".section from " + canon([p.section, q.section])).toEqual(want);
      }));
    }
    expect(disagree).toBeGreaterThan(200);
    expect(damaged).toBeGreaterThan(100);
  }, LONG);
});

describe("the placement check's record (diag)", () => {
  const take = (day: string, band: string, more: Record<string, unknown> = {}) => ({ v: 1, day, band, ...more });
  const T1 = take("2026-10-01", "geometry"), T2 = take("2026-10-02", "algebra-1"), T3 = take("2026-10-03", "pre-algebra");
  const D = (takes: unknown, more: Record<string, unknown> = {}) => ({ takes, ...more });
  const same = (x: unknown, y: unknown, why?: string) => expect(canon(x), why).toBe(canon(y));

  it("is kept by merge, from either side and from both", () => {
    same(merge({ diag: D({ a: T1 }) }, {}).diag, D({ a: T1 }));
    same(merge({}, { diag: D({ a: T1 }) }).diag, D({ a: T1 }));
    same(merge({ diag: D({ a: T1 }) }, { diag: D({ a: T1 }) }).diag, D({ a: T1 }));
    /* the other fields come out as they did, and diag is the seventh-plus-one key */
    expect(Object.keys(merge({}, {})).sort()).toEqual(["activity", "attempts", "diag", "game", "last", "lesson", "play", "progress"]);
  });

  it("is an empty record of takes when neither side has one, or when a side's is not an object", () => {
    same(merge({}, {}).diag, D({}));
    same(merge({ diag: undefined }, { diag: null }).diag, D({}));
    for (const bad of ["x", 7, true, [1], [], [{ takes: { a: T1 } }]]) {
      same(merge({ diag: bad }, {}).diag, D({}), "diag " + canon(bad));
      same(merge({ diag: bad }, { diag: D({ a: T1 }) }).diag, D({ a: T1 }), "diag " + canon(bad) + " beside a take");
      same(merge({ diag: D(bad) }, { diag: D({ a: T1 }) }).diag, D({ a: T1 }), "takes " + canon(bad) + " beside a take");
    }
  });

  it("is the union of the takes of both sides", () => {
    same(mergeDiag(D({ a: T1, b: T2 }), D({ c: T3 })), D({ a: T1, b: T2, c: T3 }));
    same(mergeDiag(D({ c: T3 }), D({ a: T1, b: T2 })), D({ a: T1, b: T2, c: T3 }));
    /* a take both sides hold alike is kept once; and an empty side loses nothing */
    same(mergeDiag(D({ a: T1 }), D({ a: T1 })), D({ a: T1 }));
    same(mergeDiag(D({ a: T1 }), D({})), D({ a: T1 }));
  });

  it("keeps, for one id with different content on each side, the whole copy whose canonical JSON is the later string", () => {
    /* "geometry" sorts after "algebra-1" */
    same(mergeDiag(D({ a: T1 }), D({ a: T2 })), D({ a: T1 }));
    same(mergeDiag(D({ a: T2 }), D({ a: T1 })), D({ a: T1 }));
    /* whole, never field by field: no mix of the two, and an unknown field inside travels with its copy */
    const x = take("2026-10-01", "geometry", { extra: [1] }), y = take("2026-10-09", "algebra-1", { other: 2 });
    const m = mergeDiag(D({ a: x }), D({ a: y })).takes.a;
    expect([canon(x), canon(y)]).toContain(canon(m));
    same(m, x);
    expect(mergeDiag(D({ a: y }), D({ a: take("2026-10-01", "algebra-1") })).takes.a).toEqual(take("2026-10-09", "algebra-1", { other: 2 }));
  });

  it("carries a top-level field it has no rule for: alone, or the later of two", () => {
    same(mergeDiag(D({}, { zz: 1 }), D({})), D({}, { zz: 1 }));
    same(mergeDiag(D({}, { zz: 1 }), D({}, { zz: 7 })), D({}, { zz: 7 }));
    same(mergeDiag(D({}, { zz: [1, 2] }), D({}, { zz: [2, 1] })), D({}, { zz: [2, 1] }));
    same(mergeDiag({ zz: { a: 1 } }, { takes: { a: T1 } }), D({ a: T1 }, { zz: { a: 1 } }));
    /* "takes" itself is the takes, never carried as an unknown field */
    expect(Object.keys(mergeDiag(D({ a: T1 }), D({ b: T2 })))).toEqual(["takes"]);
  });

  it("treats a damaged take as an ordinary value: it never erases a take, and loses to one", () => {
    for (const bad of ["x", "", 7, null, true, [1], []]) {
      same(mergeDiag(D({ a: bad }), D({ a: T1 })), D({ a: T1 }), canon(bad));
      same(mergeDiag(D({ a: T1 }), D({ a: bad })), D({ a: T1 }), canon(bad));
      same(mergeDiag(D({ a: bad }), D({})), D({ a: bad }), "alone: " + canon(bad));
    }
  });

  it("treats ids named like inherited properties as data, and leaves __proto__ out", () => {
    const hostile = JSON.parse('{"takes":{"__proto__":{"v":1,"day":"2026-10-01","band":"geometry"},"constructor":{"v":1,"day":"2026-10-02"},"toString":7,"hasOwnProperty":null,"valueOf":[1]}}');
    const m = mergeDiag(hostile, {});
    expect(Object.keys(m.takes).sort()).toEqual(["constructor", "hasOwnProperty", "toString", "valueOf"]);
    expect(Object.getPrototypeOf(m.takes)).toBe(Object.prototype);
    expect(({} as any).band).toBeUndefined();
    expect(m.takes.constructor).toEqual({ v: 1, day: "2026-10-02" });
    expect(m.takes.toString).toBe(7);
    same(mergeDiag(m, hostile), m);
    /* nothing inherited is read as a take held by the other side */
    same(mergeDiag(D({}), D({ constructor: T1 })), D({ constructor: T1 }));
    expect(Object.keys(mergeDiag(D({}), D({})).takes)).toEqual([]);
    /* a top-level field named like one is carried like any other */
    const top = JSON.parse('{"__proto__":{"a":1},"constructor":3,"takes":{}}');
    expect(Object.keys(mergeDiag(top, {})).sort()).toEqual(["constructor", "takes"]);
    expect(Object.getPrototypeOf(mergeDiag(top, {}))).toBe(Object.prototype);
  });

  it("does not change its arguments", () => {
    const a = D({ a: T1 }, { zz: [1] }), b = D({ a: T2, b: T3 });
    const before = canon([a, b]);
    mergeDiag(a, b);
    expect(canon([a, b])).toBe(before);
  });

  it("holds the three laws over every combination of a small set of hostile values", () => {
    const values: unknown[] = [undefined, null, "x", 7, [1], {}, D({}), D(null), D("x"), D({ a: T1 }), D({ a: T2 }), D({ a: T1, b: T3 }),
      D({ a: null, b: "x" }), D({ constructor: T1 }), D({ constructor: 7 }), D({ a: T1 }, { zz: 1 }), D({}, { zz: 7 }), D({}, { zz: [1] }), { zz: 2 }];
    for (const p of values) {
      same(mergeDiag(p, p), mergeDiag(p, undefined), canon(p));
      for (const q of values) {
        same(mergeDiag(p, q), mergeDiag(q, p), canon([p, q]));
        for (const r of values) same(mergeDiag(mergeDiag(p, q), r), mergeDiag(p, mergeDiag(q, r)), canon([p, q, r]));
      }
    }
  });

  it("holds the three laws over 2,000 seeded triples of random states, diag included, and the states held takes in common", () => {
    const R = rng(20261008);
    let shared = 0, differing = 0, damagedTakes = 0, damagedDiag = 0, unknownTop = 0;
    const takesOf = (d: any) => (d && typeof d === "object" && !Array.isArray(d) && d.takes && typeof d.takes === "object" && !Array.isArray(d.takes) ? d.takes : {});
    for (let i = 0; i < 2000; i++) {
      const seed = R.int(2 ** 31), S = rng(seed);
      const [a, b, c] = [0, 1, 2].map(() => randomState(S));
      const law = (name: string, x: any, y: any) => {
        const p = canon(x.diag), q = canon(y.diag);
        if (p !== q) expect(p, "seed " + seed + ": " + name).toBe(q);
      };
      const ab = merge(a, b);
      law("merge(a, b) = merge(b, a)", ab, merge(b, a));
      law("merge(merge(a, b), c) = merge(a, merge(b, c))", merge(ab, c), merge(a, merge(b, c)));
      law("merge(m, m) = m", merge(ab, ab), ab);
      /* each take either side holds is in the result, as the later copy */
      const ta = takesOf(a.diag), tb = takesOf(b.diag), got = takesOf(ab.diag);
      const own = (o: any, k: string) => (Object.hasOwn(o, k) ? o[k] : undefined);
      for (const id of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
        const held = [own(ta, id), own(tb, id)].filter((v) => v !== undefined).map(canon).sort();
        if (canon(own(got, id)) !== held[held.length - 1]) expect(canon(own(got, id)), "seed " + seed + ": diag.takes." + id).toBe(held[held.length - 1]);
        if (Object.hasOwn(ta, id) && Object.hasOwn(tb, id)) { shared++; if (canon(ta[id]) !== canon(tb[id])) differing++; }
      }
      expect(Object.keys(got).sort(), "seed " + seed).toEqual([...new Set([...Object.keys(ta), ...Object.keys(tb)])].sort());
      if (Object.values(ta).some((t: any) => !t || typeof t !== "object" || Array.isArray(t))) damagedTakes++;
      if ([a.diag, b.diag].some((d) => !d || typeof d !== "object" || Array.isArray(d) || (d.takes !== undefined && (typeof d.takes !== "object" || Array.isArray(d.takes) || d.takes === null)))) damagedDiag++;
      if ([a.diag, b.diag].some((d) => d && typeof d === "object" && Object.keys(d).some((k) => k !== "takes"))) unknownTop++;
    }
    expect(shared).toBeGreaterThan(500);
    expect(differing).toBeGreaterThan(200);
    expect(damagedTakes).toBeGreaterThan(100);
    expect(damagedDiag).toBeGreaterThan(100);
    expect(unknownTop).toBeGreaterThan(300);
  }, LONG);
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
