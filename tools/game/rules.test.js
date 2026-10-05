#!/usr/bin/env node
/* Pure checks of the game rules in assets/game.js, run in a vm with in-memory stores
   (no DOM: game.js skips its page decoration when there is no document.body).
     - the level curve: level(threshold(L)) = L and a round trip for every xp 0..60000
     - the combo table: bonus from the pips before, +1 pip, −2 on a first miss or a first
       answer given with the solution open, the shield, nothing for later misses or inline
       misses, nothing for opening a solution or a clue
     - hearts and medals on fixtures, including a set solved with no attempt record
     - the reward invariant: every road to an exercise's first right answer, and the answers
       after it, through the real rules of site.js and game.js, XP, combo, hearts and medal
       together
     - every achievement predicate on fixtures, false on an empty store
     - the recall boxes and run XP of recordRun, and the XP across a simulated day: less
       per section the more is paid, the finishing bonus in full twice, the Daily's bonus
       untouched, counts on this device only, fresh on a new day
     - play settings and game records keep what a later version of the site added to them
   Usage: node tools/game/rules.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }

function dayKey(d) {
  d = d || new Date();
  const two = (n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); }

/* The real exercise rules of assets/site.js (xpFor, paysFirst, and Road, how a check,
   an opened solution and an opened clue change an exercise's record), from the file run
   under a stub window, as tools/check-static.js runs it for grading. */
function loadSite() {
  const noop = () => {};
  const el = {
    getAttribute: () => null, setAttribute: noop, removeAttribute: noop, hasAttribute: () => false,
    appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
  };
  const win = {
    console, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    document: {
      readyState: "complete", body: el, documentElement: el, querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: () => el, addEventListener: noop
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
  };
  win.window = win;
  win.self = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8"), win, { filename: "assets/site.js" });
  return win.BMSite;
}
const SITE = loadSite();
/* src/ui/review.ts, the module the pages import ahead of game.js for window.BMReview, read by
   Node itself (it strips the types): the same rules the browser runs */
const REVIEW = require("../../src/ui/review.ts").api;

/* A world: the stores site.js would expose, kept in a plain object. */
function world(seedStores) {
  const mem = {};
  Object.keys(seedStores || {}).forEach((k) => { mem[k] = JSON.stringify(seedStores[k]); });
  const listeners = [];
  const events = [];
  const keys = {
    progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1",
    activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1"
  };
  const read = (k, f) => (k in mem ? JSON.parse(mem[k]) : f);
  const Store = {
    keys, read,
    write: (k, v, silent) => { mem[k] = JSON.stringify(v); if (!silent) Store.emit({ type: "state", key: k }); return true; },
    on: (fn) => listeners.push(fn),
    emit: (c) => { events.push(c); listeners.slice().forEach((fn) => fn(c)); }
  };
  const obj = (x) => (x && typeof x === "object" ? x : {});
  const win = {
    console, setTimeout, clearTimeout, Math, JSON, Date,
    matchMedia: () => ({ matches: false }),
    document: {
      documentElement: { hasAttribute: () => false, setAttribute() {}, removeAttribute() {} },
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null
    },
    BMStore: Store,
    BMSite: { dayKey, escapeHtml: (s) => String(s), rootPrefix: () => "", chapterOf: () => null, paysFirst: SITE.paysFirst },
    BMProgress: {
      all: () => obj(read(keys.progress, {})),
      count: (id) => { const r = obj(obj(read(keys.progress, {}))[id]); return { solved: Object.keys(obj(r.solved)).length, total: r.total || 0 }; }
    },
    BMAttempts: { all: () => obj(read(keys.attempts, {})), chapter: (id) => obj(obj(read(keys.attempts, {}))[id]) },
    BMPlay: {
      all: () => obj(read(keys.play, {})),
      chapter: (id) => { const r = obj(obj(read(keys.play, {}))[id]); return { done: obj(r.done), total: r.total || 0, guess: r.guess === undefined ? null : r.guess }; },
      count: (id) => { const r = obj(obj(read(keys.play, {}))[id]); return { done: Object.keys(obj(r.done)).length, total: r.total || 0 }; }
    },
    BMActivity: {
      all: () => { const p = obj(read(keys.activity, {})); p.days = obj(p.days); return p; },
      total: () => { const d = obj(obj(read(keys.activity, {})).days); return Object.values(d).reduce((a, b) => a + b, 0); },
      today: () => obj(obj(read(keys.activity, {})).days)[dayKey()] || 0,
      goal: () => 30, streak: () => 0,
      add: (xp, why) => {
        const p = obj(read(keys.activity, {})); p.days = obj(p.days);
        p.days[dayKey()] = (p.days[dayKey()] || 0) + xp;
        Store.write(keys.activity, p);
        Store.emit({ type: "xp", xp, why });
      }
    },
    BMInsights: { WEAK: 0.34, sections: () => win.__rows || [] },
    /* the schedule and the Arena's XP rules, which every entry puts up before game.js */
    BMReview: REVIEW
  };
  win.window = win;
  vm.createContext(win);
  ["data/curriculum.js", "data/quest.js", "assets/game.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), win, { filename: f });
  });
  return { win, Game: win.BMGame, Store, mem, events, read };
}

/* ------------------------------------------------------------------ levels */
{
  const { Game } = world();
  eq([1, 2, 3, 4, 5].map(Game.threshold), [0, 25, 60, 105, 160], "threshold(L) = 5(L-1)(L+3)");
  let ok = true;
  for (let xp = 0; xp <= 60000; xp++) {
    const L = Game.level(xp);
    if (!(Game.threshold(L) <= xp && xp < Game.threshold(L + 1))) { ok = false; console.error("level(" + xp + ") = " + L); break; }
  }
  check(ok, "level curve round trip for xp 0..60000");
  let ok2 = true;
  for (let L = 1; L <= 120; L++) if (Game.level(Game.threshold(L)) !== L || Game.level(Game.threshold(L) - 1) !== Math.max(1, L - 1)) ok2 = false;
  check(ok2, "level(threshold(L)) = L at every boundary");
  eq([1, 2, 3, 5, 6, 9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 99].map(Game.rank),
    ["Counter", "Counter", "Reckoner", "Reckoner", "Solver", "Solver", "Geometer", "Geometer", "Cartographer", "Cartographer",
      "Analyst", "Analyst", "Prover", "Prover", "Mathematician", "Mathematician"], "ranks");
  const inf = Game.info(70);
  eq([inf.level, inf.floor, inf.next, inf.into, inf.span], [3, 60, 105, 10, 45], "info(70)");
}

