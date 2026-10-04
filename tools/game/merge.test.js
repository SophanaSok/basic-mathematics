#!/usr/bin/env node
/* Property test for BMAccount.merge (assets/account.js), including the game record.
   Loads account.js in a vm with small stubs and checks, over 2000 seeded random
   state triples, that merge is commutative, associative and idempotent once the four
   local-first fields are removed (last, activity.goal, lesson.mode, play[ch].guess).
   Also checks that an old-shape state (no `game`) merges cleanly.
   The states carry what a later version of the site might add: fields no rule knows, at
   every level where the merge builds a record afresh, and a shape marker `game.v`. The
   laws must hold with them in, and every one of them must come out of a merge.
   Usage: node tools/game/merge.test.js [--n=2000] [--seed=1] */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const N = parseInt(args.n || "2000", 10);
let seed = parseInt(args.seed || "1", 10);

function loadAccount() {
  const noop = () => {};
  const win = {
    console,
    BM_CONFIG: {},
    location: { hash: "", search: "", href: "file:///x/index.html" },
    addEventListener: noop,
    localStorage: { getItem: () => null, setItem: noop },
    document: { querySelector: () => null, addEventListener: noop, visibilityState: "visible" },
    BMStore: {
      keys: {
        progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1",
        activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1"
      },
      read: (k, f) => f, write: noop, on: noop, emit: noop
    },
    BMSite: { rootPrefix: () => "", escapeHtml: (s) => String(s) }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/account.js"), "utf8"), win, { filename: "account.js" });
  if (!win.BMAccount || typeof win.BMAccount.merge !== "function") throw new Error("BMAccount.merge not found");
  return win.BMAccount;
}

/* mulberry32 */
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (n) => Math.floor(rnd() * n);
const pick = (list) => list[int(list.length)];
const chance = (p) => rnd() < p;
const CHS = ["ch01", "ch02", "ch05", "interlude"];
const KEYS = ["e1", "e2", "e3", "i1", "i2", "s3d-room"];
const day = (i) => "2026-" + String(1 + (i % 12)).padStart(2, "0") + "-" + String(1 + (i % 28)).padStart(2, "0");

/* Fields from the future: few keys and few values, so two devices often hold the same
   key and disagree about it. The two objects differ only in the order of their keys. */
const NEW_KEYS = ["zz", "~later", "rung"];
const NEW_VALUES = [0, 7, -1, "x", "", true, null, [1, 2], [2, 1], { a: 1, b: [1] }, { b: [1], a: 1 }, { a: { c: 2 } }];
function sprinkle(into, values) {
  NEW_KEYS.forEach((k) => { if (chance(0.2)) into[k] = JSON.parse(JSON.stringify(pick(values))); });
  return into;
}
/* an unknown field of a record can hold anything */
const fields = (rec) => sprinkle(rec, NEW_VALUES);
/* An unknown key of a store keyed by chapter, exercise or section goes through whole only
   when it holds no record (a record there is merged as a chapter, exercise or section,
   like the known keys). No null either: strip() and the sec check below read into every
   entry, as they always have. */
const entries = (map) => sprinkle(map, NEW_VALUES.filter((v) => v !== null && (typeof v !== "object" || Array.isArray(v))));

function attemptRec(ch, k) {
  const r = {};
  if (chance(0.5)) {
    r.tries = 1 + int(4);
    r.solved = 1700000000000 + int(1000) * 1000;
    r.first = r.tries === 1 && chance(0.7) ? 1 : 0;
  } else if (chance(0.5)) {
    r.tries = 1 + int(3);
  } else {
    r.skipped = 1;
  }
  if (chance(0.3)) r.hints = 1 + int(2);
  if (chance(0.2)) { r.opened = 1; if (r.solved) r.first = 0; }
  if (k[0] === "i") r.inline = 1;
  r.section = ch + "-sec-" + k; /* one exercise always tests one section */
  return fields(r);
}

function gameState() {
  const g = {};
  if (chance(0.8)) {
    g.ach = {};
    ["first-light", "steady-hand", "boss-down", "flawless", "regular"].forEach((id) => {
      if (chance(0.4)) g.ach[id] = 1700000000000 + int(50) * 1000;
    });
  }
  if (chance(0.7)) {
    g.cmp = {};
    CHS.forEach((ch) => {
      if (!chance(0.4)) return;
      g.cmp[ch] = {};
      KEYS.forEach((k) => { if (chance(0.4)) g.cmp[ch][k] = 1; });
    });
  }
  if (chance(0.7)) {
    g.sec = {};
    ["ch02#one-unknown", "ch05#angles", "ch01#rationals"].forEach((id) => {
      if (!chance(0.5)) return;
      const n = int(20);
      const s = { n, ok: int(n + 1), box: int(5) };
      if (chance(0.8)) s.last = day(int(40));
      if (chance(0.3)) s.fix = 1700000000000 + int(30) * 1000;
      g.sec[id] = fields(s);
    });
    entries(g.sec);
  }
  if (chance(0.6)) {
    g.best = {};
    ["standard", "daily", "repair"].forEach((m) => {
      if (chance(0.5)) g.best[m] = fields({ score: int(4) * 100, hearts: int(4), day: day(int(10)) });
    });
    entries(g.best);
  }
  if (chance(0.6)) {
    g.enc = {};
    ["ch02/practice", "ch05/practice"].forEach((id) => {
      if (chance(0.5)) g.enc[id] = fields({ medal: 1 + int(3), day: day(int(10)) });
    });
    entries(g.enc);
  }
  if (chance(0.6)) {
    g.daily = {};
    const n = int(80);
    for (let i = 0; i < n; i++) g.daily["2026-" + String(1 + int(9)).padStart(2, "0") + "-" + String(1 + int(28)).padStart(2, "0")] = 1;
  }
  if (chance(0.5)) g.maxed = int(6);
  if (chance(0.3)) g.v = 1 + int(3);
  return fields(g);
}

function state(old) {
  const s = { progress: {}, play: {}, attempts: {}, activity: { days: {} }, lesson: { reached: {} } };
  CHS.forEach((ch) => {
    if (chance(0.6)) {
      const solved = {};
      KEYS.filter((k) => k[0] !== "i").forEach((k) => { if (chance(0.5)) solved[k] = true; });
      s.progress[ch] = fields({ solved, total: int(12) });
    }
    if (chance(0.5)) {
      const done = {};
      ["m1", "m2", "m3"].forEach((m) => { if (chance(0.5)) done[m] = true; });
      s.play[ch] = { done, total: int(5) };
      if (chance(0.5)) s.play[ch].guess = int(4);
      fields(s.play[ch]);
    }
    if (chance(0.6)) {
      s.attempts[ch] = {};
      KEYS.forEach((k) => { if (chance(0.5)) s.attempts[ch][k] = attemptRec(ch, k); });
      entries(s.attempts[ch]);
    }
    if (chance(0.5)) s.lesson.reached[ch] = 1 + int(20);
  });
  for (let i = 0; i < 6; i++) if (chance(0.5)) s.activity.days[day(int(30))] = int(200);
  if (chance(0.5)) s.activity.goal = pick([15, 30, 50]);
  if (chance(0.5)) s.lesson.mode = pick(["steps", "page"]);
  s.last = chance(0.5) ? { id: pick(CHS), section: null } : null;
  [s.progress, s.play, s.attempts].forEach(entries);
  [s.activity, s.lesson].forEach(fields);
  if (!old) s.game = gameState();
  return s;
}

/* every place in a state where a key from the future sits, as a path of keys; what it
   holds is not looked into */
function futurePaths(x, at, out) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return out;
  Object.keys(x).forEach((k) => {
    if (NEW_KEYS.indexOf(k) > -1) out.push(at.concat(k));
    else futurePaths(x[k], at.concat(k), out);
  });
  return out;
}
const dig = (x, at) => at.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), x);

