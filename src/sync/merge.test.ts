import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { merge as installed } from "../ui/core.ts";
import { isValid, mergeEvents, prune } from "./events.ts";
import { maxSection, merge, mergeAttempt, mergeDiag, mergeGame, mergePet, mergeWear, WEAR_AT_MAX } from "./merge.ts";
import { balance, canBuy, prunePet, PRUNE_CARE_DAYS } from "../learn/pet.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
/* the random states of tools/check-static.js's `merge` check, shared with it */
const { rng, randomState, EVENT_COLLISION } = createRequire(import.meta.url)("../../tools/lib/random-state.js");

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
    expect(files).toEqual(["events.ts", "json.ts", "merge.ts"]);
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
    expect(Object.keys(installed)).toEqual(["merge", "mergeGame", "mergeEvents", "SCHEMA", "versionOf", "canon", "obj", "str"]);
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
      const [a, b, c] = [0, 1, 2].map(() => randomState(S, { sectionConflicts: false, diag: false, events: false, pet: false }));
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

describe("the event log in merge", () => {
  const own = (o: any, k: string) => (o && typeof o === "object" && !Array.isArray(o) && Object.hasOwn(o, k) ? o[k] : undefined);
  const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const UNKNOWN = ["zz", "~later", "faded", "constructor"];

  it("holds, over 2,000 seeded triples: only valid entries either side held, the larger v, the later unknown keys, the greater payload for a colliding id", () => {
    const R = rng(20261015);
    let collided = 0, collidedKept = 0, unknownKeys = 0, bothHeld = 0, invalidSeen = 0;
    for (let i = 0; i < 2000; i++) {
      const seed = R.int(2 ** 31), S = rng(seed);
      const [a, b] = [0, 1].map(() => randomState(S));
      const ab = merge(a, b), why = (s: string) => "seed " + seed + ": " + s;
      expect(ab.events !== undefined, why("events present when a side has it")).toBe(a.events !== undefined || b.events !== undefined);
      if (ab.events === undefined) continue;
      const ea = own(a.events, "ev"), eb = own(b.events, "ev");
      const held = (e: any, id: string) => (e && typeof e === "object" && !Array.isArray(e) ? own(e, id) : undefined);
      const got = ab.events.ev;
      for (const id of Object.keys(got)) {
        expect(isValid(id, got[id]), why("valid " + id)).toBe(true);
        const mine = [held(ea, id), held(eb, id)].filter((v) => v !== undefined).map(canon);
        if (!mine.includes(canon(got[id]))) expect(canon(got[id]), why("invented " + id)).toBe(mine.join(" or "));
      }
      /* the entries both sides hold alike and the prune of the union keeps are present */
      const union: Record<string, any> = {};
      for (const e of [ea, eb]) if (e && typeof e === "object" && !Array.isArray(e)) for (const id of Object.keys(e)) {
        if (isValid(id, e[id])) union[id] = e[id]; else invalidSeen++;
      }
      const kept = prune(union);
      for (const id of Object.keys(kept)) {
        const x = held(ea, id), y = held(eb, id);
        if (x !== undefined && y !== undefined && canon(x) === canon(y)) {
          bothHeld++;
          if (!(id in got)) expect(id, why("kept entry both sides hold is missing")).toBe(undefined);
        }
      }
      const counted = (x: unknown) => (Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 99 ? (x as number) : 1);
      const v = Math.max(1, counted(own(a.events, "v")), counted(own(b.events, "v")));
      if (ab.events.v !== v) expect(ab.events.v, why("v")).toBe(v);
      for (const k of UNKNOWN) {
        const vals = [own(a.events, k), own(b.events, k)].filter((x) => x !== undefined).map(canon).sort();
        if (!vals.length) { expect(Object.hasOwn(ab.events, k), why("invented " + k)).toBe(false); continue; }
        unknownKeys++;
        if (canon(ab.events[k]) !== vals[vals.length - 1]) expect(canon(ab.events[k]), why("events." + k)).toBe(vals[vals.length - 1]);
      }
      const ca = held(ea, EVENT_COLLISION.id), cb = held(eb, EVENT_COLLISION.id);
      if (ca !== undefined && cb !== undefined && canon(ca) !== canon(cb)) {
        collided++;
        if (EVENT_COLLISION.id in got) {
          collidedKept++;
          const want = canon(ca) >= canon(cb) ? canon(ca) : canon(cb);
          if (canon(got[EVENT_COLLISION.id]) !== want) expect(canon(got[EVENT_COLLISION.id]), why("collision")).toBe(want);
        }
      }
    }
    expect(collided).toBeGreaterThanOrEqual(50);
    expect(collidedKept).toBeGreaterThan(0);
    expect(unknownKeys).toBeGreaterThan(300);
    expect(bothHeld).toBeGreaterThan(1000);
    expect(invalidSeen).toBeGreaterThan(1000);
  }, LONG);

  it("is absent when neither side has a log, and is mergeEvents(side, undefined) when one has", () => {
    const R = rng(20261016);
    for (let i = 0; i < 300; i++) {
      const S = rng(R.int(2 ** 31));
      const x = randomState(S), y = randomState(S, { events: false }), z = randomState(S, { events: false });
      expect(Object.hasOwn(merge(y, z), "events")).toBe(false);
      expect(canon(merge(x, y).events)).toBe(canon(mergeEvents(x.events, undefined)));
      expect(canon(merge(y, x).events)).toBe(canon(mergeEvents(x.events, undefined)));
    }
  });
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

describe("an attempt record's twin flag", () => {
  it("survives a merge from either side, whatever it holds (the threat note's decision 1)", () => {
    expect(Object.prototype.hasOwnProperty.call(mergeAttempt({ opened: 1, twin: null }, { opened: 1 }), "twin")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(mergeAttempt({ opened: 1 }, { opened: 1, twin: null }), "twin")).toBe(true);
    expect((mergeAttempt({ opened: 1 }, { opened: 1, twin: 1 }) as any).twin).toBe(1);
    expect((mergeAttempt({ opened: 1, twin: 1 }, { opened: 1 }) as any).twin).toBe(1);
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

describe("mergeWear", () => {
  it("takes the wear with the later at, then the higher n", () => {
    expect(mergeWear({ n: 5, at: 10 }, { n: 1, at: 20 })).toEqual({ n: 1, at: 20 });
    expect(mergeWear({ n: 2, at: 10 }, { n: 3, at: 10 })).toEqual({ n: 3, at: 10 });
    expect(mergeWear({ n: "4", at: 10 }, { n: "x", at: 10 })).toEqual({ n: 4, at: 10 });
  });

  it("ignores an at past the bound or below zero, so one absurd value cannot win for good", () => {
    expect(mergeWear({ n: 5, at: 1e308 }, { n: 2, at: 20 })).toEqual({ n: 2, at: 20 });
    expect(mergeWear({ n: 5, at: WEAR_AT_MAX + 1 }, { n: 2, at: 20 })).toEqual({ n: 2, at: 20 });
    expect(mergeWear({ n: 5, at: -1 }, { n: 2, at: 20 })).toEqual({ n: 2, at: 20 });
  });

  it("counts an at of exactly WEAR_AT_MAX, and of zero", () => {
    expect(mergeWear({ n: 5, at: WEAR_AT_MAX }, { n: 2, at: 20 })).toEqual({ n: 5, at: WEAR_AT_MAX });
    expect(mergeWear({ n: 5, at: 0 }, undefined)).toEqual({ n: 5, at: 0 });
  });

  it("sends two absurd values through later, whole", () => {
    expect(mergeWear({ n: 5, at: 1e308 }, { n: 2, at: 1e300 })).toEqual({ n: 5, at: 1e308 });
  });

  it("carries the unknown fields of the records", () => {
    expect(mergeWear({ n: 1, at: 1, z: "b" }, { n: 1, at: 2, z: "a" })).toEqual({ n: 1, at: 2, z: "b" });
  });

  it("ignores a side that is no record", () => {
    expect(mergeWear({ n: 9, at: "99" }, { n: 1, at: 5 })).toEqual({ n: 1, at: 5 });
    expect(mergeWear("x", { n: 1, at: 5 })).toEqual({ n: 1, at: 5 });
    expect(mergeWear([1], { n: 1, at: 5 })).toEqual({ n: 1, at: 5 });
  });
});

describe("game.form (no longer a known field)", () => {
  it("is carried through whole by later, and the three laws hold", () => {
    const a = { form: { got: { "1": 9 } } }, b = { form: { got: { "1": 4 } } }, c = { form: "x" };
    const r = mergeGame(a, b);
    expect([canon(a.form), canon(b.form)]).toContain(canon(r.form));
    expect(canon(mergeGame(a, b))).toBe(canon(mergeGame(b, a)));
    expect(canon(mergeGame(mergeGame(a, b), c))).toBe(canon(mergeGame(a, mergeGame(b, c))));
    expect(canon(mergeGame(r, r))).toBe(canon(r));
    /* absorption: merging the result with one of its inputs changes nothing */
    expect(canon(mergeGame(r, a))).toBe(canon(r));
  });

  it("keeps a form held by one side only", () => {
    expect(mergeGame(a1(), {}).form).toEqual({ got: { "1": 9 } });
    expect(mergeGame({}, a1()).form).toEqual({ got: { "1": 9 } });
    expect(Object.prototype.hasOwnProperty.call(mergeGame({}, {}), "form")).toBe(false);
    function a1() { return { form: { got: { "1": 9 } } }; }
  });
});

/* ---------------------------------------------------------------- mergePet -- */

type Rng = any;
const DAY0 = Date.UTC(2025, 0, 1);
const dayAt = (i: number) => new Date(DAY0 + i * 86_400_000).toISOString().slice(0, 10);
const ITEMS = ["pellet", "fish", "ball", "hat"];
const STAGES_ = ["hatchling", "fry", "juvenile", "adult", "elder"];
const NEED_KEYS = ["tummy", "play", "clean", "spark"];
const hostile = (json: string) => JSON.parse(json);

/* a number that is sometimes damaged: a string, a negative, past any bound, a fraction */
function junkNum(R: Rng, n: number): any {
  const r = R.int(40);
  if (r === 0) return String(n);
  if (r === 1) return -n;
  if (r === 2) return 1e308;
  if (r === 3) return "x";
  if (r === 4) return null;
  if (r === 5) return n + 0.5;
  return n;
}
/* a whole value replaced by damage now and then */
function junk(R: Rng, v: any): any {
  if (!R.maybe(0.03)) return v;
  return R.pick([null, "x", 7, [1, 2], true, {}, hostile('{"__proto__":{"polluted":1},"z":1}')]);
}
function addUnknown(R: Rng, o: any) {
  if (R.maybe(0.15)) o["u" + R.int(2)] = R.pick(["a", "b", 1, { k: R.int(2) }, [R.int(3)]]);
}

/* one device's own doing on top of the base, in a day window that reaches past the prunes */
function profile(R: Rng, base: any, dev: string, span: number): any {
  const pet: any = JSON.parse(JSON.stringify(base));
  pet.earned = pet.earned || {}; pet.spent = pet.spent || {}; pet.care = pet.care || {};
  pet.owned = pet.owned || {}; pet.needs = pet.needs || {}; pet.grew = pet.grew || {}; pet.gift = pet.gift || {};
  const k = R.int(25);
  for (let i = 0; i < k; i++) {
    const d = dayAt(R.int(span)), sec = "ch0" + R.int(3) + "#s" + R.int(8);
    const r = R.int(8);
    if (r === 0) pet.earned["strong:" + sec] = junkNum(R, 20);
    else if (r === 1) pet.earned["medal:ch01:practice:" + (1 + R.int(3))] = 10;
    else if (r <= 3) pet.earned["review:" + d + ":" + sec] = junkNum(R, 5);
    else if (r === 4) pet.earned[R.pick(["compare:ch01/e1", "mission:ch02/m1", "bogus:1", "review:nope:x", "j" + R.int(30), "bogus:x"])] = 5;
    else if (r <= 6) pet.spent["buy:" + d + ":" + R.pick(ITEMS) + ":" + dev + ":" + R.int(4)] = junkNum(R, R.pick([5, 10, 40]));
    else pet.owned[R.pick(ITEMS)] = R.maybe(0.05) ? 7 : d;
  }
  for (let i = 0; i < R.int(20); i++) {
    const d = dayAt(R.int(span));
    const day: any = pet.care[d] && typeof pet.care[d] === "object" ? pet.care[d] : (pet.care[d] = {});
    const r = R.int(5);
    if (r === 0) { day.feed = day.feed && typeof day.feed === "object" ? day.feed : {}; day.feed[R.pick(ITEMS)] = junkNum(R, 1 + R.int(3)); }
    else day[["play", "clean", "spark", "runs"][r - 1] || "play"] = junkNum(R, 1 + R.int(2));
    addUnknown(R, day);
    pet.care[d] = junk(R, day);
  }
  for (let i = 0; i < R.int(4); i++) {
    const nk = R.pick(NEED_KEYS);
    pet.needs[nk] = junk(R, { n: junkNum(R, R.int(6)), at: R.maybe(0.05) ? R.pick([1e308, WEAR_AT_MAX + 1, -5, "9"]) : 1000 * R.int(50) });
  }
  if (R.maybe(0.1)) pet.needs.mystery = R.pick([1, "m", { a: 1 }]);
  if (R.maybe(0.5)) pet.grew[R.pick(STAGES_)] = junkNum(R, 1 + R.int(500));
  if (R.maybe(0.4)) pet.gift[dayAt(R.int(span))] = 1;
  if (R.maybe(0.3)) for (let i = 0; i < 8; i++) pet.earned["review:" + dayAt(R.int(3)) + ":ch01#s" + R.int(12)] = 5;
  if (R.maybe(0.15)) for (let i = 0; i < 520; i++) pet.owned["o" + R.int(900)] = dayAt(R.int(40));
  if (R.maybe(0.15)) for (let i = 0; i < 25; i++) { pet.grew["g" + R.int(30)] = 1 + R.int(9); pet.needs["n" + R.int(30)] = R.int(3); }
  if (R.maybe(0.15)) {
    const d = dayAt(R.int(span));
    pet.care[d] = { play: 1, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["u" + R.int(60), i])), feed: Object.fromEntries(Array.from({ length: 40 }, () => ["f" + R.int(60), 1 + R.int(3)])) };
  }
  if (R.maybe(0.4)) {
    pet.wear = junk(R, { head: R.pick(["hat", "cap"]), decor: R.maybe(0.5) ? (R.maybe(0.3) ? Array.from({ length: 30 }, (_, i) => "w" + R.int(40) + i) : ["weed"]) : undefined, at: R.maybe(0.1) ? R.pick([1e308, "5", -1]) : 100 * R.int(30) });
    if (pet.wear && typeof pet.wear === "object") addUnknown(R, pet.wear);
  }
  if (R.maybe(0.3)) pet.v = R.pick([1, 1, "1", 2]);
  addUnknown(R, pet);
  if (R.maybe(0.05)) Object.assign(pet, hostile('{"__proto__":{"polluted":1}}'));
  if (R.maybe(0.03)) pet.earned = R.pick(["x", [1], null, 5]);
  if (R.maybe(0.03)) pet.care = R.pick(["x", [1], null]);
  return pet;
}
/* three offline profiles of one base: the same history, then each device's own */
function petTriple(R: Rng): any[] {
  const wide = R.maybe(0.4), span = wide ? 520 : 120;
  const base: any = wide ? { v: 1, care: {}, spent: {}, earned: {} } : {};
  if (wide) {
    for (let i = 0; i < 400 + R.int(50); i++) base.care[dayAt(i)] = { play: 1 };
    for (let i = 0; i < 100 + R.int(20); i++) { base.spent["buy:" + dayAt(i) + ":fish:z:1"] = 5; base.earned["review:" + dayAt(i) + ":ch01#a"] = 5; }
  }
  return [0, 1, 2].map((i) => profile(R, base, "abc"[i], span));
}

describe("mergePet", () => {
  const J = (x: unknown) => canon(x);
  it("is commutative, associative and idempotent over 600 seeded triples of offline profiles, pruned", () => {
    const R = rng(20261023);
    let pruned = 0, damaged = 0;
    for (let i = 0; i < 600; i++) {
      const seed = R.int(2 ** 31), S = rng(seed);
      const [a, b, c] = petTriple(S);
      const ab = mergePet(a, b);
      expect(J(ab), "seed " + seed + ": commutative").toBe(J(mergePet(b, a)));
      expect(J(mergePet(ab, c)), "seed " + seed + ": associative").toBe(J(mergePet(a, mergePet(b, c))));
      expect(J(mergePet(ab, ab)), "seed " + seed + ": idempotent").toBe(J(ab));
      expect(J(mergePet(ab, a)), "seed " + seed + ": absorbs an input").toBe(J(ab));
      expect(Object.keys(ab.care).length).toBeLessThanOrEqual(PRUNE_CARE_DAYS);
      if (Object.keys(ab.care).length === PRUNE_CARE_DAYS) pruned++;
      expect(new Set(Object.keys(ab.spent).map((k) => k.split(":")[1])).size).toBeLessThanOrEqual(PRUNE_CARE_DAYS);
      if (a.earned === null || typeof a.earned !== "object" || a.wear === null) damaged++;
      expect(({} as any).polluted).toBeUndefined();
    }
    expect(pruned).toBeGreaterThan(100);
    expect(damaged).toBeGreaterThan(5);
  }, LONG);

  it("T1: the same cause earned on two devices is one id, and counts once in the balance", () => {
    const id = "strong:ch01#one-unknown";
    const r = mergePet({ v: 1, earned: { [id]: 20 } }, { v: 1, earned: { [id]: 20 } });
    expect(Object.keys(r.earned)).toEqual([id]);
    expect(balance(r)).toBe(20);
  });

  it("T2: a feed bought on A and a feed counter on B both survive; later needs, earliest grew and earlier owned win", () => {
    const buy = (k: number) => "feed:2026-10-01:fish:a:" + k;
    const A = { v: 1, spent: { [buy(1)]: 10, [buy(2)]: 10 }, needs: { tummy: { n: 4, at: 100 } }, grew: { fry: 50 }, owned: { hat: "2026-10-03" } };
    const B = { v: 1, care: { "2026-10-01": { feed: { fish: 1 } } }, needs: { tummy: { n: 2, at: 200 } }, grew: { fry: 30 }, owned: { hat: "2026-10-02" } };
    const r = mergePet(A, B);
    expect(Object.keys(r.spent).length).toBe(2);
    expect(r.care["2026-10-01"].feed.fish).toBe(1);
    expect(r.needs.tummy).toEqual({ n: 2, at: 200 });
    expect(r.grew.fry).toBe(30);
    expect(r.owned.hat).toBe("2026-10-02");
  });

  it("T5: two states of 500 care days each come out at 400, and the laws hold on the pruned inputs", () => {
    const mk = (from: number) => {
      const care: any = {};
      for (let i = 0; i < 500; i++) care[dayAt(from + i)] = { play: 1 + (i % 3) };
      return { v: 1, care };
    };
    const a = mk(0), b = mk(250), c = mk(100);
    const ab = mergePet(a, b);
    expect(Object.keys(ab.care).length).toBe(PRUNE_CARE_DAYS);
    expect(Object.keys(ab.care).sort()[0]).toBe(dayAt(750 - PRUNE_CARE_DAYS));
    expect(J(mergePet(ab, c))).toBe(J(mergePet(a, mergePet(b, c))));
    const pa = mergePet(a, {}), pb = mergePet(b, {});
    expect(Object.keys(pa.care).length).toBe(PRUNE_CARE_DAYS);
    expect(J(mergePet(pa, pb))).toBe(J(ab));
    expect(J(mergePet(pb, pa))).toBe(J(ab));
    expect(J(mergePet(ab, ab))).toBe(J(ab));
  });

  it("regression: the ledgers are not pruned by time, so a learner is never locked out", () => {
    const spent: any = {}, earned: any = {};
    const day = (i: number) => {
      for (let k = 0; k < 5; k++) earned["review:" + dayAt(i) + ":ch01#s" + k] = 5;
    };
    for (let i = 0; i < 120; i++) { day(i); spent["feed:" + dayAt(i) + ":fish:a:1"] = 25; }
    const r = mergePet({ v: 1, earned, spent }, {});
    expect(balance(r)).toBe(0);
    for (let i = 120; i < 420; i++) day(i);
    const r2 = mergePet({ v: 1, earned, spent }, mergePet({}, {}));
    expect(balance(r2)).toBe(7500);
    expect(canBuy(r2, 5)).toBe(true);
    expect(Object.keys(r2.spent).length).toBe(120);
  });

  it("a top-level pet that is no record loses to a record, in either order, and two such go through later", () => {
    const rec = { v: 1, gift: { "2026-10-01": 1 } };
    for (const bad of ["x", null, 5, [1]]) {
      expect(J(mergePet(bad, rec))).toBe(J(mergePet(rec, bad)));
      expect(mergePet(bad, rec).gift).toEqual({ "2026-10-01": 1 });
    }
    expect(mergePet("x", "y")).toBe("y");
  });

  it("a wear tie on equal at goes to the greater canonical JSON, in either order", () => {
    const a = { wear: { head: "hat", at: 10 } }, b = { wear: { head: "cap", at: 10 } };
    expect(J(mergePet(a, b).wear)).toBe(J(mergePet(b, a).wear));
    expect(mergePet(a, b).wear.head).toBe("hat");
  });

  it("prunePet(x) equals mergePet(x, {}) over 100 random raw records", () => {
    const R = rng(4242);
    for (let i = 0; i < 100; i++) {
      const [a] = petTriple(R);
      expect(J(prunePet(a)), "case " + i).toBe(J(mergePet(a, {})));
    }
  });

  it("ignores a need at past the bound and carries unknown fields", () => {
    const r = mergePet({ needs: { tummy: { n: 5, at: 1e308 }, odd: 1 }, x: "a" }, { needs: { tummy: { n: 2, at: 20 } }, x: "b" });
    expect(r.needs.tummy).toEqual({ n: 2, at: 20 });
    expect(r.needs.odd).toBe(1);
    expect(r.x).toBe("b");
  });

  it("takes the whole wear of the later at, and later when none qualifies", () => {
    expect(mergePet({ wear: { head: "hat", at: 10 } }, { wear: { back: "cape", at: 20, z: 1 } }).wear).toEqual({ back: "cape", at: 20, z: 1 });
    expect(mergePet({ wear: { head: "hat", at: 1e308 } }, { wear: { back: "cape", at: 20 } }).wear).toEqual({ back: "cape", at: 20 });
    expect("wear" in mergePet({}, {})).toBe(false);
  });

  it("X-10b: care.runs merges by max beside play, and an absent runs stays absent", () => {
    const d = "2026-10-01";
    const a = { care: { [d]: { play: 1, runs: 3 } } }, b = { care: { [d]: { play: 2, runs: 1, clean: 1 } } }, c = { care: { [d]: { play: 2 } } };
    expect(mergePet(a, b).care[d]).toEqual({ play: 2, runs: 3, clean: 1 });
    expect(mergePet(b, a)).toEqual(mergePet(a, b));
    expect(mergePet(a, a).care[d]).toEqual({ play: 1, runs: 3 });
    expect(mergePet(c, c).care[d]).not.toHaveProperty("runs");
    expect(mergePet({ care: { [d]: { runs: "x" } } }, c).care[d]).not.toHaveProperty("runs");
  });

  it("treats __proto__ as data that never reaches a prototype", () => {
    const evil = hostile('{"v":1,"earned":{"__proto__":{"polluted":1},"strong:constructor":20,"strong:ch01#a":20},"care":{"__proto__":{"play":1},"2026-10-01":{"__proto__":{"polluted":1},"play":2}},"grew":{"__proto__":9}}');
    const out = mergePet(evil, evil);
    expect(Object.getPrototypeOf(out.earned)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(out.care)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
    expect(out.earned.polluted).toBeUndefined();
    expect(out.earned["strong:constructor"]).toBe(20);
    expect(Object.prototype.hasOwnProperty.call(out.earned, "constructor")).toBe(false);
    expect(out.care["2026-10-01"].play).toBe(2);
  });
});

describe("merge() and the pet", () => {
  it("adds pet only when a side has one", () => {
    expect(Object.prototype.hasOwnProperty.call(merge({}, {}), "pet")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merge({ game: {} }, { events: {} }), "pet")).toBe(false);
    expect(merge({ pet: { v: 1, gift: { "2026-10-01": 1 } } }, {}).pet.gift).toEqual({ "2026-10-01": 1 });
    expect(Object.prototype.hasOwnProperty.call(merge({}, { pet: {} }), "pet")).toBe(true);
  });
});