/* ------------------------------------------------------------------- combo */
{
  const { Game, Store } = world();
  const first = (base) => Game.bonus({ chapter: "ch05", key: "e1", inline: false, rec: { first: 1, tries: 1, solved: 1 }, base });
  const r = [first(10), first(10), first(10)];
  eq(r.map((x) => 10 + x.bonus), [10, 12, 14], "three first-try answers give 10, 12, 14 XP");
  eq(Game.combo().pips, 3, "three pips after three first-try answers");
  eq(r[2].mult, 1.4, "multiplier shown is 1 + 0.2 × pips before");
  eq(Game.bonus({ rec: { first: 0, tries: 2, solved: 1 }, base: 6 }), null, "not first try: no bonus");
  eq(Game.combo().pips, 3, "not first try: meter unchanged");
  first(5); first(5);
  eq(Game.combo().pips, 5, "meter caps at 5");
  eq(first(10).bonus, 10, "full meter doubles: base × 0.2 × 5");
  eq(Game.game().maxed, 1, "maxed counts reaching 5 once");
  eq(first(5).bonus, 5, "inline first try uses its own base (5 × 0.2 × 5)");

  const miss = (o) => Store.emit(Object.assign({ type: "attempt", chapter: "ch05", key: "e9", section: "angles", inline: false, correct: false, tryNo: 1, hintLevel: 1, solutionOpen: false }, o));
  miss();
  eq(Game.combo().pips, 3, "first miss on a scored exercise: −2 pips");
  miss({ tryNo: 2 });
  eq(Game.combo().pips, 3, "second miss on the same exercise: nothing");
  miss({ inline: true });
  eq(Game.combo().pips, 3, "miss on an inline check: nothing");
  miss({ key: "e13", solutionOpen: true });
  eq(Game.combo().pips, 1, "a first miss with the solution open: −2 pips, like any first miss");
  Game.updateRun((run) => { run.combo.pips = 3; });
  const right = (o) => Store.emit(Object.assign({ type: "attempt", chapter: "ch05", key: "e14", section: "angles", inline: false, correct: true, tryNo: 1, hintLevel: 0, solutionOpen: true }, o));
  right();
  eq(Game.combo().pips, 1, "a first answer given with the solution open: −2 pips, what a miss in its place costs");
  Game.updateRun((run) => { run.combo.pips = 3; });
  right({ key: "e15", tryNo: 2 });
  eq(Game.combo().pips, 3, "a right answer with the solution open after a miss: nothing more, the miss was charged");
  right({ key: "e16", inline: true });
  eq(Game.combo().pips, 3, "an inline check answered with the solution open: nothing");
  right({ key: "e17", solutionOpen: false });
  eq(Game.combo().pips, 3, "a right first answer of one's own: the attempt event takes nothing (bonus adds the pip)");

  Game.updateRun((run) => { run.combo.shield = true; });
  miss({ key: "e10" });
  eq([Game.combo().pips, Game.combo().shield], [3, false], "shield absorbs a first miss");

  Store.emit({ type: "opened", chapter: "ch05", key: "e11", section: "angles", inline: false, solved: false, tries: 1 });
  eq(Game.combo().pips, 3, "solution opened after a try: meter kept");
  Game.updateRun((run) => { run.combo.shield = false; });
  Store.emit({ type: "opened", chapter: "ch05", key: "e12", section: "angles", inline: false, solved: false, tries: 0 });
  eq([Game.combo().pips, Game.combo().shield], [3, false], "solution opened before any try: opening it costs nothing, the meter is kept");
  Store.emit({ type: "opened", chapter: "ch05", key: "i3", section: "angles", inline: true, solved: false, tries: 0 });
  eq(Game.combo().pips, 3, "opening an inline check's solution: nothing");
  check(!/emptyMeter|peeked/.test(fs.readFileSync(path.join(ROOT, "assets/game.js"), "utf8")), "game.js has no meter-emptying left for an opened solution");

  /* a right first check after clue 2 or 3 pays like a solve after a miss: no pip gained, none lost */
  const at = Game.combo().pips;
  eq(Game.bonus({ rec: { first: 1, tries: 1, solved: 1, rung: 2 }, base: 6 }), null, "first try after clue 2: no combo bonus");
  eq(Game.combo().pips, at, "first try after clue 2: the meter is unchanged");
  check(Game.bonus({ rec: { first: 1, tries: 1, solved: 1, rung: 1 }, base: 10 }) !== null && Game.combo().pips === at + 1, "first try after clue 1 only: the pip as before");

  const calm = world({ "bm.prefs.v1": { calm: true } });
  eq(calm.Game.bonus({ rec: { first: 1 }, base: 10 }), null, "calm mode: no combo bonus");
  eq(calm.Game.combo().pips, 0, "calm mode: meter does not move");
}

/* --------------------------------------------------------- hearts, medals */
{
  const keys = ["e1", "e2", "e3", "e4"];
  const S = (solved, recs, extra) => Object.assign({
    progress: { ch05: { solved: Object.fromEntries(solved.map((k) => [k, true])), total: 4 } },
    attempts: { ch05: recs }, play: {}, activity: { days: {} },
    game: { ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: 0 },
    run: { combo: { pips: 0, shield: false }, seen: {}, sets: { ch05: { practice: keys } } }
  }, extra || {});
  const { Game } = world();
  const F = { tries: 1, solved: 1, first: 1 };
  let st = Game.setStats(S([], {}), "ch05", keys);
  eq([st.hp, st.hearts, st.medal, st.won, st.how.join()], [4, 3, 0, false, "open,open,open,open"], "fresh set");
  st = Game.setStats(S(keys, { e1: F, e2: F, e3: F, e4: F }), "ch05", keys);
  eq([st.hp, st.hearts, st.medal, st.first], [0, 3, 3, 4], "all first try: Gold");
  st = Game.setStats(S(keys, { e1: F, e2: { tries: 2, solved: 1, first: 0 }, e3: F, e4: { tries: 1, solved: 1, first: 0, opened: 1 } }), "ch05", keys);
  eq([st.hearts, st.medal, st.how.join()], [2, 2, "first,solved,first,opened"], "a miss and a solution opened first: one heart lost (the miss), Silver (both count), segments by how they fell");
  st = Game.setStats(S(keys, { e1: { tries: 3, solved: 1, first: 0 }, e2: { tries: 2, solved: 1, first: 0 }, e3: { tries: 2, solved: 1, first: 0 }, e4: { tries: 2, solved: 1, first: 0 } }), "ch05", keys);
  eq([st.hearts, st.medal], [0, 1], "four misses: hearts floor at 0, Bronze");
  st = Game.setStats(S(keys, {}), "ch05", keys);
  eq([st.hp, st.hearts, st.medal, st.how.join()], [0, 3, 3, "unknown,unknown,unknown,unknown"], "solved with no attempt record: unknown segments, no misses, Gold");
  st = Game.setStats(S(["e1"], { e2: { tries: 1 }, e3: { opened: 1 } }), "ch05", keys);
  eq([st.hp, st.hearts, st.medal], [3, 2, 0], "an unsolved wrong check is a miss, an opened solution is not; no medal before clearing");
  st = Game.setStats(S(keys, { e1: F, e2: { tries: 1, solved: 1, first: 0, opened: 1 }, e3: { tries: 1, solved: 1, first: 0, opened: 1 }, e4: { tries: 1, solved: 1, first: 0, opened: 1 } }), "ch05", keys);
  eq([st.hearts, st.medal], [3, 1], "three solutions opened first: no heart lost, and Bronze, as three misses would give");
  st = Game.setStats(S(keys, { e1: F, e2: { tries: 1, solved: 1, first: 1, rung: 3 }, e3: F, e4: F }), "ch05", keys);
  eq([st.hearts, st.medal], [3, 3], "clues do not touch hearts or the medal");
  const up = S(keys, { e1: F, e2: { tries: 2, solved: 1, first: 0 }, e3: { tries: 2, solved: 1, first: 0 }, e4: { tries: 2, solved: 1, first: 0 } });
  up.game.enc = { "ch05/practice": { medal: 3, day: "2026-02-01" } };
  const w2 = world({ "bm.progress.v1": up.progress, "bm.attempts.v1": up.attempts, "bm.game.v1": up.game, "bm.run.v1": up.run });
  eq(w2.Game.medal("ch05", "practice"), 3, "a rematch medal raises a Bronze to Gold");
  check(w2.Game.isMiss({ tries: 1 }) && !w2.Game.isMiss({ tries: 1, solved: 1, first: 1 }) && !w2.Game.isMiss({}), "isMiss");
  check(!w2.Game.isMiss({ opened: 1 }) && !w2.Game.isMiss({ tries: 1, solved: 1, first: 0, opened: 1 }) && w2.Game.isMiss({ tries: 2, solved: 1, first: 0, opened: 1 }),
    "isMiss counts wrong checks only, never an opened solution");
}