/* drop the fields where this device deliberately keeps its own value */
function strip(m) {
  const c = JSON.parse(JSON.stringify(m));
  delete c.last;
  if (c.activity) delete c.activity.goal;
  if (c.lesson) delete c.lesson.mode;
  Object.keys(c.play || {}).forEach((ch) => { delete c.play[ch].guess; });
  return c;
}
function canon(x) {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
  }
  return JSON.stringify(x === undefined ? null : x);
}
const same = (a, b) => canon(strip(a)) === canon(strip(b));

const Account = loadAccount();
const merge = Account.merge;
let fails = 0;
function fail(what, i, detail) {
  fails++;
  if (fails <= 5) console.error("FAIL " + what + " (case " + i + ")" + (detail ? ": " + detail : ""));
}

for (let i = 0; i < N; i++) {
  const a = state(chance(0.1)), b = state(chance(0.1)), c = state(chance(0.1));
  const ab = merge(a, b), ba = merge(b, a);
  if (!same(ab, ba)) fail("commutative", i);
  if (!same(merge(ab, c), merge(a, merge(b, c)))) fail("associative", i);
  if (!same(merge(ab, ab), ab)) fail("idempotent merge(m, m) = m", i);
  if (!same(merge(ab, b), ab)) fail("absorbs merge(merge(a, b), b) = merge(a, b)", i);
  /* nothing from the future is dropped: held by one side it is kept, held by both the
     one whose canonical JSON is the later string is kept */
  futurePaths(a, [], []).concat(futurePaths(b, [], [])).forEach((at) => {
    const held = [dig(a, at), dig(b, at)].filter((v) => v !== undefined).map(canon).sort();
    if (canon(dig(ab, at)) !== held[held.length - 1] || dig(ab, at) === undefined) fail("an unknown key is carried through", i, at.join("/"));
  });
  const v = Math.max((a.game || {}).v || 0, (b.game || {}).v || 0);
  if (ab.game.v !== (v || undefined)) fail("game.v is the larger, and absent when neither has one", i);
  const g = ab.game;
  if (!g || typeof g !== "object") fail("game present", i);
  else {
    Object.keys(g.sec).forEach((id) => { if (g.sec[id].ok > g.sec[id].n) fail("sec ok <= n", i, id); });
    if (Object.keys(g.daily).length > 60) fail("daily keeps at most 60", i);
  }
}

