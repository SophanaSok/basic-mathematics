#!/usr/bin/env node
/* A Part marked beside (the skill packs) in the classic scripts, on a fixture: the real
   curriculum plus one beside Part of two chapters, run in a vm. No beside Part exists in
   data/curriculum.js yet; this holds every consumer ready for one.
     - data/curriculum.js and tools/lib/site.js: courseChapters is the flat list without
       the beside Part's chapters; chapters keeps them all
     - assets/site.js: chapter nav (a course chapter's next never enters a pack; a pack
       walks its own Part), the home page (the pack card after Part IV, titled by its name
       alone; "you are here" never a pack), course stats
     - assets/game.js: the "ground-up" achievement counts the course only; "region-cleared"
       counts a pack as a region
     - assets/encounter.js: no encounter on a pack page
   Not reached here, and left to the Chromium suites: the end-of-chapter banner in site.js
   (chapterDone), the progress table and funnel of assets/insights.js, the Arena's deck of
   assets/arena.js and the map of assets/map3d.js are inside page-sized closures that need
   a DOM; their edits are one filter each, and map.test.js holds the map to four Part buttons.
   The real Part V (data/curriculum.js) is checked on its own below, and the pack naming
   ("Pack A", never "Chapter A") and the home card's lack of an empty number square.
   Usage: node tools/game/beside.test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const siteLib = require("../lib/site");
const shell = require("../lib/shell");

const ROOT = path.resolve(__dirname, "../..");
let fails = 0;
function check(cond, what) { if (!cond) { fails++; console.error("FAIL " + what); } }
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const PACKS = {
  id: "packs", num: "V", name: "Skill packs", dir: "5-packs", beside: true, blurb: "Packs beside the course.",
  chapters: [
    { id: "pk-percent", label: "A", title: "Percent", file: "pk-percent.html", status: "full", blurb: "Percent.", sections: [{ id: "basics", title: "Basics" }] },
    { id: "pk-ratio", label: "B", title: "Ratio", file: "pk-ratio.html", status: "full", blurb: "Ratio.", sections: [{ id: "simplify", title: "Simplify" }] }
  ]
};

/* the curriculum source with the fixture Part put in ahead of its flattening code; the real
   Part V (pack A) is dropped first, so the fixture's two packs are the only packs */
function fixtureSource() {
  const src = read("data/curriculum.js");
  const cut = src.indexOf("/* Flat chapter list");
  return src.slice(0, cut) + "window.BM_CURRICULUM.parts = window.BM_CURRICULUM.parts.filter(function (p) { return !p.beside; });\n" +
    "window.BM_CURRICULUM.parts.push(" + JSON.stringify(PACKS) + ");\n" + src.slice(cut);
}

/* ---------------------------------------------- courseChapters, both flatteners */
{
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fixtureSource(), sb);
  const C = sb.window.BM_CURRICULUM;
  eq([C.chapters.length, C.courseChapters.length], [19, 17], "data/curriculum.js: 19 chapters, 17 in the course");
  check(C.courseChapters.every((ch) => !ch.part.beside), "courseChapters holds no pack");

  const lib = siteLib.loadCurriculum ? siteLib.loadCurriculum(fixtureSource()) : null;
  if (lib) eq([lib.chapters.length, lib.courseChapters.length], [19, 17], "tools/lib/site.js loadCurriculum agrees");
  /* the older layout, where site.js flattens for itself */
  if (siteLib.loadCurriculum) {
    const old = siteLib.loadCurriculum("window.BM_CURRICULUM = { parts: [" +
      '{ id: "a", chapters: [{ id: "c1", file: "c1.html" }], dir: "1" },' +
      '{ id: "b", beside: true, chapters: [{ id: "p1", file: "p1.html" }], dir: "2" }] };');
    eq([old.chapters.length, old.courseChapters.map((c) => c.id)], [2, ["c1"]], "the older layout builds courseChapters too");
  }
}

/* ------------------------------------------------- the real Part V in the curriculum */
{
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(read("data/curriculum.js"), sb);
  const C = sb.window.BM_CURRICULUM;
  const part = C.parts[C.parts.length - 1];
  eq([part.id, part.num, part.dir, part.beside], ["packs", "V", "5-packs", true], "the last Part of data/curriculum.js is Part V, the skill packs, beside");
  eq(part.chapters.map((c) => c.id + ":" + c.label + ":" + c.course), ["pk-percent:A:pre-algebra", "pk-data:B:pre-algebra"], "packs A and B are the packs so far");
  eq([C.chapters.length, C.courseChapters.length], [19, 17], "the real tree: 19 chapters, 17 in the course");
}