/* ------------ the invariant: a clue is never charged, and no help pays more than effort */
/* Every road an exercise can take to its first correct answer, made of the actions a
   reader has before it: open clue 1, 2, 3 (in that order), check a wrong answer (up to
   twice), open the solution (once), then the right check. Each road is run through the
   real rules: the record changes of site.js (BMSite.road, as check(), reveal() and the
   ladder's persist apply them), the XP of site.js (xpFor), the combo of game.js (bonus,
   and the attempt event that check() emits for every check, wrong or right), and the
   hearts and medal of game.js (setStats) for a four-problem set whose other three went
   right first time. After it come five more answers right first time on fresh
   exercises, because the pips a road keeps or loses pay on every answer after it: the XP
   is compared after the road and after each of those answers, from every meter (0 to 5
   pips, with and without a shield). Then, together:
     XP     a right first check pays 10 with no clue or clue 1 only, 6 after clue 2 or 3,
            6 after a miss, 3 with the solution open; a road never earns more, on its
            exercise or by any answer after it, than the same road with its help taken out,
            and a road with the solution open never more than the same road with a miss in
            the solution's place
     combo  a pip is gained exactly when the first-time rate is paid; two pips (or the
            shield) go at most once per exercise, on its first check when that check is
            wrong or made with the solution open, so the solution leaves the meter exactly
            where a miss in its place would; a clue never costs a pip
     hearts lost only on a wrong check: one per exercise that had one, whatever help
     medal  the solution opened counts like a miss, never better than miss-then-solve;
            clues never count; for a cleared set it is the medal the old rule gave, so no
            medal a reader was shown changes, and a banked medal is never lowered */
{
  const ACTIONS = ["c1", "c2", "c3", "w", "s"];
  const roads = [];
  (function grow(path) {
    roads.push(path);
    if (path.length >= 5) return;
    ACTIONS.forEach((a) => {
      if (/^c/.test(a) && (path.includes(a) || (a !== "c1" && !path.includes("c" + (+a[1] - 1))))) return;
      if (a === "s" && path.includes("s")) return;
      if (a === "w" && path.filter((x) => x === "w").length >= 2) return;
      grow(path.concat(a));
    });
  })([]);
  const P0 = 2, TAIL = 5;
  const keys = ["e1", "e2", "e3", "e4"];
  const F = { tries: 1, solved: 1, first: 1, section: "angles" };
  const w = world();
  const attempt = (key, rec, ok) => w.Store.emit({
    type: "attempt", chapter: "ch05", key, section: "angles", inline: false,
    correct: ok, tryNo: rec.tries, hintLevel: rec.hints || 0, solutionOpen: !!rec.opened
  });
  /* the right check, in the order check() makes it: the record, the event, the XP */
  const answer = (key, rec) => {
    SITE.road.check(rec, true, 0, false, "angles");
    attempt(key, rec, true);
    const base = SITE.xpFor(rec, false);
    const extra = w.Game.bonus({ chapter: "ch05", key, section: "angles", inline: false, rec, base });
    return { base, bonus: extra ? extra.bonus : 0 };
  };
  const run = (path, pips0 = P0, shield0 = false) => {
    w.mem["bm.run.v1"] = JSON.stringify({ combo: { pips: pips0, shield: shield0 } });
    const rec = {};
    let misses = 0;
    path.forEach((a) => {
      if (/^c/.test(a)) SITE.road.clue(rec, +a[1], false, "angles");
      else if (a === "s") {
        SITE.road.reveal(rec, false, "angles");
        w.Store.emit({ type: "opened", chapter: "ch05", key: "e4", section: "angles", inline: false, solved: false, tries: rec.tries || 0 });
      } else {
        misses++;
        SITE.road.check(rec, false, misses === 1 ? 1 : misses === 2 ? 2 : 0, false, "angles");
        attempt("e4", rec, false);
      }
    });
    const own = answer("e4", rec);
    const c = w.Game.combo();
    /* the XP after this exercise, and after each answer right first time that follows */
    const xp = [own.base + own.bonus];
    for (let i = 0; i < TAIL; i++) {
      const t = answer("t" + i, {});
      xp.push(xp[i] + t.base + t.bonus);
    }
    const S = {
      progress: { ch05: { solved: { e1: true, e2: true, e3: true, e4: true }, total: 4 } },
      attempts: { ch05: { e1: F, e2: F, e3: F, e4: rec } }, play: {}, activity: { days: {} },
      game: { ach: {}, cmp: {}, sec: {}, best: {}, enc: {}, daily: {}, maxed: 0 }, run: { combo: { pips: 0 }, seen: {}, sets: {} }
    };
    const st = w.Game.setStats(S, "ch05", keys);
    /* the rule medals had before the ladder: anything not right first time was a miss */
    const oldMiss = (r) => !!((r.solved && !r.first) || (!r.solved && (r.tries > 0 || r.opened)));
    const oldHearts = Math.max(0, 3 - keys.filter((k) => oldMiss(S.attempts.ch05[k])).length);
    return {
      base: own.base, bonus: own.bonus, pips: c.pips, shield: c.shield, xp, hearts: st.hearts, medal: st.medal,
      oldMedal: oldHearts >= 3 ? 3 : oldHearts >= 1 ? 2 : 1, rec
    };
  };
  const out = new Map(roads.map((p) => [p.join(" "), run(p)]));
  const get = (p) => out.get(p.join(" ")) || run(p);
  const bad = [];
  const want = (cond, path, what) => { if (!cond) bad.push("[" + path.join(" ") + "] " + what); };
  const missThenSolve = get(["w"]);
  const unhelped = (p) => p.filter((a) => a === "w");
  const missInstead = (p) => p.map((a) => (a === "s" ? "w" : a));
  roads.forEach((p) => {
    const o = get(p), wrong = p.includes("w"), sol = p.includes("s");
    const clue = Math.max(0, ...p.filter((a) => /^c/.test(a)).map((a) => +a[1]));
    /* XP */
    want(o.base === (sol ? 3 : wrong ? 6 : clue >= 2 ? 6 : 10), p, "base XP " + o.base);
    if (clue >= 2 || sol) want(o.base + o.bonus <= missThenSolve.base + missThenSolve.bonus, p, "help pays more than miss-then-solve");
    /* combo */
    const firstPays = !sol && !wrong && clue < 2;
    want(o.pips === (firstPays ? P0 + 1 : wrong || sol ? Math.max(0, P0 - 2) : P0), p, "pips " + o.pips);
    want(o.bonus === (firstPays ? Math.round(10 * 0.2 * P0) : 0), p, "combo bonus " + o.bonus);
    /* hearts */
    want(o.hearts === (wrong ? 2 : 3), p, "hearts " + o.hearts);
    /* medal */
    want(o.medal === (wrong || sol ? 2 : 3), p, "medal " + o.medal);
    if (sol) want(o.medal <= missThenSolve.medal, p, "the solution earned a better medal than miss-then-solve");
    want(o.medal === o.oldMedal, p, "medal " + o.medal + " differs from the old rule's " + o.oldMedal);
    /* taking one help action out of the road: never more XP, the same hearts; a clue
       taken out never saves a pip and never changes the medal */
    p.forEach((a, i) => {
      if (a === "w" || (/^c/.test(a) && p.includes("c" + (+a[1] + 1)))) return;
      const q = p.slice(0, i).concat(p.slice(i + 1)), oq = get(q);
      want(o.base <= oq.base, p, "help raised the XP above the road without it [" + q.join(" ") + "]");
      want(o.hearts === oq.hearts, p, "help changed the hearts");
      if (/^c/.test(a)) {
        want(P0 - o.pips <= Math.max(0, P0 - oq.pips), p, "a clue cost a pip that the road without it kept");
        want(o.medal === oq.medal, p, "a clue changed the medal");
      }
    });
    /* the solution with a miss in its place: the same meter and medal, never less XP */
    if (sol) {
      const m = get(missInstead(p));
      want(o.pips === m.pips && o.medal === m.medal, p, "the solution left pips " + o.pips + " and medal " + o.medal + " where a miss in its place leaves " + m.pips + " and " + m.medal);
    }
    /* over the answers after it, from every meter: never more than effort */
    for (let pips0 = 0; pips0 <= 5; pips0++) {
      [false, true].forEach((shield0) => {
        const from = " from " + pips0 + " pips" + (shield0 ? " and a shield" : "");
        const r = pips0 === P0 && !shield0 ? o : run(p, pips0, shield0);
        if (clue || sol) {
          const e = run(unhelped(p), pips0, shield0);
          r.xp.forEach((x, k) => want(x <= e.xp[k], p, "help out-earned the road without it [" + unhelped(p).join(" ") + "] " + k + " answers later" + from + ": " + x + " > " + e.xp[k]));
        }
        if (sol) {
          const m = run(missInstead(p), pips0, shield0);
          r.xp.forEach((x, k) => want(x <= m.xp[k], p, "the solution out-earned a miss in its place " + k + " answers later" + from + ": " + x + " > " + m.xp[k]));
          want(r.pips === m.pips && r.shield === m.shield, p, "the solution left the meter unlike a miss" + from);
        }
      });
    }
  });
  eq(bad.slice(0, 8), [], "the reward invariant over " + roads.length + " roads and the " + TAIL + " answers after each (XP, combo, hearts, medal together)");
  check(roads.length > 100, "the roads cover the actions (" + roads.length + ")");
  /* a medal already banked is never lowered by the new count */
  const banked = world({
    "bm.progress.v1": { ch05: { solved: { e1: true, e2: true, e3: true, e4: true }, total: 4 } },
    "bm.attempts.v1": { ch05: { e1: F, e2: F, e3: F, e4: { tries: 1, solved: 1, first: 0, opened: 1, section: "angles" } } },
    "bm.run.v1": { sets: { ch05: { practice: keys } } },
    "bm.game.v1": { enc: { "ch05/practice": { medal: 3, day: "2026-01-01" } } }
  });
  eq(banked.Game.medal("ch05", "practice"), 3, "a banked Gold stays Gold after a solution was opened on the set");
}

