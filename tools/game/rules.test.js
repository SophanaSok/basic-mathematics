#!/usr/bin/env node
/* Pure checks of the game rules in assets/game.js, run in a vm with in-memory stores
   (no DOM: game.js skips its page decoration when there is no document.body).
     - the level curve: level(threshold(L)) = L and a round trip for every xp 0..60000
     - the combo table: bonus from the pips before, +1 pip, −2 on a first miss, the shield,
       the emptied meter, nothing for later misses or inline misses
     - hearts and medals on fixtures, including a set solved with no attempt record
     - every achievement predicate on fixtures, false on an empty store
     - the recall boxes and run XP of recordRun
     - play settings and game records keep what a later version of the site added to them;
       the settings sheet's volume, Reduce motion and transparency (stamped on <html>) and
       graphics quality, and a setting that holds for the visit when storage is blocked;
       the boot script (src/boot.js) stamps <html> from the stored settings as the game
       does, a damaged value included
   Usage: node tools/game/rules.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const shell = require("../lib/shell");

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
      /* the attributes the game stamps on <html>, kept so a test can read them; calm mode is
         read through hasAttribute, which stays false here */
      documentElement: { attrs: {}, hasAttribute: () => false, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; } },
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null
    },
    BMStore: Store,
    BMSite: { dayKey, escapeHtml: (s) => String(s), rootPrefix: () => "", chapterOf: () => null },
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
    BMInsights: { WEAK: 0.34, sections: () => win.__rows || [] }
  };
  win.window = win;
  vm.createContext(win);
  /* window.BMHud first, as every page has it before the bundle: the level curve and the
     combo's multiplier are src/hud/'s, through the very text the shell inlines */
  vm.runInContext(shell.hudLibrary(), win, { filename: "the HUD script (tools/lib/shell.js)" });
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
  miss({ solutionOpen: true });
  eq(Game.combo().pips, 3, "miss after opening the solution: nothing");

  Game.updateRun((run) => { run.combo.shield = true; });
  miss({ key: "e10" });
  eq([Game.combo().pips, Game.combo().shield], [3, false], "shield absorbs a first miss");

  Store.emit({ type: "opened", chapter: "ch05", key: "e11", section: "angles", inline: false, solved: false, tries: 1 });
  eq(Game.combo().pips, 3, "solution opened after a try: meter kept");
  Game.updateRun((run) => { run.combo.shield = true; });
  Store.emit({ type: "opened", chapter: "ch05", key: "e12", section: "angles", inline: false, solved: false, tries: 0 });
  eq(Game.combo().pips, 0, "solution opened with zero tries: meter emptied, shield does not help");
  first(10);
  Store.emit({ type: "opened", chapter: "ch05", key: "e12", section: "angles", inline: false, solved: false, tries: 0 });
  eq(Game.combo().pips, 1, "reopening the same peeked solution does not empty the meter again");
  Store.emit({ type: "opened", chapter: "ch05", key: "i3", section: "angles", inline: true, solved: false, tries: 0 });
  eq(Game.combo().pips, 1, "peeking at an inline check: nothing");

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
  eq([st.hearts, st.medal, st.how.join()], [1, 2, "first,solved,first,opened"], "two misses: Silver, segments by how they fell");
  st = Game.setStats(S(keys, { e1: { tries: 3, solved: 1, first: 0 }, e2: { tries: 2, solved: 1, first: 0 }, e3: { tries: 2, solved: 1, first: 0 }, e4: { tries: 2, solved: 1, first: 0 } }), "ch05", keys);
  eq([st.hearts, st.medal], [0, 1], "four misses: hearts floor at 0, Bronze");
  st = Game.setStats(S(keys, {}), "ch05", keys);
  eq([st.hp, st.hearts, st.medal, st.how.join()], [0, 3, 3, "unknown,unknown,unknown,unknown"], "solved with no attempt record: unknown segments, no misses, Gold");
  st = Game.setStats(S(["e1"], { e2: { tries: 1 }, e3: { opened: 1 } }), "ch05", keys);
  eq([st.hp, st.hearts, st.medal], [3, 1, 0], "unsolved tries and a peeked solution are misses; no medal before clearing");
  const up = S(keys, { e1: F, e2: { tries: 2, solved: 1, first: 0 }, e3: { tries: 2, solved: 1, first: 0 }, e4: { tries: 2, solved: 1, first: 0 } });
  up.game.enc = { "ch05/practice": { medal: 3, day: "2026-02-01" } };
  const w2 = world({ "bm.progress.v1": up.progress, "bm.attempts.v1": up.attempts, "bm.game.v1": up.game, "bm.run.v1": up.run });
  eq(w2.Game.medal("ch05", "practice"), 3, "a rematch medal raises a Bronze to Gold");
  check(w2.Game.isMiss({ tries: 1 }) && !w2.Game.isMiss({ tries: 1, solved: 1, first: 1 }) && !w2.Game.isMiss({}), "isMiss");
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
  const d1 = G.recordRun({ mode: "daily", hearts: 1, score: 50, day: dayKey(), answers: [{ section: "ch05#angles", retry: true }] });
  eq(d1.xp, 1 + 5 + 10, "Daily: +10 once a day");
  const d2 = G.recordRun({ mode: "daily", hearts: 1, score: 50, day: dayKey(), answers: [{ section: "ch05#angles", retry: true }] });
  eq(d2.xp, 1 + 5, "Daily bonus not paid twice in a day");
  G.recordRun({ mode: "rematch", boss: "ch05", hearts: 3, score: 900, day: dayKey(), answers: [{ section: "ch05#angles", first: true }] });
  eq(G.game().enc["ch05/practice"], undefined, "a rematch of a set with no sign of a clear records no medal");
  G.recordRun({ mode: "repair", section: "ch05#pythagoras", timed: false, hearts: 3, score: 0, day: dayKey(),
    answers: [1, 2, 3, 4, 5].map(() => ({ section: "ch05#pythagoras", first: true })) });
  check(G.game().sec["ch05#pythagoras"].fix > 0, "a clean repair run marks the section repaired");
  const firsts = Array.from({ length: 10 }, (_, i) => ({ section: "ch05#angles", first: true, late: i < 3 }));
  G.recordRun({ mode: "standard", hearts: 3, score: 800, day: dayKey(), answers: firsts });
  check(!!G.game().ach["took-your-time"], "took-your-time: 10 first-try with 3 after par in a timed run");
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

  /* play settings: a key this file has never heard of outlives every switch (skin, a
     key a later release may write, and tutorPromo stand in for them; gfxAuto, which
     stood in here until the 3D world's watchdog came to write it, is a known key now,
     with its own rule below) */
  let w = world({ "bm.prefs.v1": { calm: true, skin: { marker: "octa", at: 1 }, tutorPromo: false } });
  eq([w.Game.prefs().calm, w.Game.prefs().skin, w.Game.prefs().tutorPromo], [true, { marker: "octa", at: 1 }, false], "prefs() hands back an unknown key beside the known ones");
  w.Game.setPref("sound", true);
  eq([w.read("bm.prefs.v1").skin, w.read("bm.prefs.v1").tutorPromo, w.read("bm.prefs.v1").sound], [{ marker: "octa", at: 1 }, false, true], "switching one setting keeps an unknown key");
  w.Game.setPref("calm", false); w.Game.setPref("map3d", false); w.Game.setPref("tempo", "untimed");
  w.Game.setPref("volume", 35); w.Game.setPref("motion", true); w.Game.setPref("transparency", true); w.Game.setPref("gfx", "mid");
  let p = w.read("bm.prefs.v1");
  eq([p.skin, p.tutorPromo, p.sound, p.calm, p.map, p.tempo, p.volume, p.motion, p.transparency, p.gfx],
    [{ marker: "octa", at: 1 }, false, true, false, "list", "untimed", 35, "reduce", "reduce", "mid"], "every setting switched in turn: the unknown keys are still there");
  /* the settings stay on this device: a "state" change is what account sync listens for */
  eq([w.events.filter((e) => e.type === "state").length, w.events.filter((e) => e.type === "prefs").length], [0, 8], "switching a setting announces prefs and never a state change");
  w.Game.setPref("nonsense", 1);
  eq(w.read("bm.prefs.v1"), p, "a setting this file does not know is not written by setPref");
  p = world({ "bm.prefs.v1": { map: "globe", tempo: "warp", volume: 140, motion: "less", transparency: true, gfx: "ultra" } }).Game.prefs();
  eq([p.sound, p.calm, "map" in p, p.tempo, "volume" in p, "motion" in p, "transparency" in p, "gfx" in p], [false, false, false, "standard", false, false, false, false],
    "the known settings are still normalised: a value the site does not know reads as unset, the default");

  /* the settings sheet's new switches: stamped on <html>, and off again */
  w = world({ "bm.prefs.v1": { volume: 80 } });
  const html = () => w.win.document.documentElement.attrs;
  eq([w.Game.volume(w.Game.prefs()), w.Game.volume(world().Game.prefs())], [80, 50], "the volume is the stored one, 50 when there is none");
  w.Game.setPref("volume", 101.6); eq(w.read("bm.prefs.v1").volume, 100, "the volume is held to 0..100, a whole number");
  w.Game.setPref("volume", "x"); eq(w.read("bm.prefs.v1").volume, 0, "a volume that is not a number is 0, not a broken store");
  w.Game.setPref("motion", "reduce"); w.Game.setPref("transparency", true);
  eq([html()["data-motion"], html()["data-transparency"]], ["reduce", "reduce"], "Reduce motion and Reduce transparency stamp html[data-motion] and html[data-transparency]");
  w.Game.setPref("motion", false); w.Game.setPref("transparency", false);
  eq(["data-motion" in html(), "data-transparency" in html(), "motion" in w.read("bm.prefs.v1"), "transparency" in w.read("bm.prefs.v1")], [false, false, false, false],
    "switched off, the attributes go and the store keeps nothing: the device's own setting rules again");
  /* graphics quality is the course world's tier (src/world/tiers.ts): Low is its low
     tier, still 3D; the 3D map switch is what keeps the list */
  w.Game.setPref("gfx", "low");
  eq([w.read("bm.prefs.v1").gfx, w.Game.map3dOn(w.Game.prefs())], ["low", true], "Graphics quality Low is stored, and the course map stays 3D (its low tier)");
  w.Game.setPref("map3d", false);
  eq([w.read("bm.prefs.v1").map, w.Game.map3dOn(w.Game.prefs())], ["list", false], "the 3D map switch off keeps the list");
  w.Game.setPref("map3d", true);
  w.Game.setPref("gfx", "auto");
  eq(["gfx" in w.read("bm.prefs.v1"), w.Game.map3dOn(w.Game.prefs())], [false, true], "Auto is stored as no choice");
  /* gfxAuto: the tier the world's watchdog settled on, this device's; never "high", and
     gone at the next choice of quality or of the map */
  w = world({ "bm.prefs.v1": { gfxAuto: "low" } });
  eq(w.Game.prefs().gfxAuto, "low", "a settled tier is read back");
  eq(world({ "bm.prefs.v1": { gfxAuto: "high" } }).Game.prefs().gfxAuto, undefined, "the watchdog never settles upward: \"high\" reads as unset");
  eq(world({ "bm.prefs.v1": { gfxAuto: { tier: "low" } } }).Game.prefs().gfxAuto, undefined, "nor does anything but a tier name");
  w.Game.setPref("gfxAuto", "list");
  eq([w.read("bm.prefs.v1").gfxAuto, w.Game.map3dOn(w.Game.prefs())], ["list", false], "the watchdog giving the list back shows the 3D map switch off");
  w.Game.setPref("sound", true);
  eq(w.read("bm.prefs.v1").gfxAuto, "list", "another setting leaves it");
  w.Game.setPref("map3d", true);
  eq(["gfxAuto" in w.read("bm.prefs.v1"), w.Game.map3dOn(w.Game.prefs())], [false, true], "switching the map on again starts afresh");
  w.Game.setPref("gfxAuto", "medium"); w.Game.setPref("gfx", "high");
  eq(["gfxAuto" in w.read("bm.prefs.v1"), w.read("bm.prefs.v1").gfx], [false, "high"], "so does choosing a quality");
  w.Game.setPref("gfxAuto", "nonsense");
  eq("gfxAuto" in w.read("bm.prefs.v1"), false, "a value that is not a settled tier is not kept");
  eq(w.events.filter((e) => e.type === "state").length, 0, "none of it is a state change for account sync");

  /* a store that cannot be written: the choice still holds for the visit */
  w = world();
  w.Store.write = () => false;
  w.Game.setPref("calm", true);
  eq([w.Game.prefs().calm, "bm.prefs.v1" in w.mem], [true, false], "with storage blocked, a setting holds for the visit and nothing is stored");

  /* the reading panel: unset until chosen (light paper), stamped on <html> as data-panel */
  w = world({ "bm.prefs.v1": { panel: "sepia", calm: true } });
  eq("panel" in w.Game.prefs(), false, "a panel value the site does not know reads as unset, the light panel");
  w.Game.setPref("panel", "dark");
  eq([w.read("bm.prefs.v1").panel, w.read("bm.prefs.v1").calm, w.win.document.documentElement.getAttribute("data-panel")], ["dark", true, "dark"],
    "setPref(\"panel\", \"dark\") keeps the choice, keeps the other settings and stamps html[data-panel]");
  w.Game.setPref("panel", "anything");
  eq([w.read("bm.prefs.v1").panel, w.win.document.documentElement.getAttribute("data-panel")], ["light", "light"], "any other value is the light panel");
  eq(w.events.filter((e) => e.type === "state").length, 0, "the panel is this device's: no state change for account sync");

  /* The boot script stamps <html> before first paint and the game stamps it again when it
     loads; the HUD script reads html[data-calm] in between. They must read every stored
     value the same way, a damaged one too, or the HUD changes when the bundle arrives. */
  const boot = fs.readFileSync(path.join(ROOT, shell.BOOT), "utf8");
  const stamps = (attrs) => ["data-calm", "data-sound", "data-motion", "data-transparency", "data-panel"].map((n) => n + "=" + (n in attrs ? attrs[n] : "-")).join(" ");
  [
    { calm: true }, { calm: "yes" }, { calm: 1 }, { calm: "true" }, { calm: false },
    { sound: true }, { sound: 1 }, { sound: "on" }, { sound: true, calm: true }, { sound: true, calm: 1 },
    { motion: "reduce" }, { motion: true }, { transparency: "reduce" }, { transparency: 1 }, { panel: "dark" }, { panel: "sepia" }, {}
  ].forEach((stored) => {
    const root = { attrs: {}, setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, hasAttribute(n) { return n in this.attrs; } };
    const mem = { "bm.prefs.v1": JSON.stringify(stored) };
    const listeners = {};
    const page = { document: { documentElement: root }, localStorage: { getItem: (k) => (k in mem ? mem[k] : null) }, matchMedia: () => ({ matches: false }), JSON,
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); } };
    page.window = page;
    vm.runInNewContext(boot, page, { filename: shell.BOOT });
    const g = world({ "bm.prefs.v1": stored });
    g.Game.setPref("tempo", g.Game.prefs().tempo);
    eq(stamps(root.attrs), stamps(g.win.document.documentElement.attrs), "the boot script stamps <html> as the game does for a stored " + JSON.stringify(stored));
    /* and between pages it skips the view transition, on the page left and on the page
       arriving, exactly when the game holds still: Study mode or Reduce motion */
    const skips = ["pageswap", "pagereveal"].map((type) => {
      let skipped = false;
      (listeners[type] || []).forEach((fn) => fn({ viewTransition: { skipTransition() { skipped = true; } } }));
      (listeners[type] || []).forEach((fn) => fn({ viewTransition: null }));
      return skipped;
    });
    const still = g.Game.prefs().calm === true || g.Game.prefs().motion === "reduce";
    eq(skips, [still, still], "the boot script " + (still ? "skips" : "keeps") + " the view transition on both pages for a stored " + JSON.stringify(stored));
  });
  /* the transition is skipped for what the device asks too, and for Study mode switched on
     on the page being left after it loaded (game.js stamps html[data-calm] then) */
  [["the device asks for less motion", true, null], ["Study mode was switched on since the page loaded", false, "data-calm"], ["nothing asks", false, null]].forEach(([why, device, attr]) => {
    const root = { attrs: {}, setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, hasAttribute(n) { return n in this.attrs; } };
    const listeners = {};
    const page = { document: { documentElement: root }, localStorage: { getItem: () => null }, matchMedia: (q) => ({ matches: device && /prefers-reduced-motion:\s*reduce/.test(q) }), JSON,
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); } };
    page.window = page;
    vm.runInNewContext(boot, page, { filename: shell.BOOT });
    if (attr) root.setAttribute(attr, "true");
    let skipped = false;
    listeners.pageswap.forEach((fn) => fn({ viewTransition: { skipTransition() { skipped = true; } } }));
    eq(skipped, device || !!attr, "the page being left " + (device || attr ? "skips" : "keeps") + " its view transition when " + why);
  });
  /* the one rejection the boot script quiets: a transition the browser gave up on itself
     (Chromium reports it uncaught; no script was handed it); any other stays an error */
  {
    class DOMException extends Error { constructor(message, name) { super(message); this.name = name; } }
    const listeners = {};
    const page = { document: { documentElement: { setAttribute() {}, getAttribute: () => null, hasAttribute: () => false } }, localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false }), JSON, DOMException,
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); } };
    page.window = page;
    vm.runInNewContext(boot, page, { filename: shell.BOOT });
    const quieted = (reason) => { let prevented = false; listeners.unhandledrejection.forEach((fn) => fn({ reason, preventDefault() { prevented = true; } })); return prevented; };
    eq([
      quieted(new DOMException("Transition was aborted because of invalid state. Page already revealed", "InvalidStateError")),
      quieted(new DOMException("Transition was aborted because of invalid state. ViewTransition opt-in disabled", "InvalidStateError")),
      quieted(new DOMException("Transition was skipped", "AbortError")),
      quieted(new DOMException("The operation timed out.", "TimeoutError")),
      quieted(new DOMException("Failed to execute 'x'", "InvalidStateError")),
      quieted(new Error("Transition was aborted")),
      quieted(undefined)
    ], [true, true, true, false, false, false, false], "the boot script quiets only a view transition the browser gave up on");
  }

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