/* ------------------------------------------------------ assets/site.js pages */
function host() { return { innerHTML: "", hidden: false, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {} }, style: {} }; }

/* run site.js for a page: `chapterId` is its <body data-chapter>, `store` seeds bm.last */
function page(chapterId, store) {
  const noop = () => {};
  const hosts = { "[data-chapter-nav]": host(), "[data-course-index]": host(), "[data-course-stats]": host() };
  const el = {
    getAttribute: (n) => (n === "data-chapter" ? chapterId : null), setAttribute: noop, removeAttribute: noop, hasAttribute: () => false,
    appendChild: noop, insertBefore: noop, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop }, style: {}
  };
  const mem = {};
  Object.keys(store || {}).forEach((k) => { mem[k] = JSON.stringify(store[k]); });
  const win = {
    console, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    document: {
      readyState: "complete", body: el, documentElement: el,
      querySelector: (sel) => hosts[sel] || null, querySelectorAll: () => [],
      getElementById: () => null, createElement: () => host(), addEventListener: noop
    },
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: noop, removeItem: noop },
    BMCore: require("../../src/ui/core.ts").core
  };
  win.window = win;
  win.self = win;
  vm.createContext(win);
  vm.runInContext(fixtureSource(), win, { filename: "data/curriculum.js" });
  vm.runInContext(read("assets/site.js"), win, { filename: "assets/site.js" });
  return { hosts, win };
}