/* ------------------------------------------------------------ achievements */
{
  const empty = world().Game;
  const S0 = empty.stores();
  const ids = empty.ACHIEVEMENTS.map((a) => a.id);
  eq(ids.length, 25, "25 achievements");
  eq(new Set(ids).size, 25, "achievement ids are unique");
  empty.ACHIEVEMENTS.forEach((a) => {
    const p = a.test(S0);
    check(Array.isArray(p) && p.length === 2 && p[0] < p[1] && typeof a.title === "string" && a.text, a.id + " is false on an empty store");
  });

  /* a rich fixture */
  const firsts = {};
  for (let i = 1; i <= 30; i++) firsts["e" + i] = { tries: 1, solved: 1700000000000 + i, first: 1, section: "angles" };
  for (let i = 31; i <= 41; i++) firsts["e" + i] = { tries: 2, hints: 1, solved: 1700000000000 + i, first: 0, section: "angles" };
  const keys = Object.keys(firsts);
  const days = {};
  for (let i = 0; i < 8; i++) days[daysAgo(i)] = 20;
  const play = {};
  ["ch01", "ch02", "ch03", "ch04", "ch05"].forEach((ch) => { play[ch] = { done: { a: true, b: true }, guess: 1 }; });
  const fx = {
    "bm.attempts.v1": { ch05: Object.assign({}, firsts, { i1: { tries: 1, solved: 1, first: 1, inline: 1 }, i2: { tries: 1, solved: 2, first: 1, inline: 1 } }) },
    "bm.progress.v1": { ch05: { solved: Object.fromEntries(keys.map((k) => [k, true])), total: keys.length } },
    "bm.play.v1": play,
    "bm.activity.v1": { days },
    "bm.game.v1": {
      ach: {}, maxed: 1,
      cmp: { ch05: Object.fromEntries(keys.slice(0, 41).map((k) => [k, 1])) },
      sec: { "ch05#angles": { n: 5, ok: 5, box: 3, last: daysAgo(0), fix: 9 } },
      daily: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [daysAgo(i), 1])),
      enc: {}, best: {}
    },
    "bm.run.v1": { sets: { ch05: { practice: keys.slice(0, 30), inline: ["i1", "i2"] } } }
  };
  const { Game } = world(fx);
  const S = Game.stores();
  const done = (id) => { const p = Game.ACHIEVEMENTS.find((a) => a.id === id).test(S); return p[0] >= p[1]; };
  ["first-light", "steady-hand", "full-meter", "second-wind", "comeback", "second-opinion", "studied", "committed",
    "hands-on", "no-stone", "boss-down", "flawless", "regular", "streak-3", "streak-7"].forEach((id) => check(done(id), id + " true on the fixture"));
  ["sure-hand", "rebuilder", "mixed-bag", "echo-hunter", "returning-champion", "keeper", "took-your-time", "streak-30",
    "region-cleared", "ground-up"].forEach((id) => check(!done(id), id + " false on the fixture"));
  eq(Game.ACHIEVEMENTS.find((a) => a.id === "steady-hand").progress(S), [25, 25], "progress is capped at the target");
  eq(Game.ACHIEVEMENTS.find((a) => a.id === "sure-hand").progress(S), [32, 100], "progress counts towards the target (inline first tries count too)");

  /* unlocking: once, with a timestamp, announced as an event */
  const w = world(fx);
  const got = w.Game.evaluate();
  check(got.length === 15, "evaluate unlocks the 15 true ones (got " + got.length + ")");
  check(Object.values(w.Game.game().ach).every((t) => t > 0), "unlocks are timestamped");
  check(w.events.filter((e) => e.type === "achievement").length === 15, "one achievement event each");
  check(w.Game.evaluate().length === 0, "a second evaluation unlocks nothing");
  check(w.Game.unlock("first-light") === false && w.Game.unlock("keeper") === true, "unlock() only once per id");

  /* returning champion: a rematch Silver on a later day than the set was cleared */
  const rc = JSON.parse(JSON.stringify(fx));
  rc["bm.game.v1"].enc = { "ch05/practice": { medal: 2, day: daysAgo(-1) } };
  const wr = world(rc);
  check(wr.Game.ACHIEVEMENTS.find((a) => a.id === "returning-champion").test(wr.Game.stores())[0] === 1, "returning-champion after a later rematch");
}