/* old-shape inputs: no game anywhere, and one side without game */
const oldA = state(true), oldB = state(true), withGame = state(false);
const mo = merge(oldA, oldB);
if (!mo.game || canon(mo.game) !== canon({ ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: 0 })) fail("old shape gives an empty game", -1);
const mixed = merge(oldA, withGame);
if (canon(mixed.game) !== canon(merge(withGame, withGame).game)) fail("old shape keeps the other side's game", -1);
if (canon(merge({}, {}).game) !== canon(mo.game)) fail("empty inputs", -1);

/* spot checks of the per-field rules */
const mg = Account.mergeGame;
const r1 = mg({ ach: { x: 5 } }, { ach: { x: 3, y: 9 } });
if (r1.ach.x !== 3 || r1.ach.y !== 9) fail("ach keeps the earliest time", -2, JSON.stringify(r1.ach));
const r2 = mg({ sec: { s: { n: 4, ok: 4, box: 3, last: "2026-03-01" } } }, { sec: { s: { n: 6, ok: 2, box: 0, last: "2026-03-05", fix: 7 } } });
if (canon(r2.sec.s) !== canon({ n: 6, ok: 4, box: 0, last: "2026-03-05", fix: 7 })) fail("sec rule", -2, JSON.stringify(r2.sec.s));
const r3 = mg({ best: { d: { score: 500, hearts: 1, day: "2026-01-09" } } }, { best: { d: { score: 500, hearts: 1, day: "2026-01-02" } } });
if (r3.best.d.day !== "2026-01-02") fail("best: tie goes to the earlier day", -2);
const r4 = mg({ enc: { e: { medal: 2, day: "2026-01-01" } } }, { enc: { e: { medal: 3, day: "2026-02-01" } } });
if (r4.enc.e.medal !== 3) fail("enc: higher medal", -2);

/* what this version has no rule for (account.js `later`, `carry`) */
const r5 = merge({ attempts: { ch01: { e1: { tries: 2, rung: 1, note: "a" } } } }, { attempts: { ch01: { e1: { tries: 1, solved: 5, first: 1, rung: 3 } } } });
if (canon(r5.attempts.ch01.e1) !== canon({ tries: 2, solved: 5, first: 1, rung: 3, note: "a" })) fail("attempt: unknown fields ride along, known ones keep their rules", -3, JSON.stringify(r5.attempts.ch01.e1));
const r6 = mg({ wallet: { coins: 5 }, sec: { s: { n: 1, ok: 1, box: 2, last: "2026-03-01", ease: 2.5 } }, best: { d: { score: 9, hearts: 1, day: "2026-01-01", run: "a" } } },
  { wallet: { coins: 40 }, sec: { s: { n: 3, ok: 0, box: 0, last: "2026-03-09" } }, enc: { e: { medal: 1, day: "2026-01-01", gate: [1] } } });
if (canon(r6.wallet) !== canon({ coins: 5 })) fail("game: of two unknown values the later canonical JSON is kept (\"5\" sorts after \"40\")", -3, JSON.stringify(r6.wallet));
if (canon(r6.sec.s) !== canon({ n: 3, ok: 1, box: 0, last: "2026-03-09", ease: 2.5 })) fail("sec: an unknown field outlives the record that lost on the known ones", -3, JSON.stringify(r6.sec.s));
if (r6.best.d.run !== "a" || canon(r6.enc.e.gate) !== "[1]") fail("best and enc: unknown fields are carried", -3, JSON.stringify([r6.best, r6.enc]));
const r7 = merge({ progress: { "~later": [1, 2], ch01: { solved: { e1: true }, total: 3, stars: 2 } } }, { progress: { "~later": [1, 3], ch01: { solved: {}, total: 1 } } });
if (canon(r7.progress) !== canon({ "~later": [1, 3], ch01: { solved: { e1: true }, total: 3, stars: 2 } })) fail("progress: a key that holds no record goes through whole", -3, JSON.stringify(r7.progress));
if (canon(mg({ zz: { a: 1, b: 2 } }, { zz: { b: 2, a: 1 } }).zz) !== canon({ a: 1, b: 2 })) fail("key order alone is not a difference", -3);
if (mg({ v: 2 }, {}).v !== 2 || mg({ v: 9 }, { v: 10 }).v !== 10 || "v" in mg({}, {})) fail("game.v: the larger number (not the later string), absent until set", -3);

console.log((fails ? "FAILED" : "ok") + " merge: " + N + " triples, commutative / associative / idempotent" +
  (fails ? " (" + fails + " failures)" : ""));
process.exit(fails ? 1 : 0);