const hrefs = (html) => (html.match(/href="[^"]*"/g) || []);
{
  const last = hrefs(page("ch16").hosts["[data-chapter-nav]"].innerHTML);
  check(last.length === 2 && /15-induction/.test(last[0]) && /index\.html/.test(last[1]), "ch16's next stays the contents page, not a pack: " + last.join(" "));
  check(/Done/.test(page("ch16").hosts["[data-chapter-nav]"].innerHTML), "ch16's next reads Done");

  const a = hrefs(page("pk-percent").hosts["[data-chapter-nav]"].innerHTML);
  check(/index\.html/.test(a[0]) && /pk-ratio/.test(a[1]), "the first pack: back to contents, next the second pack: " + a.join(" "));
  const b = hrefs(page("pk-ratio").hosts["[data-chapter-nav]"].innerHTML);
  check(/pk-percent/.test(b[0]) && /index\.html/.test(b[1]), "the last pack: previous the first pack, then contents: " + b.join(" "));
}
{
  const p = page(null, { "bm.last": { id: "pk-ratio", section: null } });
  const html = p.hosts["[data-course-index]"].innerHTML;
  const order = (html.match(/data-part="[a-z]+"/g) || []);
  eq(order.slice(-1), ['data-part="packs"'], "the pack card is drawn last, after Part IV");
  check(order.length >= 5, "five Part cards in all: " + order.join(" "));
  check(/<h2 id="part-packs">Skill packs<\/h2>/.test(html), "the pack card is titled by its name alone");
  check(/<div class="part-head"><h2 id="part-packs">/.test(html), "the pack card draws no empty number square");
  check(/<span class="roman" aria-hidden="true">I<\/span>/.test(html), "course Parts still draw their numeral");
  check(/<span class="label">Pack A<\/span>/.test(html) && !/Chapter A/.test(html), "a pack reads Pack A, never Chapter A");
  check(!/Part V/.test(html), "no part number in the pack card");
  check(/<h2 id="part-\w+">Part I — /.test(html), "course Parts still read Part I —");
  check(/data-chapter="pk-ratio"/.test(html), "the packs are listed");
  check(/data-state="current"/.test(html), "a pack last opened may be 'you are here' by the reader's own visit");
  const fresh = page(null).hosts["[data-course-index]"].innerHTML;
  const cur = (fresh.match(/data-state="current" data-chapter="([^"]+)"/) || [])[1];
  check(cur && !/^pk-/.test(cur), "the fallback 'you are here' is never a pack: " + cur);
}
{
  /* a store that says every course chapter and pack has 3 exercises, 3 solved, to see who counts */
  const progress = {};
  const all = ["ch01", "ch02", "ch03", "pk-percent", "pk-ratio"];
  all.forEach((id) => { progress[id] = { total: 3, solved: { a: 1, b: 1, c: 1 } }; });
  const html = page(null, { "bm.progress.v1": progress }).hosts["[data-course-stats]"].innerHTML;
  check(/<b>9<\/b> of the <b>9<\/b>/.test(html) && /finished <b>3<\/b> chapters/.test(html), "course stats leave the packs out: " + html);
  const none = page(null).hosts["[data-course-stats]"].innerHTML;
  check(/ 17 chapters are written/.test(none) || /\b1[0-9] chapters are written/.test(none), "'chapters written' counts the course only: " + none);
}

/* ------------------------------------------------------------ assets/game.js */
{
  const mem = {};
  const noop = () => {};
  const obj = (x) => (x && typeof x === "object" ? x : {});
  const keys = { progress: "bm.progress.v1", play: "bm.play.v1", last: "bm.last", attempts: "bm.attempts.v1", activity: "bm.activity.v1", lesson: "bm.lesson.v1", game: "bm.game.v1", run: "bm.run.v1", prefs: "bm.prefs.v1" };
  const win = {
    console, setTimeout, clearTimeout, Math, JSON, Date, matchMedia: () => ({ matches: false }),
    document: { documentElement: { hasAttribute: () => false, getAttribute: () => null, setAttribute: noop, removeAttribute: noop }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    BMStore: { keys, read: (k, f) => (k in mem ? JSON.parse(mem[k]) : f), write: noop, on: noop, emit: noop },
    BMSite: { dayKey: () => "2026-10-11", escapeHtml: String, rootPrefix: () => "", chapterOf: () => null },
    BMProgress: { all: () => ({}), count: () => ({ solved: 0, total: 0 }) },
    BMAttempts: { all: () => ({}), chapter: () => ({}) },
    BMPlay: { all: () => ({}), chapter: () => ({ done: {}, total: 0 }), count: () => ({ done: 0, total: 0 }) },
    BMActivity: { all: () => ({ days: {} }), total: () => 0, today: () => 0, goal: () => 30, streak: () => 0, add: noop },
    BMInsights: { WEAK: 0.34, sections: () => [] },
    BMReview: require("../../src/ui/review.ts").api,
    BMCore: require("../../src/ui/core.ts").core
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(shell.hudLibrary(), win);
  vm.runInContext(fixtureSource(), win, { filename: "data/curriculum.js" });
  vm.runInContext(read("data/quest.js"), win, { filename: "data/quest.js" });
  vm.runInContext(read("assets/game.js"), win, { filename: "assets/game.js" });
  const G = win.BMGame;
  const gu = G.ACHIEVEMENTS.filter((x) => x.id === "ground-up")[0];
  eq(gu.test(G.stores()), [0, 17], "ground-up is out of the 17 course chapters, not 19");
  const rc = G.ACHIEVEMENTS.filter((x) => x.id === "region-cleared")[0];
  const best = rc.test(G.stores());
  check(Array.isArray(best), "region-cleared still answers with a beside Part present");
}

/* --------------------------------------------------------- assets/encounter.js */
function encounter(chapterId) {
  const noop = () => {};
  const main = { looked: 0, querySelectorAll() { main.looked++; return []; }, querySelector: () => null };
  const win = {
    console, setTimeout, clearTimeout, Math, JSON, Date, addEventListener: noop,
    document: { body: { getAttribute: () => chapterId }, getElementById: (id) => (id === "main" ? main : null), querySelector: () => null, querySelectorAll: () => [], createElement: host, addEventListener: noop },
    BMStore: { on: noop }, BMSite: { escapeHtml: String, rootPrefix: () => "" }, BMGame: {}, BMPlay: {}
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fixtureSource(), win);
  win.BM_CURRICULUM = win.window.BM_CURRICULUM;
  try { vm.runInContext(read("assets/encounter.js"), win, { filename: "assets/encounter.js" }); } catch (e) { win.__threw = e; }
  win.__main = main;
  return win;
}
{
  const pack = encounter("pk-percent");
  check(!pack.__threw && !pack.BMEncounter && pack.__main.looked === 0, "a pack page gets no encounter, and the script looks at no practice set");
  const ch = encounter("ch01");
  /* on a course chapter the script goes on past the guard and looks for its practice sets */
  check(!ch.__threw && ch.__main.looked > 0, "a course chapter still looks for its practice sets");
}

if (fails) { console.error(fails + " failed"); process.exit(1); }
console.log("beside.test.js: ok");