/* -------------------------------------------------------------- recall/run */
{
  const rows = [
    { id: "ch05#angles", solved: 3, score: 0.1, label: "§5.2", section: { title: "Angles" }, chapter: { id: "ch05" }, path: "x" },
    { id: "ch05#pythagoras", solved: 2, score: 0.5, label: "§5.4", section: { title: "Pythagoras" }, chapter: { id: "ch05" }, path: "y" },
    { id: "ch05#parallels", solved: 0, score: 0.7, label: "§5.3", section: { title: "Parallels" }, chapter: { id: "ch05" }, path: "z" }
  ];
  const w = world();
  w.win.__rows = rows;
  const G = w.Game;
  eq(["ch05#angles", "ch05#pythagoras", "ch05#parallels"].map(G.sectionStatus), ["solid", "shaky", "new"], "section status");
  eq(G.deck().map((d) => [d.id, d.status, d.due]), [["ch05#angles", "solid", true], ["ch05#pythagoras", "shaky", true]], "deck: solved sections, all due at first");
  const res = G.recordRun({
    mode: "standard", hearts: 2, score: 460, day: dayKey(),
    answers: [{ section: "ch05#angles", first: true }, { section: "ch05#angles", first: true }, { section: "ch05#pythagoras", retry: true }, { section: "ch05#pythagoras", pass: true }]
  });
  eq(res.xp, 3 + 3 + 1 + 5, "run XP: 3 per first try on a due section, 1 per retry, +5 for a heart left");
  const sec = G.game().sec;
  eq([sec["ch05#angles"].box, sec["ch05#angles"].n, sec["ch05#angles"].ok], [1, 2, 2], "a clean section moves up one box");
  eq(sec["ch05#pythagoras"].box, 0, "a missed section goes back to box 0");
  G.recordRun({ mode: "standard", hearts: 3, score: 100, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq(G.game().sec["ch05#angles"].box, 1, "promotion at most once a day");
  eq(G.deck().find((d) => d.id === "ch05#angles").due, false, "not due again the same day");
  eq(G.game().best.standard.score, 460, "best keeps the higher score");
  /* the day so far: angles has paid 3 answers (two in full, one at half), and two runs have
     earned the finishing bonus, so the Daily's retry is angles' 4th (half of 1, rounded to
     1) and its finish the day's 3rd (1, not 5); the Daily's own 10 is untouched */
  const d1 = G.recordRun({ mode: "daily", hearts: 1, score: 50, day: dayKey(), answers: [{ section: "ch05#angles", retry: true }] });
  eq([d1.xp, d1.parts], [1 + 1 + 10, { answers: 1, full: 1, finish: 1, daily: 10 }], "Daily: +10 once a day, beside the day's decayed answer and finish");
  const d2 = G.recordRun({ mode: "daily", hearts: 1, score: 50, day: dayKey(), answers: [{ section: "ch05#angles", retry: true }] });
  eq(d2.xp, 0 + 1, "Daily bonus not paid twice in a day (the 5th angles answer, a quarter of 1, rounds to 0)");
  G.recordRun({ mode: "rematch", boss: "ch05", hearts: 3, score: 900, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq(G.game().enc["ch05/practice"], undefined, "a rematch of a set with no sign of a clear records no medal");
  G.recordRun({ mode: "repair", section: "ch05#pythagoras", timed: false, hearts: 3, score: 0, day: dayKey(),
    answers: [1, 2, 3, 4, 5].map(() => ({ section: "ch05#pythagoras", first: true })) });
  check(G.game().sec["ch05#pythagoras"].fix > 0, "a clean repair run marks the section repaired");
  const firsts = Array.from({ length: 10 }, (_, i) => ({ section: "ch05#angles", first: true, late: i < 3 }));
  G.recordRun({ mode: "standard", hearts: 3, score: 800, day: dayKey(), answers: firsts });
  check(!!G.game().ach["took-your-time"], "took-your-time: 10 first-try with 3 after par in a timed run");
}

/* ------------- the deck carries the day each section was last solved on its page (`seen`) */
{
  const noon = new Date(2026, 9, 3, 12).getTime();
  const w = world({ "bm.attempts.v1": { ch05: {
    a: { tries: 1, solved: noon - 864e5, first: 1, section: "angles" }, b: { tries: 1, solved: noon, first: 1, section: "angles" },
    c: { tries: 2, solved: noon - 864e5 * 2, section: "pythagoras" }, d: { tries: 1, inline: 1, solved: noon + 6e5, first: 1, section: "ch05#pythagoras" },
    e: { tries: 3, section: "angles" }
  } } });
  w.win.__rows = [
    { id: "ch05#angles", solved: 2, score: 0, label: "§5.1", section: { title: "Angles" }, chapter: { id: "ch05" }, path: "x" },
    { id: "ch05#pythagoras", solved: 2, score: 0.1, label: "§5.4", section: { title: "Pythagoras" }, chapter: { id: "ch05" }, path: "y" }
  ];
  eq(w.Game.deck().map((d) => [d.id, d.seen, d.due]), [["ch05#angles", "2026-10-03", true], ["ch05#pythagoras", "2026-10-03", true]],
    "deck: the latest page solve's day, a Your turn check and a mixed-review id included, an unsolved try not; `due` unchanged");
}

/* ------------------- Arena XP across a day: less per section the more is done, back tomorrow */
{
  const w = world();
  const G = w.Game;
  const first = (section, n) => Array.from({ length: n }, () => ({ section, first: true }));
  const day = () => w.read("bm.run.v1").arenaDay;
  /* A: the day's first run, four first tries on a section never placed (due, so 3 each):
     answers in one run never lower each other's rate, so all four in full */
  let r = G.recordRun({ mode: "standard", hearts: 3, score: 400, day: dayKey(), answers: first("ch05#angles", 4) });
  eq([r.xp, r.parts, r.reduced, r.finishReduced], [12 + 5, { answers: 12, full: 12, finish: 5, daily: 0 }, [], false],
    "the day's first run pays in full, however many of its answers share a section");
  eq(G.game().sec["ch05#angles"].box, 1, "the decay leaves the boxes to the usual rule: a clean, due showing moves up one");
  /* B: angles (placed today, not due: 2 each) had 4 answers paid earlier today, so this
     run's are paid as its 5th, a quarter each; a new section starts the table again; the
     second finish of the day is still in full */
  r = G.recordRun({ mode: "standard", hearts: 3, score: 300, day: dayKey(), answers: first("ch05#angles", 2).concat(first("ch05#parallels", 1)) });
  eq([r.xp, r.parts.answers, r.parts.full, r.reduced], [1 + 3 + 5, 4, 7, ["ch05#angles"]], "past the 4th, a quarter; another section pays in full; summed and rounded once");
  /* C: a banked run earns no finish and does not count as one; a paid retry decays like a first try */
  r = G.recordRun({ mode: "standard", hearts: 0, finished: false, ended: "banked", score: 30, day: dayKey(), answers: [{ section: "ch05#parallels", retry: true }] });
  eq([r.xp, day().finishes, day().sec["ch05#parallels"]], [1, 2, 2], "a retry counts as a paid answer; a banked run is not a finish");
  /* D: the third finished run of the day pays 1 for finishing, and says so */
  r = G.recordRun({ mode: "standard", hearts: 1, score: 100, day: dayKey(), answers: first("ch05#parallels", 1) });
  eq([r.xp, r.parts.finish, r.finishReduced, r.reduced], [1 + 1, 1, true, ["ch05#parallels"]], "after two finishes in a day the bonus is 1, and the result knows why");
  /* E: a retry without a heart at stake pays nothing and is not counted */
  r = G.recordRun({ mode: "standard", hearts: 3, score: 100, day: dayKey(), answers: [{ section: "ch05#distance", retry: true, hf: true }].concat(first("ch05#distance", 1)) });
  eq([r.xp, day().sec["ch05#distance"]], [3 + 1, 1], "an unpaid retry is not a paid answer");
  eq(day(), { day: dayKey(), sec: { "ch05#angles": 6, "ch05#parallels": 3, "ch05#distance": 1 }, finishes: 4 }, "the day's counts, in bm.run.v1.arenaDay");
  check(!("arenaDay" in G.game()), "the counts stay on this device: nothing of them is in the synced game record");
  /* the Daily's 10 is not reduced, whatever the day holds */
  r = G.recordRun({ mode: "daily", hearts: 3, score: 100, day: dayKey(), answers: first("ch05#angles", 1) });
  eq([r.parts.daily, r.parts.answers, r.parts.finish], [10, 1, 1], "the Daily bonus is paid in full beside a decayed answer and finish");
  eq(w.read("bm.activity.v1").days[dayKey()], 17 + 9 + 1 + 2 + 4 + 12, "what was paid is what reached the day's XP");
  /* a new local day starts the counts again: the clock moves on to tomorrow */
  const tomorrow = daysAgo(-1), today = dayKey();
  w.win.BMSite.dayKey = (d) => (d ? dayKey(d) : tomorrow);
  r = G.recordRun({ mode: "standard", hearts: 3, score: 100, day: tomorrow, answers: first("ch05#angles", 2) });
  eq([r.xp, r.reduced, day()], [2 + 2 + 5, [], { day: tomorrow, sec: { "ch05#angles": 2 }, finishes: 1 }], "the next day pays in full again, from fresh counts");
  /* a run dealt on an earlier day and settled later counts against its own day, and leaves
     the later day's counts as they were */
  G.recordRun({ mode: "standard", hearts: 3, score: 100, day: today, answers: first("ch05#parallels", 1) });
  eq(day(), { day: tomorrow, sec: { "ch05#angles": 2 }, finishes: 1 }, "an older run does not overwrite a later day's counts");
  /* the clock set back to today: tomorrow's counts can only be a wrong clock's, so they are
     dropped and today's are kept from here on, and the day's decay still applies */
  w.win.BMSite.dayKey = dayKey;
  r = G.recordRun({ mode: "standard", hearts: 3, score: 100, day: today, answers: first("ch05#parallels", 2) });
  eq([r.parts.answers, day()], [4, { day: today, sec: { "ch05#parallels": 2 }, finishes: 1 }], "a clock moved back keeps that day's counts, not a later day's");
  r = G.recordRun({ mode: "standard", hearts: 3, score: 100, day: today, answers: first("ch05#parallels", 2) });
  eq([r.parts.answers, r.reduced, day().sec], [2, ["ch05#parallels"], { "ch05#parallels": 4 }], "so a second run on the same section that day pays less");
  /* damaged counts are read as none */
  const w2 = world({ "bm.run.v1": { arenaDay: { day: dayKey(), sec: { "ch05#angles": "x", "ch05#parallels": -3 }, finishes: "lots" } } });
  r = w2.Game.recordRun({ mode: "standard", hearts: 3, score: 100, day: dayKey(), answers: first("ch05#angles", 1).concat(first("ch05#parallels", 1)) });
  eq([r.xp, r.reduced], [3 + 3 + 5, []], "counts that are not numbers start from nothing");
}

/* ------------------------------------------- review fixes: runs and medals */
{
  const keys = ["e1", "e2", "e3", "e4"];
  const at = (d) => new Date(d + "T12:00:00").getTime();
  const cleared = (day, recs) => ({
    "bm.progress.v1": { ch05: { solved: Object.fromEntries(keys.map((k) => [k, true])), total: 4 } },
    "bm.attempts.v1": { ch05: recs || Object.fromEntries(keys.map((k) => [k, { tries: 1, solved: at(day), first: 1, section: "angles" }])) },
    "bm.run.v1": { sets: { ch05: { practice: keys } } }
  });
  const rc = (G) => G.ACHIEVEMENTS.find((a) => a.id === "returning-champion").test(G.stores());
  const miss3 = [1, 2, 3].map(() => ({ section: "ch05#angles" }));

  /* a rematch lost on hearts, from an empty store: no medal, no false Boss down */
  let w = world();
  let r = w.Game.recordRun({ mode: "boss", boss: "ch05", hearts: 0, ended: "hearts", finished: false, ranked: true, score: 0, day: dayKey(), answers: miss3 });
  eq([r.medal, w.Game.game().enc, w.Game.medal("ch05")], [0, {}, 0], "a rematch ending at 0 hearts records no medal");
  w.Game.evaluate();
  check(!w.Game.game().ach["boss-down"], "a lost rematch does not unlock Boss down");

  /* a rematch of a set this device can see is not cleared: no medal, no Returning champion */
  w = world({ "bm.progress.v1": { ch05: { solved: { e1: true }, total: 4 } }, "bm.attempts.v1": { ch05: { e1: { tries: 1, solved: at(daysAgo(1)), first: 1 } } },
    "bm.run.v1": { sets: { ch05: { practice: keys } } } });
  r = w.Game.recordRun({ mode: "boss", boss: "ch05", hearts: 2, ranked: true, finished: true, score: 500, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq([r.medal, w.Game.game().enc, rc(w.Game)], [0, {}, [0, 1]], "a rematch of an uncleared set: no medal, Returning champion stays locked");
  /* a synced rematch medal on a device without the set's keys proves nothing */
  w = world({ "bm.game.v1": { enc: { "ch05/practice": { medal: 2, day: dayKey() } } } });
  eq(rc(w.Game), [0, 1], "returning-champion: not counted where the set's keys are unknown");

  /* a later Silver after a same-day Silver: enc keeps the earlier day, the run unlocks it */
  const s5 = cleared(daysAgo(1));
  s5["bm.game.v1"] = { enc: { "ch05/practice": { medal: 2, day: daysAgo(1) } } };
  w = world(s5);
  r = w.Game.recordRun({ mode: "boss", boss: "ch05", hearts: 2, ranked: true, finished: true, score: 500, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq([r.medal, w.Game.game().enc["ch05/practice"].day, !!w.Game.game().ach["returning-champion"]], [2, daysAgo(1), true],
    "a Silver rematch on a later day unlocks Returning champion even when enc keeps the earlier day");
  w = world(cleared(dayKey()));
  w.Game.recordRun({ mode: "boss", boss: "ch05", hearts: 3, ranked: true, finished: true, score: 900, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  check(!w.Game.game().ach["returning-champion"], "a rematch on the day of the clear does not unlock Returning champion");

  /* bests only for ranked runs played through; the Daily only once played through */
  w = world();
  w.Game.recordRun({ mode: "standard", timed: false, ranked: false, finished: true, hearts: null, score: 1600, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  w.Game.recordRun({ mode: "standard", ranked: true, finished: false, ended: "banked", hearts: 0, score: 240, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq(w.Game.game().best, {}, "untimed and banked runs keep no best");
  r = w.Game.recordRun({ mode: "daily", ranked: true, finished: false, ended: "banked", hearts: 0, score: 120, day: dayKey(), answers: [{ section: "ch05#zz", first: true }] });
  eq([r.xp, w.Game.game().daily], [3, {}], "a banked Daily pays its answers only and is not marked played");
  r = w.Game.recordRun({ mode: "standard", ranked: true, finished: true, hearts: 3, score: 0, day: dayKey(), answers: [1, 2, 3].map(() => ({ section: "ch05#yy", pass: true })) });
  eq(r.xp, 0, "a finished run of passes earns no finishing bonus");
  r = w.Game.recordRun({ mode: "standard", ranked: true, finished: true, hearts: 1, score: 30, day: dayKey(), answers: [{ section: "ch05#yy", retry: true }] });
  eq([r.xp, w.Game.game().best.standard.score], [1 + 5, 30], "a finished ranked run with a right answer and a heart: +5 and a best");

  /* the boxes follow 1, 3, 7, 14, 30 days: an early clean showing keeps box and clock */
  w = world();
  const boxes = [3, 2, 1, 0].map((n) => {
    w.Game.recordRun({ mode: "standard", hearts: 3, score: 1, day: daysAgo(n), answers: [{ section: "ch05#angles", first: true }] });
    return w.Game.game().sec["ch05#angles"].box;
  });
  eq([boxes, w.Game.game().sec["ch05#angles"].last], [[1, 1, 1, 2], dayKey()], "promotion waits until the section is due");

  /* a streak from before the game layer is credited */
  const old = {};
  for (let i = 40; i <= 46; i++) old[daysAgo(i)] = 30;
  w = world({ "bm.activity.v1": { days: old } });
  check(w.Game.evaluate().map((a) => a.id).indexOf("streak-7") > -1, "streak-7 counts the longest run in the record, not only the current one");

  /* a cleared set leaves its medal in the synced enc record, dated the day of the clear */
  const recs = Object.fromEntries(keys.map((k) => [k, { tries: 1, solved: at(daysAgo(2)), first: 1 }]));
  recs.e2 = { tries: 2, solved: at(daysAgo(2)), first: 0 };
  w = world(cleared(daysAgo(2), recs));
  w.Game.evaluate();
  eq(w.Game.game().enc["ch05/practice"], { medal: 2, day: daysAgo(2) }, "a cleared set banks its medal in enc");
  check(!w.Game.game().ach["returning-champion"], "a banked clear does not count as a rematch");
  const synced = world({ "bm.progress.v1": { ch02: { solved: {}, total: 9 } }, "bm.game.v1": w.Game.game() });
  eq(synced.Game.medal("ch05", "practice"), 2, "the banked medal shows on a device without the set's keys");
  const s4 = cleared(daysAgo(2), recs);
  delete s4["bm.run.v1"];
  eq(world(s4).Game.medal("ch05", "practice"), 2, "a finished chapter without a review set names its practice set from progress");

  /* one Your turn check does not make a section solid */
  w = world({ "bm.attempts.v1": { ch05: { i1: { tries: 1, solved: 1, first: 1, inline: 1, section: "angles" }, e1: { tries: 1, solved: 1, first: 1, section: "parallels" } } } });
  w.win.__rows = [
    { id: "ch05#angles", solved: 1, score: 0, label: "§5.2", section: { title: "Angles" }, chapter: { id: "ch05" }, path: "x" },
    { id: "ch05#parallels", solved: 1, score: 0, label: "§5.3", section: { title: "Parallels" }, chapter: { id: "ch05" }, path: "y" },
    { id: "ch05#pythagoras", solved: 2, score: 0.1, label: "§5.4", section: { title: "Pythagoras" }, chapter: { id: "ch05" }, path: "z" }
  ];
  eq(["ch05#angles", "ch05#parallels", "ch05#pythagoras"].map(w.Game.sectionStatus), ["new", "solid", "solid"],
    "solid needs two solves or a scored first try; one inline check stays new");
  eq(w.Game.deck().map((d) => d.id), ["ch05#parallels", "ch05#pythagoras"], "the deck leaves out a section met only once inline");

  /* without the set cache, a rematch raises a medal only on evidence the set was cleared */
  const gold = { mode: "boss", boss: "ch05", hearts: 3, ranked: true, finished: true, score: 900, day: dayKey(), answers: keys.map(() => ({ section: "ch05#angles", first: true })) };
  w = world({ "bm.progress.v1": { ch05: { solved: { e1: true }, total: 10 } }, "bm.attempts.v1": { ch05: { e1: { tries: 1, solved: at(daysAgo(1)), first: 1, section: "angles" } } } });
  r = w.Game.recordRun(gold);
  w.Game.evaluate();
  eq([r.medal, w.Game.game().enc, w.Game.medal("ch05"), !!w.Game.game().ach["boss-down"], !!w.Game.game().ach.flawless], [0, {}, 0, false, false],
    "a rematch of an uncleared set with no cache earns no medal and unlocks nothing");
  w = world(s4);
  r = w.Game.recordRun(gold);
  eq([r.medal, w.Game.medal("ch05")], [3, 3], "a rematch of a chapter finished before the cache still earns its medal");

  /* the achievements agree with the medal progress shows for a set finished before the cache */
  w = world(s4);
  w.Game.evaluate();
  eq([!!w.Game.game().ach["boss-down"], !!w.Game.game().ach.flawless], [true, false], "a finished chapter without the cache counts for Boss down");
}

/* ---------------------------------- what a later version of the site adds */
{
  const keys = ["e1", "e2", "e3", "e4"];
  const at = (d) => new Date(d + "T12:00:00").getTime();

  /* play settings: a key this file has never heard of outlives every switch */
  let w = world({ "bm.prefs.v1": { calm: true, motion: "reduced", volume: { music: 0.4 } } });
  eq([w.Game.prefs().calm, w.Game.prefs().motion], [true, "reduced"], "prefs() hands back an unknown key beside the known ones");
  w.Game.setPref("sound", true);
  eq([w.read("bm.prefs.v1").motion, w.read("bm.prefs.v1").volume, w.read("bm.prefs.v1").sound], ["reduced", { music: 0.4 }, true], "switching one setting keeps an unknown key");
  w.Game.setPref("calm", false); w.Game.setPref("map3d", false); w.Game.setPref("tempo", "untimed");
  let p = w.read("bm.prefs.v1");
  eq([p.motion, p.volume, p.sound, p.calm, p.map, p.tempo], ["reduced", { music: 0.4 }, true, false, "list", "untimed"], "every setting switched in turn: the unknown keys are still there");
  /* the settings stay on this device: a "state" change is what account sync listens for */
  eq([w.events.filter((e) => e.type === "state").length, w.events.filter((e) => e.type === "prefs").length], [0, 4], "switching a setting announces prefs and never a state change");
  w.Game.setPref("nonsense", 1);
  eq(w.read("bm.prefs.v1"), p, "a setting this file does not know is not written by setPref");
  p = world({ "bm.prefs.v1": { map: "globe", tempo: "warp" } }).Game.prefs();
  eq([p.sound, p.calm, "map" in p, p.tempo], [false, false, false, "standard"], "the known settings are still normalised");

  /* the game record: an Arena run rewrites a section and a best, and keeps what it does not know */
  w = world({ "bm.game.v1": {
    v: 2, wallet: { coins: 3 },
    sec: { "ch05#angles": { n: 1, ok: 1, box: 0, last: daysAgo(3), ease: 2.5 } },
    best: { standard: { score: 10, hearts: 1, day: daysAgo(3), replay: [1] } }
  } });
  w.Game.recordRun({ mode: "standard", ranked: true, finished: true, hearts: 3, score: 50, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  let g = w.read("bm.game.v1");
  eq([g.v, g.wallet, g.sec["ch05#angles"], g.best.standard],
    [2, { coins: 3 }, { n: 2, ok: 2, box: 1, last: dayKey(), ease: 2.5 }, { score: 50, hearts: 3, day: dayKey(), replay: [1] }],
    "a run keeps unknown fields of the game record, of a section and of a best");

  /* and a medal banked over an older one keeps the old one's unknown field */
  w = world({
    "bm.progress.v1": { ch05: { solved: Object.fromEntries(keys.map((k) => [k, true])), total: 4 } },
    "bm.attempts.v1": { ch05: Object.fromEntries(keys.map((k) => [k, { tries: 1, solved: at(daysAgo(2)), first: 1, section: "angles" }])) },
    "bm.run.v1": { sets: { ch05: { practice: keys } } },
    "bm.game.v1": { enc: { "ch05/practice": { medal: 1, day: daysAgo(9), gate: "open" } }, shop: ["hat"] }
  });
  w.Game.evaluate();
  g = w.read("bm.game.v1");
  eq([g.enc["ch05/practice"], g.shop], [{ medal: 3, day: daysAgo(2), gate: "open" }, ["hat"]], "a banked medal keeps the unknown field of the record it replaces");

  /* and so does a medal raised by a rematch in the Arena */
  w = world({ "bm.game.v1": { enc: { "ch05/practice": { medal: 1, day: daysAgo(9), gate: "open" } }, shop: ["hat"] } });
  const r = w.Game.recordRun({ mode: "boss", boss: "ch05", hearts: 3, ranked: true, finished: true, score: 900, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  g = w.read("bm.game.v1");
  eq([r.medal, g.enc["ch05/practice"], g.shop], [3, { medal: 3, day: dayKey(), gate: "open" }, ["hat"]], "a rematch medal keeps the unknown field of the record it replaces");
}

console.log((fails ? "FAILED" : "ok") + " rules: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
process.exit(fails ? 1 : 0);
