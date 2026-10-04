#!/usr/bin/env node
/* Property test for BMAccount.merge (assets/account.js), including the game record.
   Loads account.js in a vm with small stubs and checks, over 2000 seeded random
   state triples, that merge is commutative, associative and idempotent once the four
   local-first fields are removed (last, activity.goal, lesson.mode, play[ch].guess).
   Also checks that an old-shape state (no `game`) merges cleanly.
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
  return r;
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
      g.sec[id] = s;
    });
  }
  if (chance(0.6)) {
    g.best = {};
    ["standard", "daily", "repair"].forEach((m) => {
      if (chance(0.5)) g.best[m] = { score: int(4) * 100, hearts: int(4), day: day(int(10)) };
    });
  }
  if (chance(0.6)) {
    g.enc = {};
    ["ch02/practice", "ch05/practice"].forEach((id) => {
      if (chance(0.5)) g.enc[id] = { medal: 1 + int(3), day: day(int(10)) };
    });
  }
  if (chance(0.6)) {
    g.daily = {};
    const n = int(80);
    for (let i = 0; i < n; i++) g.daily["2026-" + String(1 + int(9)).padStart(2, "0") + "-" + String(1 + int(28)).padStart(2, "0")] = 1;
  }
  if (chance(0.5)) g.maxed = int(6);
  return g;
}

function state(old) {
  const s = { progress: {}, play: {}, attempts: {}, activity: { days: {} }, lesson: { reached: {} } };
  CHS.forEach((ch) => {
    if (chance(0.6)) {
      const solved = {};
      KEYS.filter((k) => k[0] !== "i").forEach((k) => { if (chance(0.5)) solved[k] = true; });
      s.progress[ch] = { solved, total: int(12) };
    }
    if (chance(0.5)) {
      const done = {};
      ["m1", "m2", "m3"].forEach((m) => { if (chance(0.5)) done[m] = true; });
      s.play[ch] = { done, total: int(5) };
      if (chance(0.5)) s.play[ch].guess = int(4);
    }
    if (chance(0.6)) {
      s.attempts[ch] = {};
      KEYS.forEach((k) => { if (chance(0.5)) s.attempts[ch][k] = attemptRec(ch, k); });
    }
    if (chance(0.5)) s.lesson.reached[ch] = 1 + int(20);
  });
  for (let i = 0; i < 6; i++) if (chance(0.5)) s.activity.days[day(int(30))] = int(200);
  if (chance(0.5)) s.activity.goal = pick([15, 30, 50]);
  if (chance(0.5)) s.lesson.mode = pick(["steps", "page"]);
  s.last = chance(0.5) ? { id: pick(CHS), section: null } : null;
  if (!old) s.game = gameState();
  return s;
}

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

console.log((fails ? "FAILED" : "ok") + " merge: " + N + " triples, commutative / associative / idempotent" +
  (fails ? " (" + fails + " failures)" : ""));
process.exit(fails ? 1 : 0);
