#!/usr/bin/env node
/* Headless Chromium checks of the game layer, on the built site as lib/target.js serves it
   (dist/, which must be current; --root=<dir> names a build elsewhere):
     node tools/game/browser.test.js
   Every request off that server is aborted (nothing a page needs comes from anywhere
   else now: the fonts, KaTeX and Three.js are in the bundle), and so is the one for
   bundle/three.js, so the 3D stages and the course map take their flat fallbacks on
   every machine, whatever WebGL its Chromium offers, and the run is deterministic: this
   script is part of the deploy gate (ci.yml, test:browser:core), which is not retried;
   the painters are scenes.test.js's and map.test.js's, in the retried webgl job.

   1. ch05 in whole-page mode: three first-try answers give 10, 12, 14 XP and 3 pips;
      a first miss on a fresh one costs 2 pips and leaves 2 hearts
   2. reload: pips, hearts, health and medal identical, no XP replayed
   3. solving all ten shows the finale inside #practice, and in step mode too
   4. calm mode hides hearts and combo
   5. no AudioContext is constructed while sound is off (and one is once it is on)
   6. no console errors on index, about, progress and four chapters in both themes
   7. localStorage that throws on every access breaks nothing
   8. the help ladder: "Show a clue" from the start, wrong answers open nothing, a clue
      opens on a click with focus on it and is still open after a reload; a sign-flipped
      answer gets a question; a card left alone after a miss changes its offer line once
      (under Playwright's clock) and opens nothing; the solution opened on an untouched exercise costs no heart
      and keeps the combo, and answering it then pays 3 and costs the two pips a miss would;
      a right first answer after clue 2 pays 6 and moves no pip; the finale says how many
      were solved with the solution open, beside the hearts kept; the keyboard path through
      clue, check and solution
   9. the next best step (src/ui/next.ts): the right first item for three states (a section
      due, a weak one, only a place to continue), outside <main>'s children, hidden for the
      day by its button (device-only, still hidden after a reload, back the next day), and
      kept in Study mode without the game's colour
  10. the verdicts of decision 0002 (typed grader), injected into BMCore.judge (site.js and
      arena.js read it at check time): on a page a form verdict shows its reason, the reading
      line for a labeled point, and costs nothing (Q1(c): no XP, no pip, no attempt record);
      an unread one is a retype nudge (Q2(a)); a right unreduced fraction carries the
      lowest-terms note; an unread blank stops the check, named, marking nothing; a form
      blank is marked like a wrong one and tagged data-verdict="form", cleared by the next
      check; [form, wrong] blanks ask the detectors about the wrong one (a stub
      BMLearn.detect); in the Arena, unread nudges, stays on the question and keeps the clock
      running, form costs a heart and the streak and its reason replaces the miss text, on the
      retry too and across a reload; and 500 seeded golden cases judged in Chromium agree with Node
   and the settings sheet: a modal sheet at 360 that keeps the focus and gives it back on
   Escape, beside the rail at 1280, the theme chosen in it even with storage blocked (the
   `hud` suite of check-browser.js covers every setting and the HUD's layout) */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const CH05 = "parts/2-geometry/05-distance-and-angles.html";
let server;
const url = (p) => server.url + p;
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) {
  check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* BMCore.judge replaced on the page (page.evaluate(INJECT, map)), on the one object site.js
   and arena.js read it from: a given in `map` (trimmed) gets that verdict, any other the
   real one */
function INJECT(map) {
  var real = window.BMCore.judge;
  window.BMCore.judge = function (given, spec) {
    var v = map[String(given).trim()];
    return v ? JSON.parse(JSON.stringify(v)) : real(given, spec);
  };
}
/* mulberry32, the seeded stream the grading tools use */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* counts AudioContext constructions, so a test can assert none happen with sound off */
const AUDIO_SPY = "(" + function () {
  window.__ac = 0;
  var AC = window.AudioContext;
  if (AC) {
    window.AudioContext = function () { window.__ac++; return new AC(); };
    window.AudioContext.prototype = AC.prototype;
  }
} + ")()";

/* the loader's dynamic import, refused so that every stage and the map stay flat (header) */
const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;

async function open(browser, page0, seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, reducedMotion: opts.reducedMotion || "no-preference" });
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) && !THREE_CHUNK.test(r.request().url()) ? r.continue() : r.abort());
  if (opts.blockStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get: function () { throw new Error("storage blocked"); } });
      Object.defineProperty(window, "sessionStorage", { configurable: true, get: function () { throw new Error("storage blocked"); } });
    });
  }
  await context.addInitScript(AUDIO_SPY);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return; /* a request the route aborted */
    errors.push("console: " + m.text());
  });
  await page.goto(url(page0));
  /* seed storage on the server's origin, then load the page again from that state */
  if (!opts.blockStorage) {
    await page.evaluate((seed) => {
      localStorage.clear();
      Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); });
    }, seed || {});
    await page.goto(url(page0));
  }
  await page.waitForFunction(() => document.readyState === "complete");
  return { context, page, errors };
}

/* Answer one practice exercise, right or wrong, through the real controls. */
async function answer(page, sel, right) {
  await page.evaluate(({ sel, right }) => {
    var ex = document.querySelector(sel);
    var kind = ex.getAttribute("data-kind"), key = (ex.getAttribute("data-answer") || "").split("|")[0];
    if (kind === "choice") {
      var labels = ex.querySelectorAll(".choice input");
      var i = right ? parseInt(key, 10) - 1 : (parseInt(key, 10) % labels.length);
      labels[i].click();
    } else if (kind === "multi") {
      var want = key.split(",").map(function (s) { return parseInt(s, 10) - 1; });
      Array.prototype.forEach.call(ex.querySelectorAll(".choice input"), function (inp, j) {
        inp.checked = right ? want.indexOf(j) > -1 : want.indexOf(j) < 0;
      });
    } else if (kind === "blank") {
      Array.prototype.forEach.call(ex.querySelectorAll("input.blank"), function (b) {
        b.value = right ? (b.getAttribute("data-answer") || "").split("|")[0] : "987654";
      });
    } else {
      ex.querySelector(".ex-form input").value = right ? key : "987654";
    }
  }, { sel, right });
  await page.click(sel + " .ex-form .btn:not(.ghost)");
}

const state = (page) => page.evaluate(() => {
  var enc = window.BMEncounter ? window.BMEncounter.state().practice : null;
  var hearts = document.querySelector("#practice .encounter-hearts");
  return {
    xp: window.BMActivity.total(), pips: window.BMGame.combo().pips,
    hp: enc && enc.hp, hearts: enc && enc.hearts, medal: enc && enc.medal,
    heartsLabel: hearts ? hearts.getAttribute("aria-label") : null,
    hudHearts: (function () { var h = document.querySelector(".hud .hud-hearts"); return h && !h.hidden ? h.getAttribute("data-lives") : null; })(),
    segs: Array.prototype.map.call(document.querySelectorAll("#practice .encounter-seg"), function (s) { return s.getAttribute("data-how"); }).join(",")
  };
});

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("browser: " + server.where);
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  try {
    /* -------------------------------------------- 1–3: ch05, whole page */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      check(await page.$("#practice > .encounter") !== null, "encounter banner is the first thing in #practice");
      check(await page.$("#review") === null || await page.$("#review .encounter") !== null, "review set decorated where present");
      check(await page.$(".hud .hud-level") !== null && await page.$(".hud-sheet#hud-sheet") !== null, "HUD and sheet built");
      check(await page.evaluate(() => document.querySelector(".toasts") === null || document.querySelector(".toasts").getAttribute("aria-hidden") === "true"), "toasts are aria-hidden");
      check(await page.$("#bm-live[role=status]") !== null, "live region exists");
      const xps = [];
      for (const k of ["e1", "e2", "e3"]) {
        const before = (await state(page)).xp;
        await answer(page, '#practice .ex[data-key="' + k + '"]', true);
        xps.push((await state(page)).xp - before);
      }
      eq(xps, [10, 12, 14], "three first-try answers earn 10, 12, 14 XP");
      eq((await state(page)).pips, 3, "three pips");
      check(await page.$('#practice .ex[data-key="e1"] .ex-stamp') !== null, "a solved card gets its stamp");
      eq(await page.$eval('#practice .ex[data-key="e3"] .ex-reward', (e) => e.textContent), "+14 XP", "the reward chip shows the XP");
      await answer(page, '#practice .ex[data-key="e4"]', false);
      await wait(700);
      let s = await state(page);
      eq([s.pips, s.hearts, s.heartsLabel, s.hudHearts], [1, 2, "2 of 3 hearts", "2"], "a first miss: −2 pips, 2 hearts, shown in the set and the header");
      eq([s.hp, s.medal], [7, 0], "health is the unsolved count");
      const before = s;

      /* 2: reload */
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      await wait(300);
      s = await state(page);
      eq([s.pips, s.hearts, s.hp, s.medal, s.xp, s.segs], [before.pips, before.hearts, before.hp, before.medal, before.xp, before.segs], "reload leaves pips, hearts, health, medal and XP identical");
      check(await page.$('#practice .ex[data-key="e1"] .ex-stamp') !== null && await page.$('#practice .ex[data-key="e1"] .ex-reward') === null, "restored card: stamp, no reward chip");

      /* 3: clear the set */
      await answer(page, '#practice .ex[data-key="e4"]', true);
      for (const k of ["e5", "e6", "e7", "e8", "e9", "e10"]) await answer(page, '#practice .ex[data-key="' + k + '"]', true);
      await wait(1600);
      const fin = await page.evaluate(() => {
        var r = document.querySelector("#practice .encounter-result");
        return r && {
          shown: !r.hidden && !!r.offsetParent, last: r === r.parentNode.lastElementChild,
          revisit: r.hasAttribute("data-revisit"), text: r.textContent,
          medal: document.querySelector("#practice .encounter").getAttribute("data-medal"),
          state: document.querySelector("#practice").getAttribute("data-encounter"),
          rematch: !!r.querySelector('a[href$="arena.html?boss=ch05"]'), openAll: !!r.querySelector("[data-open-all]")
        };
      });
      check(fin && fin.shown && fin.last && !fin.revisit, "finale shows as the last child of #practice");
      check(fin && /9 of 10\s*right the first time/.test(fin.text), "finale counts first-try answers (" + (fin && fin.text.slice(0, 120)) + ")");
      eq(fin && [fin.medal, fin.state, fin.rematch, fin.openAll], ["2", "won", true, true], "Silver medal, won, rematch and open-all buttons");
      const hud = await page.evaluate(() => document.querySelector(".hud .hud-hearts").hidden);
      check(hud, "header hearts hide once the set is won");
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      await wait(200);
      const rv = await page.$eval("#practice .encounter-result", (r) => ({ hidden: r.hidden, revisit: r.getAttribute("data-revisit"), html: r.innerHTML.slice(0, 160) }));
      check(!rv.hidden && rv.revisit === "true", "revisit shows the one-line state " + JSON.stringify(rv));
      eq(errors, [], "no errors on ch05");
      await context.close();
    }

    /* -------------------------------------------------- 3b: step mode */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"steps"}' });
      check(await page.evaluate(() => document.body.getAttribute("data-lesson")) === "steps", "step mode on");
      /* walk forward to the first step that waits on an inline check, then answer it */
      for (let i = 0; i < 30; i++) {
        const ready = await page.$eval(".lesson-next", (b) => b.getAttribute("data-ready"));
        if (ready === "false") break;
        await page.click(".lesson-next .btn");
      }
      const pend = await page.evaluate(() => {
        var shown = window.BMLesson.shown(), out = [];
        window.BMLesson.steps[shown - 1].forEach(function (el) {
          var list = el.matches(".ex[data-inline]") ? [el] : Array.prototype.slice.call(el.querySelectorAll(".ex[data-inline]"));
          list.forEach(function (ex) { if (ex.getAttribute("data-state") !== "correct") out.push(ex.getAttribute("data-key")); });
        });
        return out;
      });
      check(pend.length > 0, "found a step waiting on inline checks");
      for (let i = 0; i < pend.length; i++) {
        await answer(page, '.ex[data-key="' + pend[i] + '"]', true);
        const ready = await page.$eval(".lesson-next", (b) => b.getAttribute("data-ready"));
        eq(ready, i === pend.length - 1 ? "true" : "false", "lesson-next ready only once every check in the step is solved (" + (i + 1) + "/" + pend.length + ")");
      }
      await page.evaluate(() => { location.hash = "#practice"; });
      await wait(200);
      for (let i = 1; i <= 10; i++) await answer(page, '#practice .ex[data-key="e' + i + '"]', true);
      await wait(1600);
      check(await page.$eval("#practice .encounter-result", (r) => !r.hidden && !!r.offsetParent), "finale visible in step mode");
      eq(await page.$eval("#practice .encounter", (e) => e.getAttribute("data-medal")), "3", "all first try: Gold");
      eq(errors, [], "no errors in step mode");
      await context.close();
    }

    /* ------------------------------------------------------ 4: calm mode */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": '{"calm":true,"sound":true}' });
      eq(await page.evaluate(() => [document.documentElement.getAttribute("data-calm"), document.documentElement.getAttribute("data-sound")]), ["true", "off"], "calm stamps html and forces sound off");
      await answer(page, '#practice .ex[data-key="e1"]', true);
      await answer(page, '#practice .ex[data-key="e2"]', false);
      await wait(700);
      const calm = await page.evaluate(() => ({
        combo: document.querySelector(".hud-combo").hidden, hearts: document.querySelector(".hud .hud-hearts").hidden,
        setHearts: document.querySelector("#practice .encounter-hearts"), sigil: document.querySelector("#practice .encounter-sigil").hidden,
        taunt: document.querySelector("#practice .encounter-taunt").hidden, ac: window.__ac
      }));
      eq([calm.combo, calm.hearts, calm.setHearts, calm.sigil, calm.taunt, calm.ac], [true, true, null, true, true, 0], "calm hides combo, hearts, sigil and taunt; no audio");
      /* the help ladder is learning, not game: all of it stays */
      const e2 = '#practice .ex[data-key="e2"]';
      check(!!(await page.$(e2 + " .ex-feedback .ex-offer")), "calm: a miss still offers help");
      await page.click(e2 + " .ex-clue-btn");
      check(await page.evaluate((s) => document.activeElement === document.querySelector(s + " .ex-clue[data-level='1']"), e2), "calm: the clue button opens clue 1 and focus moves to it");
      await page.fill(e2 + " .ex-form input[type=text]", "-" + (await page.$eval(e2, (e) => e.getAttribute("data-answer").split("|")[0])));
      await page.press(e2 + " .ex-form input[type=text]", "Enter");
      check(!!(await page.$(e2 + " .ex-feedback .ex-ask")), "calm: a sign-flipped answer still gets its question");
      eq(errors, [], "no errors in calm mode");
      await context.close();
    }

    /* ------------------------------------------------- 5: sound and audio */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await answer(page, '#practice .ex[data-key="e1"]', true);
      await answer(page, '#practice .ex[data-key="e2"]', false);
      await page.click(".hud-menu");
      await page.keyboard.press("Escape");
      eq(await page.evaluate(() => window.__ac), 0, "no AudioContext while sound is off");
      await page.click(".hud-sound");
      eq(await page.evaluate(() => [window.BMGame.prefs().sound, document.documentElement.getAttribute("data-sound"), document.querySelector(".hud-sound").getAttribute("aria-pressed")]), [true, "on", "true"], "the sound button turns sound on");
      eq(await page.evaluate(() => window.__ac), 1, "the AudioContext is made on that gesture, once");
      await page.click(".hud-menu");
      check(await page.$eval("#hud-sheet", (s) => s.open) && await page.$eval(".hud-menu", (b) => b.getAttribute("aria-expanded")) === "true", "menu opens the sheet");
      await page.click('#hud-sheet [data-pref="sound"]');
      eq(await page.evaluate(() => window.BMGame.prefs().sound), false, "the sheet switch turns it off again");
      await page.keyboard.press("Escape");
      check(await page.$eval("#hud-sheet", (s) => !s.open), "Escape closes the sheet");
      eq(errors, [], "no errors around sound");
      await context.close();
    }

    /* ---------------------------------------- 6: pages × themes, no errors */
    const pages = ["index.html", "about.html", "progress.html", "parts/1-algebra/01-numbers.html", "parts/1-algebra/interlude-logic.html",
      CH05, "parts/4-topics/16-determinants.html"];
    for (const theme of ["light", "dark"]) {
      for (const width of [1280, 360]) {
        const seed = {
          "bm.theme": JSON.stringify(theme),
          "bm.progress.v1": JSON.stringify({ ch05: { solved: { e1: true, e2: true }, total: 12 } }),
          "bm.attempts.v1": JSON.stringify({ ch05: { e1: { tries: 1, solved: 1, first: 1, section: "angles" }, e2: { tries: 2, solved: 2, first: 0, hints: 1, section: "angles" } } }),
          "bm.activity.v1": JSON.stringify({ days: { "2026-01-01": 300 } })
        };
        for (const p of pages) {
          const { context, page, errors } = await open(browser, p, seed, { width });
          await wait(150);
          const info = await page.evaluate(() => ({
            hud: !!document.querySelector(".hud .hud-level"),
            theme: document.documentElement.getAttribute("data-theme"),
            achievements: document.querySelectorAll("#achievements .ach").length,
            recall: !!document.querySelector("#recall")
          }));
          check(info.hud && info.theme === theme, p + " (" + theme + ", " + width + "): HUD and theme");
          if (p === "progress.html") eq([info.achievements, info.recall], [25, true], "progress page lists 25 achievements and the Recall panel");
          eq(errors, [], p + " (" + theme + ", " + width + "): no console errors");
          await context.close();
        }
      }
    }

    /* ---------------------------------------------- 7: storage that throws */
    for (const p of [CH05, "progress.html", "index.html"]) {
      const { context, page, errors } = await open(browser, p, {}, { blockStorage: true });
      if (p === CH05) {
        /* nothing can be remembered, so the chapter opens in step mode at its first step */
        await page.evaluate(() => { location.hash = "#practice"; });
        await wait(100);
        await answer(page, '#practice .ex[data-key="e1"]', true);
        await answer(page, '#practice .ex[data-key="e2"]', false);
        await page.click(".hud-menu");
        await page.click('#hud-sheet [data-pref="calm"]');
        await wait(700);
      }
      eq(errors, [], p + " with storage blocked: nothing thrown");
      await context.close();
    }

    /* ------------------------------------------- existing user: quiet backfill */
    {
      const solved = {}, recs = {};
      for (let i = 1; i <= 10; i++) { solved["e" + i] = true; recs["e" + i] = { tries: 1, solved: 1 + i, first: 1, section: "angles" }; }
      const { context, page, errors } = await open(browser, CH05, {
        "bm.progress.v1": JSON.stringify({ ch05: { solved, total: 12 } }),
        "bm.attempts.v1": JSON.stringify({ ch05: recs }),
        "bm.activity.v1": JSON.stringify({ days: { "2026-01-01": 400 } })
      });
      await wait(300);
      const r = await page.evaluate(() => ({
        ach: Object.keys(window.BMGame.game().ach).sort(), level: window.BMGame.run().seen.level,
        toasts: Array.prototype.map.call(document.querySelectorAll(".toast"), function (t) { return t.textContent; })
      }));
      check(r.ach.indexOf("first-light") > -1 && r.ach.indexOf("boss-down") > -1 && r.ach.indexOf("flawless") > -1, "existing work is backfilled (" + r.ach.join(", ") + ")");
      eq(r.level, window_level(400), "level appears silently from existing XP");
      check(r.toasts.length >= 1 && r.toasts.every((t) => !/^Level/.test(t)) && r.toasts.some((t) => /unlocked from earlier work/.test(t)), "one summary toast, no level fanfare (" + r.toasts.join(" | ") + ")");
      eq(errors, [], "no errors for an existing user");
      await context.close();
    }

    /* ------------------- progress saved before the attempt log: re-checks are free */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await page.evaluate(() => {
        var solved = {};
        Array.prototype.forEach.call(document.querySelectorAll(".ex[data-key]:not([data-inline])"), function (ex) { solved[ex.getAttribute("data-key")] = true; });
        localStorage.removeItem("bm.attempts.v1");
        localStorage.setItem("bm.progress.v1", JSON.stringify({ ch05: { solved: solved, total: Object.keys(solved).length } }));
        localStorage.setItem("bm.run.v1", JSON.stringify({ combo: { pips: 4, shield: false } }));
      });
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      await wait(300);
      const s0 = await state(page);
      eq([s0.medal, s0.hearts, s0.pips], [3, 3, 4], "older progress with no attempt log loads as Gold with the combo intact");
      await answer(page, '#practice .ex[data-key="e1"]', false);
      await answer(page, '#practice .ex[data-key="e2"]', false);
      await page.click('#practice .ex[data-key="e2"] .ex-form .ex-show');
      await page.click('#practice .ex[data-key="e3"] .ex-form .ex-clue-btn');
      await answer(page, '#practice .ex[data-key="e3"]', true);
      await wait(700);
      const s1 = await state(page);
      eq([s1.medal, s1.hearts, s1.pips, s1.xp], [3, 3, 4, s0.xp], "wrong re-checks, Show solution, a clue and a re-solve on solved work cost nothing and earn nothing");
      eq(await page.evaluate(() => (JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}")).ch05 || {}), {}, "no attempt and no rung is recorded for already-solved work");
      eq(errors, [], "no errors re-checking older progress");
      await context.close();
    }

    /* ------------- the help ladder: clues on demand, never shown by a wrong answer */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const keys = await page.evaluate(() => {
        var pick = function (sel) {
          var ex = Array.prototype.filter.call(document.querySelectorAll(sel), function (e) {
            return e.getAttribute("data-kind") !== "choice" && e.getAttribute("data-kind") !== "multi" &&
              e.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])");
          })[0];
          return ex && ex.getAttribute("data-key");
        };
        return { one: pick(".ex[data-hint]:not([data-hint2])"), two: pick("#practice .ex[data-hint][data-hint2]") };
      });
      const ladder = (k) => page.$eval('.ex[data-key="' + k + '"]', (ex) => {
        var btn = ex.querySelector(".ex-form .ex-clue-btn");
        return {
          button: btn && !btn.hidden ? btn.textContent.replace(/\s+/g, " ").trim() : null,
          clues: Array.prototype.map.call(ex.querySelectorAll(".ex-ladder .ex-clue"), function (h) { return h.getAttribute("data-level") + (h.hasAttribute("data-prev") ? "p" : ""); }).join(","),
          inFeedback: ex.querySelectorAll(".ex-feedback .ex-hint").length,
          offer: (function () { var o = ex.querySelector(".ex-feedback .ex-offer"); return o ? o.getAttribute("data-offer") : null; })()
        };
      });
      check(keys.one && keys.two, "ch05 has a one-clue and a two-clue typed exercise (" + JSON.stringify(keys) + ")");
      eq(await ladder(keys.two), { button: "Show a clue (1 of 2)", clues: "", inFeedback: 0, offer: null }, "the clue button is there from the start, saying how many clues there are");
      for (let i = 0; i < 3; i++) await answer(page, '.ex[data-key="' + keys.one + '"]', false);
      const one = await ladder(keys.one);
      eq([one.clues, one.inFeedback, one.offer], ["", 0, "clue"], "three wrong answers open no clue: the card offers one, in a line");
      check(await page.$eval('.ex[data-key="' + keys.one + '"] .ex-feedback', (f) => !!f.querySelector(".ex-verdict.no") && f.querySelectorAll(".ex-offer").length === 1),
        "the verdict and at most one offer line");

      /* opens on a click, focus moves to it, and it stays open after a reload */
      const sel2 = '.ex[data-key="' + keys.two + '"]';
      await page.click(sel2 + " .ex-clue-btn");
      eq(await ladder(keys.two), { button: "Next clue (2 of 2)", clues: "1", inFeedback: 0, offer: null }, "a click opens clue 1, and the button names clue 2");
      check(await page.evaluate((s) => document.activeElement === document.querySelector(s + " .ex-clue[data-level='1']"), sel2), "focus moves to the clue just opened");
      eq(await page.evaluate((k) => JSON.parse(localStorage.getItem("bm.attempts.v1")).ch05[k].rung, keys.two), 1, "the rung is saved in the attempt record");
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      eq(await ladder(keys.two), { button: "Next clue (2 of 2)", clues: "1", inFeedback: 0, offer: null }, "after a reload clue 1 is still open");
      check(await page.evaluate((s) => !document.querySelector(s).contains(document.activeElement), sel2), "a restored clue does not take focus");
      await page.click(sel2 + " .ex-clue-btn");
      eq(await ladder(keys.two), { button: null, clues: "1p,2", inFeedback: 0, offer: null }, "clue 2 opens below clue 1, which goes quieter; with every clue open the button goes");
      await answer(page, sel2, false);
      eq((await ladder(keys.two)).offer, "solution", "with every clue open, a miss offers the solution");
      check(await page.$eval(sel2 + " .ex-show", (b) => b.getAttribute("data-suggested") === "true"), "and the solution button is the suggestion");
      eq(errors, [], "no errors around the ladder");
      await context.close();
    }

    /* ------------------ a wrong answer that looks like a known slip gets a question */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const k = await page.evaluate(() => {
        var ex = Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-type='number']"), function (e) {
          return /^[1-9]\d*$/.test(e.getAttribute("data-answer") || "");
        })[0];
        return ex && ex.getAttribute("data-key");
      });
      check(!!k, "ch05 has a whole-number practice exercise (" + k + ")");
      const sel = '#practice .ex[data-key="' + k + '"]';
      const key = await page.$eval(sel, (e) => e.getAttribute("data-answer"));
      const fb = () => page.$eval(sel + " .ex-feedback", (f) => ({
        verdict: !!f.querySelector(".ex-verdict.no"),
        ask: (function () { var a = f.querySelector(".ex-ask"); return a ? a.getAttribute("data-detector") + ": " + a.textContent : null; })(),
        order: Array.prototype.map.call(f.children, function (c) { return c.className.split(" ")[0]; }).join(",")
      }));
      await page.fill(sel + " .ex-form input[type=text]", "-" + key);
      await page.press(sel + " .ex-form input[type=text]", "Enter");
      eq(await fb(), { verdict: true, ask: "sign: Check the sign of your last step?", order: "ex-verdict,ex-ask,ex-next" }, "the sign flipped: the verdict, the question, then the offer");
      await page.fill(sel + " .ex-form input[type=text]", "987654321");
      await page.press(sel + " .ex-form input[type=text]", "Enter");
      eq((await fb()).ask, null, "an answer no slip explains gets no question");
      const text = await page.$eval(sel + " .ex-feedback", (f) => f.textContent);
      check(text.indexOf(key) < 0, "the feedback never holds the answer");
      eq(errors, [], "no errors around the questions");
      await context.close();
    }

    /* ------- left alone after a miss: a quiet line in the card, nothing opened, no toast */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await page.clock.install();
      await page.reload();
      await page.waitForLoadState("load");
      const k = await page.evaluate(() => {
        var ex = Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-hint]"), function (e) { return e.getAttribute("data-kind") === "text"; })[0];
        return ex && ex.getAttribute("data-key");
      });
      const sel = '#practice .ex[data-key="' + k + '"]';
      await page.fill(sel + " .ex-form input[type=text]", "987654321");
      await page.press(sel + " .ex-form input[type=text]", "Enter");
      const look = () => page.$eval(sel, (ex) => {
        var o = ex.querySelector(".ex-feedback .ex-offer");
        return {
          offers: ex.querySelectorAll(".ex-feedback .ex-offer").length, signal: o && o.getAttribute("data-signal"),
          clues: ex.querySelectorAll(".ex-clue").length, dialog: !!document.querySelector("dialog[open], [role=dialog]:not([hidden]), [role=alertdialog]"),
          toast: Array.prototype.some.call(document.querySelectorAll(".toast"), function (t) { return /clue/i.test(t.textContent); })
        };
      });
      eq(await look(), { offers: 1, signal: null, clues: 0, dialog: false, toast: false }, "after a miss: one plain offer line");
      await page.clock.fastForward(60000);
      eq((await look()).signal, null, "a minute later, still the plain line");
      await page.clock.fastForward(31000);
      eq(await look(), { offers: 1, signal: "idle", clues: 0, dialog: false, toast: false }, "left alone with focus in the card: the line changes, once, and nothing opens or pops up");
      eq(errors, [], "no errors around the idle offer");
      await context.close();
    }

    /* ---- opening the solution first costs no heart and keeps the combo; answering with it
       open costs the pips a miss would, so it never out-earns one on the answers after it */
    {
      const { context, page, errors } = await open(browser, CH05, {
        "bm.lesson.v1": '{"mode":"page"}', "bm.run.v1": JSON.stringify({ combo: { pips: 3, shield: false } })
      });
      await answer(page, '#practice .ex[data-key="e1"]', true);
      await wait(600);
      const s0 = await state(page);
      await page.click('#practice .ex[data-key="e2"] .ex-form .ex-show');
      await wait(700);
      const s1 = await state(page);
      eq([s1.hearts, s1.pips, s1.heartsLabel], [3, s0.pips, "3 of 3 hearts"], "opening the solution of an untouched exercise: no heart lost, the combo kept");
      await answer(page, '#practice .ex[data-key="e2"]', true);
      await wait(700);
      const s2 = await state(page);
      eq([s2.xp - s1.xp, s2.pips, s2.hearts], [3, s0.pips - 2, 3], "solving it with the solution open: 3 XP, the two pips a miss would cost, still three hearts");
      /* a right first answer after clue 2: what a solve after a miss pays, and no pip either way */
      const two = await page.evaluate(() => {
        var ex = document.querySelector("#practice .ex[data-hint2]:not([data-state])");
        return ex && ex.getAttribute("data-key");
      });
      await page.click('#practice .ex[data-key="' + two + '"] .ex-clue-btn');
      await page.click('#practice .ex[data-key="' + two + '"] .ex-clue-btn');
      await answer(page, '#practice .ex[data-key="' + two + '"]', true);
      await wait(700);
      const s3 = await state(page);
      eq([s3.xp - s2.xp, s3.pips, s3.hearts], [6, s2.pips, 3], "right first time after clue 2: 6 XP, the combo unchanged");
      /* the finale: three hearts kept, a Silver medal, and the line that says why */
      for (let k = 1; k <= 10; k++) {
        const sel = '#practice .ex[data-key="e' + k + '"]';
        if (await page.$eval(sel, (e) => e.getAttribute("data-state") !== "correct")) await answer(page, sel, true);
      }
      await wait(1600);
      const fin = await page.evaluate(() => {
        var r = document.querySelector("#practice .encounter-result");
        return r && { shown: !r.hidden, text: r.textContent.replace(/\s+/g, " "), medal: document.querySelector("#practice .encounter").getAttribute("data-medal") };
      });
      check(fin && fin.shown && fin.medal === "2" && /3 of 3\s*hearts kept/.test(fin.text) && /1 of 10\s*solved with the solution open/.test(fin.text),
        "a Silver medal beside three hearts says it counted the solution opened first (" + (fin && fin.text.slice(0, 200)) + ")");
      eq(errors, [], "no errors around free help");
      await context.close();
    }

    /* -------------------------- the keyboard path: clue, check, next clue, solution */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const k = await page.evaluate(() => {
        var ex = Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-hint2]"), function (e) {
          return e.getAttribute("data-kind") === "text";
        })[0];
        return ex && ex.getAttribute("data-key");
      });
      const sel = '#practice .ex[data-key="' + k + '"]';
      const at = () => page.evaluate((s) => {
        var a = document.activeElement, ex = document.querySelector(s);
        if (!ex.contains(a)) return "outside";
        if (a.matches(".ex-clue")) return "clue " + a.getAttribute("data-level");
        if (a.matches("input")) return "input";
        return a.textContent.replace(/\s+/g, " ").trim();
      }, sel);
      await page.focus(sel + " .ex-form .btn:not(.ghost)");
      const path = [await at()];
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Enter"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.type("987654321");
      await page.keyboard.press("Enter"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Space"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Tab"); path.push(await at());
      await page.keyboard.press("Enter"); path.push(await at());
      eq(path, ["Check", "Show a clue (1 of 2)", "clue 1", "input", "input", "Check", "Next clue (2 of 2)", "clue 2", "input", "Check", "Show solution", "Hide solution"],
        "Tab reaches the clue button, Enter opens clue 1 and focus lands on it, Tab goes on to the answer, the next clue and the solution");
      check(await page.$eval(sel + " .ex-solution", (s) => s.getAttribute("data-show") === "true"), "Enter on Show solution opens it");
      eq(errors, [], "no errors on the keyboard path");
      await context.close();
    }

    /* ------------------------------- the theme choice with storage that throws */
    {
      const { context, page, errors } = await open(browser, "index.html", {}, { blockStorage: true });
      const theme = () => page.evaluate(() => [document.documentElement.getAttribute("data-theme"),
        document.querySelector('#hud-sheet input[data-pref="theme"]:checked').value]);
      await page.click(".hud-menu");
      const seen = [await theme()];
      for (const v of ["dark", "light", "dark", "system"]) { await page.click('#hud-sheet input[data-pref="theme"][value="' + v + '"]'); seen.push(await theme()); }
      eq(seen, [["light", "system"], ["dark", "dark"], ["light", "light"], ["dark", "dark"], ["light", "system"]], "the theme choice switches every way and the sheet shows it, with storage blocked");
      eq(errors, [], "no errors choosing the theme with storage blocked");
      await context.close();
    }

    /* ------------------- the chapter-done burst: as many particles as the CSS draws */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const last = await page.evaluate(() => {
        var keys = Array.prototype.map.call(document.querySelectorAll(".ex[data-key]:not([data-inline])"), function (ex) { return ex.getAttribute("data-key"); });
        var solved = {};
        keys.slice(0, -1).forEach(function (k) { solved[k] = true; });
        localStorage.setItem("bm.progress.v1", JSON.stringify({ ch05: { solved: solved, total: keys.length } }));
        return keys[keys.length - 1];
      });
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      /* the encounter plays its own finish; step it aside so the banner's burst is drawn */
      await page.evaluate(() => { if (window.BMEncounter) window.BMEncounter.active = false; });
      await answer(page, '.ex[data-key="' + last + '"]', true);
      eq(await page.evaluate(() => document.querySelectorAll(".chapter-done .burst i").length), 12, "the chapter-done burst emits the 12 particles the CSS styles");
      eq(errors, [], "no errors around the chapter-done burst");
      await context.close();
    }

    /* ------------- an empty Check keeps the hints; hints follow misses, not tries */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const keys = await page.evaluate(() => {
        var typed = Array.prototype.filter.call(document.querySelectorAll(".ex[data-hint]:not([data-hint2])"), function (e) {
          return e.getAttribute("data-kind") !== "choice" && e.getAttribute("data-kind") !== "multi" &&
            e.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])");
        }).map(function (e) { return e.getAttribute("data-key"); });
        return { one: typed[0], other: typed[1] };
      });
      const boxes = (k) => page.$eval('.ex[data-key="' + k + '"]', (ex) => ({
        clues: Array.prototype.map.call(ex.querySelectorAll(".ex-ladder .ex-clue"), function (h) { return h.getAttribute("data-level"); }).join(","),
        nudge: !!ex.querySelector(".ex-feedback .ex-verdict.nudge")
      }));
      const empty = (k) => page.$eval('.ex[data-key="' + k + '"]', (ex) => {
        ex.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])").value = "";
        ex.querySelector(".ex-form .btn:not(.ghost)").click();
      });
      const hints = (k) => page.evaluate((k) => (JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}").ch05 || {})[k], k);
      check(keys.one && keys.other, "ch05 has two one-hint typed exercises (" + JSON.stringify(keys) + ")");
      await answer(page, '.ex[data-key="' + keys.one + '"]', false);
      await empty(keys.one);
      eq(await boxes(keys.one), { clues: "", nudge: true }, "an empty Check after a miss shows the nudge, and no clue");
      await page.click('.ex[data-key="' + keys.one + '"] .ex-clue-btn');
      await empty(keys.one);
      eq(await boxes(keys.one), { clues: "1", nudge: true }, "an empty Check leaves an opened clue where it is");
      /* `hints` is written as it always was, from the misses, whatever was opened */
      const rec = await hints(keys.one);
      eq([rec.tries, rec.hints, rec.rung], [1, 1, 1], "the record: one try, hints 1 as before the ladder, rung 1 for the clue opened");
      await answer(page, '.ex[data-key="' + keys.other + '"]', true);
      await answer(page, '.ex[data-key="' + keys.other + '"]', false);
      eq(await boxes(keys.other), { clues: "", nudge: false }, "a miss after a first-try answer opens nothing either");
      eq((await hints(keys.other)).rung, undefined, "and no rung is written for it");
      eq(errors, [], "no errors around empty checks");
      await context.close();
    }

    /* ------------------------------- review fixes: one backfill summary, spoken once */
    {
      const solved = {}, recs = {};
      for (let i = 1; i <= 10; i++) { solved["e" + i] = true; recs["e" + i] = { tries: 1, solved: 1 + i, first: 1, section: "angles" }; }
      const { context, page, errors } = await open(browser, CH05, {
        "bm.lesson.v1": '{"mode":"page"}',
        "bm.progress.v1": JSON.stringify({ ch05: { solved, total: 12 } }),
        "bm.attempts.v1": JSON.stringify({ ch05: recs })
      });
      await wait(2000);
      const r = await page.evaluate(() => ({
        toasts: Array.prototype.map.call(document.querySelectorAll(".toast"), function (t) { return t.textContent; }),
        live: document.getElementById("bm-live").textContent
      }));
      eq(r.toasts.filter((t) => /from earlier work/.test(t)), ["3 achievements unlocked from earlier work."], "the first chapter visit backfills with exactly one summary toast");
      eq((r.live.match(/from earlier work/g) || []).length, 1, "and says it once");
      eq(errors, [], "no errors on the backfill");
      await context.close();
    }

    /* ------------------- review fixes: the toast stack, goal speech, hearts, stars */
    {
      const { context, page, errors } = await open(browser, CH05, {
        "bm.lesson.v1": '{"mode":"page"}',
        "bm.activity.v1": JSON.stringify({ days: { [dayAgo(0)]: 20 }, goal: 30 }),
        "bm.run.v1": JSON.stringify({ seen: { level: 1, ach: 1 }, combo: { pips: 2 } })
      }, { width: 400 });
      await page.evaluate(() => {
        window.__maxToasts = 0;
        window.__live = [];
        setInterval(function () {
          var up = document.querySelectorAll(".toast:not([data-out])").length;
          if (up > window.__maxToasts) window.__maxToasts = up;
        }, 20);
        new MutationObserver(function () { var t = document.getElementById("bm-live").textContent; if (t) window.__live.push(t); })
          .observe(document.getElementById("bm-live"), { childList: true, characterData: true, subtree: true });
      });
      /* +14 XP with the combo, the daily goal, level 2 and First light, all from one answer */
      await answer(page, '#practice .ex[data-key="e1"]', true);
      await wait(200);
      const now = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll(".toast:not([data-out])"), function (t) { return t.textContent; }));
      eq(now.length, 2, "one fast answer: two toasts on screen, not four (" + now.join(" | ") + ")");
      check(/\+14 XP/.test(now[0]) && /combo/.test(now[0]) && /Daily goal reached/.test(now[0]), "XP, combo and the daily goal share one toast");
      /* three quick misses take every heart: the lost ones break, and the last is said once */
      for (const k of ["e2", "e3", "e4"]) await answer(page, '#practice .ex[data-key="' + k + '"]', false);
      await wait(520);
      eq(await page.$$eval("#practice .encounter-hearts i[data-break]", (l) => l.length), 3, "the hearts just lost carry data-break");
      await wait(5600);
      const after = await page.evaluate(() => ({ max: window.__maxToasts, live: window.__live.join(" / "), breaks: document.querySelectorAll("[data-break]").length }));
      eq([after.max, after.breaks], [2, 0], "never more than two toasts; data-break is removed again");
      check(/Daily goal reached/.test(after.live), "the daily goal is spoken (" + after.live + ")");
      check(/No hearts left/.test(after.live) && !/0 of 3 hearts/.test(after.live), "losing the last heart is said once (" + after.live + ")");
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      await wait(300);
      eq(await page.$$eval("[data-break]", (l) => l.length), 0, "no heart breaks on a reload");
      for (const k of ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10"]) {
        if (await page.$eval('#practice .ex[data-key="' + k + '"]', (e) => e.getAttribute("data-state") !== "correct")) await answer(page, '#practice .ex[data-key="' + k + '"]', true);
      }
      await wait(1600);
      const st = await page.evaluate(() => {
        var m = document.querySelector("#practice .encounter-medal .encounter-stars"), chip = document.querySelector(".banner-stat[data-medal] .encounter-stars");
        return {
          medal: m && [m.getAttribute("aria-label"), m.querySelectorAll("i[data-on]").length, m.querySelectorAll("i").length],
          chip: chip && chip.getAttribute("aria-label"),
          text: (document.querySelector("#practice .encounter-result").textContent + document.querySelector(".banner-meta").textContent)
        };
      });
      eq([st.medal, st.chip], [["1 of 3 stars", 1, 3], "1 of 3 stars"], "the finale and the banner draw the medal's stars, with words");
      check(!/★/.test(st.text.replace(/★ \d+ \/ \d+ missions/, "")), "no star characters left for the medal");
      eq(errors, [], "no errors in the toast and hearts run");
      await context.close();
    }

    /* ------------------------- the sheet carries theme and account, on a phone and wide */
    {
      const { context, page, errors } = await open(browser, "parts/1-algebra/01-numbers.html", { "bm.lesson.v1": '{"mode":"page"}', "bm.theme": '"light"' }, { width: 360 });
      await page.click(".hud-menu");
      check(await page.$eval("#hud-sheet", (s) => s.open && s.matches(":modal")) && await page.$eval('#hud-sheet a[href$="account.html"]', (a) => !!a.offsetParent), "at 360px the sheet is modal and carries the account link");
      await page.click('#hud-sheet input[data-pref="theme"][value="dark"]');
      eq(await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.getElementById("hud-sheet").open, JSON.parse(localStorage.getItem("bm.theme"))]), ["dark", true, "dark"], "its Dark choice switches the theme, keeps it, and the sheet stays open");
      await page.focus('#hud-sheet [data-pref="map3d"]');
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      check(await page.evaluate(() => document.getElementById("hud-sheet").open && document.getElementById("hud-sheet").contains(document.activeElement)), "tabbing on from its last control stays inside the modal sheet");
      await page.keyboard.press("Escape");
      eq(await page.evaluate(() => [document.getElementById("hud-sheet").open, document.activeElement.classList.contains("hud-menu")]), [false, true], "Escape closes it and the focus is back on the menu button");
      eq(errors, [], "no errors around the sheet at 360px");
      await context.close();

      const wide = await open(browser, "parts/1-algebra/01-numbers.html", { "bm.lesson.v1": '{"mode":"page"}' });
      await wide.page.click(".hud-menu");
      check(await wide.page.$eval("#hud-sheet", (s) => s.open && !s.matches(":modal")), "at 1280px the sheet opens beside the rail, not modal");
      await wide.page.focus('#hud-sheet [data-pref="map3d"]');
      await wide.page.keyboard.press("Tab");
      check(await wide.page.evaluate(() => !document.getElementById("hud-sheet").open && document.querySelector(".hud-menu").getAttribute("aria-expanded") === "false"), "tabbing out of the wide sheet closes it");
      eq(wide.errors, [], "no errors around the sheet at 1280px");
      await wide.context.close();
    }

    /* --------------- review fixes: medals, recall, streaks and repairs off the chapter page */
    {
      const solved = {}, recs = {};
      for (let i = 1; i <= 9; i++) { solved["e" + i] = true; recs["e" + i] = { tries: 1, solved: 1000 + i, first: 1, section: "one-unknown" }; }
      recs.e1 = { tries: 2, solved: 1001, first: 0, section: "one-unknown" };
      const { context, page, errors } = await open(browser, "progress.html", {
        "bm.progress.v1": JSON.stringify({ ch02: { solved, total: 9 }, ch01: { solved: { e1: true }, total: 10 } }),
        "bm.attempts.v1": JSON.stringify({ ch02: recs }),
        "bm.game.v1": JSON.stringify({ enc: { "ch07/practice": { medal: 3, day: "2026-01-02" } } })
      });
      const cells = await page.$$eval("td.cell-medal", (l) => l.map((c) => c.getAttribute("data-medal") || ""));
      eq([cells[1], cells[7]], ["2", "3"], "progress shows medals without the set cache: from progress (ch02) and from the synced record (ch07)");
      await context.close();

      const p2 = await open(browser, "progress.html", { "bm.progress.v1": JSON.stringify({ ch01: { solved: { e1: true, e2: true }, total: 10 } }) });
      check(/Recall picks up a section/.test(await p2.page.$eval("#recall", (e) => e.textContent)), "Recall does not claim nothing is solved for solves that predate the attempt log");
      await p2.context.close();

      const days = {};
      for (let i = 40; i <= 46; i++) days[dayAgo(i)] = 30;
      const p3 = await open(browser, "index.html", { "bm.activity.v1": JSON.stringify({ days }) });
      await wait(300);
      check(await p3.page.evaluate(() => !!window.BMGame.game().ach["streak-7"]), "an old seven-day streak is backfilled");
      await p3.context.close();

      const T0 = Date.now() - 864e5 * 3;
      const p4 = await open(browser, "parts/1-algebra/02-linear-equations.html", {
        "bm.lesson.v1": '{"mode":"page"}',
        "bm.attempts.v1": JSON.stringify({ ch02: { e2: { tries: 3, opened: 1, hints: 2, solved: T0 + 50, section: "one-unknown" }, e3: { tries: 2, hints: 1, opened: 1, solved: T0 + 60, section: "one-unknown" } } }),
        "bm.game.v1": JSON.stringify({ sec: { "ch02#one-unknown": { n: 5, ok: 5, box: 1, last: "2026-01-01", fix: T0 + 100000 } } })
      });
      check(!/Worth another look/.test(await p4.page.$eval(".chapter-feedback", (e) => e.textContent)), "a section repaired in the Arena is not named on its chapter page");
      eq([errors, p2.errors, p3.errors, p4.errors], [[], [], [], []], "no errors off the chapter page");
      await p4.context.close();
    }

    /* ---------- review fixes: the Arena's copy follows the deck rule; achievements follow the medals */
    {
      const { context, page, errors } = await open(browser, "arena.html", {
        "bm.attempts.v1": JSON.stringify({ ch05: { t1: { tries: 1, first: 1, inline: 1, solved: Date.now() - 4e6, section: "angles" } } })
      });
      await wait(300);
      const empty = await page.$eval(".arena-empty", (e) => e.textContent);
      check(/solved two of its problems/.test(empty) && !/at least one problem/.test(empty), "the empty deck states the two-solve rule, not one solve");
      await context.close();

      const solved = {}, recs = {};
      for (let i = 1; i <= 9; i++) { solved["e" + i] = true; recs["e" + i] = { tries: 1, solved: 1000 + i, first: 1, section: "one-unknown" }; }
      const p2 = await open(browser, "progress.html", { "bm.progress.v1": JSON.stringify({ ch02: { solved, total: 9 } }), "bm.attempts.v1": JSON.stringify({ ch02: recs }) });
      await wait(300);
      const cell = await p2.page.$$eval("td.cell-medal", (l) => l[1].getAttribute("data-medal"));
      eq([cell, await p2.page.evaluate(() => ["boss-down", "flawless"].map((id) => !!window.BMGame.game().ach[id]))], ["3", [true, true]],
        "a Gold shown without the set cache also unlocks Boss down and Flawless on the same page");
      eq([errors, p2.errors], [[], []], "no errors on the Arena copy and progress checks");
      await p2.context.close();
    }

    /* ------------- the next best step: the right first item for three states, hidden for the day */
    {
      const today = dayAgo(0);
      const card = (page) => page.evaluate(() => {
        var c = document.querySelector(".next-step");
        if (!c) return null;
        return {
          kinds: Array.from(c.querySelectorAll(".next-step-item")).map((li) => li.getAttribute("data-kind")),
          first: c.querySelector(".next-step-link").textContent, href: c.querySelector(".next-step-link").getAttribute("href"),
          why: c.querySelector(".next-step-why").textContent, inMain: c.parentElement === document.querySelector("main"),
          parent: c.parentElement.className, edge: getComputedStyle(c).borderLeftWidth === getComputedStyle(c).borderTopWidth
        };
      });
      /* 1. a section placed in the Arena and now past its date: due reviews come first */
      const dueSeed = {
        "bm.attempts.v1": JSON.stringify({ ch02: { e1: { tries: 1, solved: 1, first: 1, section: "one-unknown" }, e2: { tries: 1, solved: 2, first: 1, section: "one-unknown" } } }),
        "bm.game.v1": JSON.stringify({ sec: { "ch02#one-unknown": { n: 2, ok: 2, box: 0, last: dayAgo(4) } } }),
        "bm.last": JSON.stringify({ id: "ch03", section: "order" })
      };
      const a = await open(browser, "index.html", dueSeed);
      const c1 = await card(a.page);
      eq([c1 && c1.kinds, c1 && c1.first, c1 && c1.href], [["due", "continue"], "1 section due for a check", "arena.html?mode=review"], "due: the first item is the due review");
      check(c1 && c1.why.length > 20 && !c1.inMain, "each item says why it is there, and the card is no child of <main>");
      /* hidden for today, on this device; still hidden after a reload; back the next day */
      await a.page.click(".next-step [data-next-hide]");
      check(await a.page.$(".next-step") === null, "Hide for today takes the card away");
      eq(await a.page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1")).nextHide), today, "and remembers the day, in the device-only run store");
      eq(await a.page.evaluate(() => document.activeElement && document.activeElement.tagName), "H1", "focus goes to the page's heading");
      await a.page.reload();
      await a.page.waitForFunction(() => document.readyState === "complete");
      check(await a.page.$(".next-step") === null, "the card stays away for the rest of the day");
      check(!/nextHide/.test(await a.page.evaluate(() => localStorage.getItem("bm.game.v1") || "")), "and nothing of it is in the synced game record");
      await a.page.evaluate((d) => { var r = JSON.parse(localStorage.getItem("bm.run.v1")); r.nextHide = d; localStorage.setItem("bm.run.v1", JSON.stringify(r)); }, dayAgo(1));
      await a.page.reload();
      await a.page.waitForFunction(() => document.readyState === "complete");
      check(await a.page.$(".next-step") !== null, "on a new day it is back");
      eq(a.errors, [], "no errors with the card");
      await a.context.close();

      /* 2. nothing due, one section weak: a Repair run first */
      const weakSeed = {
        "bm.attempts.v1": JSON.stringify({ ch05: { e1: { tries: 3, solved: 1, section: "parallels" }, e2: { tries: 1, solved: 2, first: 1, section: "angles" }, e3: { tries: 1, solved: 3, first: 1, section: "angles" } } }),
        "bm.game.v1": JSON.stringify({ sec: { "ch05#parallels": { n: 1, ok: 1, box: 1, last: today }, "ch05#angles": { n: 1, ok: 1, box: 1, last: today } } })
      };
      const b = await open(browser, "parts/1-algebra/03-real-numbers.html", weakSeed);
      const c2 = await card(b.page);
      eq([c2 && c2.kinds[0], c2 && c2.first, c2 && /arena\.html\?repair=ch05%23parallels$/.test(c2.href)], ["weak", "Repair §5.3 Parallel lines and transversals", true],
        "weak: on a chapter page, the first item is a Repair run on the weakest section");
      check(c2 && /region-banner/.test(c2.parent) && !c2.inMain, "on a chapter it sits in the banner, not among <main>'s children");
      eq(b.errors, [], "no errors with the card on a chapter");
      await b.context.close();

      /* 3. nothing due or weak: where the reader left off; in Study mode, without the game's colour */
      const c = await open(browser, "index.html", { "bm.last": JSON.stringify({ id: "ch02", section: "one-unknown" }), "bm.prefs.v1": JSON.stringify({ calm: true }) });
      const c3 = await card(c.page);
      eq([c3 && c3.kinds, c3 && c3.first, c3 && /parts\/1-algebra\/02-linear-equations\.html#one-unknown$/.test(c3.href)], [["continue"], "Continue: Chapter 2 · One unknown", true],
        "continue: with nothing due or weak, the first item is where the reader left off");
      eq([c1 && c1.edge, c3 && c3.edge], [false, true], "Study mode keeps the card, with the game's thick coloured edge taken off");
      eq(c.errors, [], "no errors with the card in Study mode");
      await c.context.close();
      /* 4. just learned: §1.2 (the Arena has problems for it) solved on its page a minute ago,
         §1.1 (it has none) three days ago, neither ever placed in the Arena. Nothing is due for
         a check yet: not §1.2, whose first check waits a day after its page solve, and not
         §1.1, which nothing could ever mark checked. The first item is Continue. */
      const now = Date.now(), ago3 = now - 864e5 * 3;
      const learned = {
        "bm.attempts.v1": JSON.stringify({ ch01: {
          a1: { tries: 1, first: 1, solved: now - 60000, section: "addition" }, a2: { tries: 1, first: 1, solved: now - 30000, section: "addition" },
          i1: { tries: 1, first: 1, solved: ago3, section: "integers" }, i2: { tries: 1, first: 1, solved: ago3 + 1, section: "integers" } } }),
        "bm.last": JSON.stringify({ id: "ch01", section: "addition" })
      };
      const e = await open(browser, "index.html", learned);
      const c4 = await card(e.page);
      eq([c4 && c4.kinds, c4 && c4.first], [["continue"], "Continue: Chapter 1 · Rules for addition"], "just learned: no section is called due straight after it was learned, nor one nothing can mark checked");
      await e.page.goto(url("arena.html?mode=review"));
      await e.page.waitForFunction(() => document.readyState === "complete");
      const lobby4 = await e.page.evaluate(() => ({
        none: (document.querySelector(".review-none") || {}).textContent || "",
        page: Array.from(document.querySelectorAll(".review-page li")).map((li) => li.getAttribute("data-section"))
      }));
      check(/^Nothing the Arena can ask about is due for a check today\. The next is §1\.2 Rules for addition, due tomorrow\.$/.test(lobby4.none),
        "the review lobby names tomorrow for §1.2's first check: " + lobby4.none);
      eq(lobby4.page, ["ch01#integers"], "and lists §1.1 as due on its page, three days after it was solved");
      await e.page.goto(url("arena.html"));
      await e.page.waitForFunction(() => document.readyState === "complete");
      const chip4 = await e.page.evaluate(() => {
        var li = Array.from(document.querySelectorAll(".arena-sec")).find((x) => /#addition$/.test(x.querySelector("a").getAttribute("href")));
        return li ? [li.getAttribute("data-status"), !!li.querySelector('.arena-chip[data-status="due"]')] : null;
      });
      eq(chip4, ["solid", false], "the Arena's deck list does not mark §1.2 Due either: the lobby tells one story");
      eq(e.errors, [], "no errors just after learning");
      await e.context.close();

      /* 5. only sections the Arena has no problems for: the lobby does not tell the reader to
         solve a section first, which they have done */
      const f = await open(browser, "arena.html?mode=review", { "bm.attempts.v1": JSON.stringify({ ch01: {
        i1: { tries: 1, first: 1, solved: ago3, section: "integers" }, i2: { tries: 1, first: 1, solved: ago3 + 1, section: "integers" } } }) });
      const none5 = await f.page.$eval(".review-none", (x) => x.textContent);
      check(/The Arena has no problems yet for the sections you have solved/.test(none5) && !/once you have solved it/.test(none5),
        "with only such sections solved, the lobby says the Arena has no problems for them: " + none5);
      eq(f.errors, [], "no errors on that lobby");
      await f.context.close();
    }

    /* ------------- 10. verdicts: injected form and unread on a page and in the Arena; parity */
    {
      const FORM = { kind: "form", alt: 0, read: "(6, -2)", reason: "notation" };
      const UNREAD = { kind: "unread", reason: "named", at: 0 };
      const VERDICTS = { "FORM": FORM, "y=-2, x=6": FORM, "UNREAD": UNREAD, "6/4": { kind: "right", alt: 0, read: "6/4", notes: ["unreduced"] } };
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await page.evaluate(INJECT, VERDICTS);
      const card = (sel) => page.evaluate((sel) => {
        var ex = document.querySelector(sel), fb = ex.querySelector(".ex-feedback"), v = fb.querySelector(".ex-verdict");
        return {
          state: ex.getAttribute("data-state"), kind: v && v.getAttribute("data-kind"),
          text: fb.getAttribute("data-show") === "true" ? fb.textContent.replace(/\s+/g, " ").trim() : "",
          blanks: Array.prototype.map.call(ex.querySelectorAll("input.blank"), function (b) { return [b.getAttribute("data-ok"), b.getAttribute("data-verdict"), b.getAttribute("aria-invalid")]; })
        };
      }, sel);
      const typed = async (sel, value) => { await page.fill(sel + " .ex-form input[type=text]", value); await page.click(sel + " .ex-form .btn:not(.ghost)"); };
      const fill = async (sel, vals) => {
        const inputs = await page.$$(sel + " input.blank");
        for (let i = 0; i < vals.length; i++) await inputs[i].fill(vals[i]);
        await page.click(sel + " .ex-form .btn:not(.ghost)");
      };
      const attempts = () => page.evaluate(() => JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}").ch05 || {});
      const E1 = '#practice .ex[data-key="e1"]', K1 = '.ex[data-key="k1"]', K2 = '.ex[data-key="k2"]';
      const s0 = await state(page);
      await typed(E1, "FORM");
      let c = await card(E1);
      eq([c.kind, c.text, c.state], ["form", "Right values. Write it as (6, -2).", null], "a form verdict shows its reason and leaves the card in no state");
      const s1 = await state(page);
      eq([s1.xp, s1.pips, (await attempts()).e1], [s0.xp, s0.pips, undefined], "and costs nothing on a page: no XP, no pip, no attempt record");
      await typed(E1, "y=-2, x=6");
      check(/We read that as \(6, -2\)\./.test((await card(E1)).text), "a labeled point gets the reading line");
      await typed(E1, "FORM");
      check(!/We read that as/.test((await card(E1)).text), "no reading line without a mixed number, a ½ or a label");
      await typed(E1, "UNREAD");
      c = await card(E1);
      eq([c.kind, c.text, c.state, (await attempts()).e1], ["nudge", "Type just the number.", null, undefined], "an unread verdict is a retype nudge: no state, no record");
      await typed(E1, "987654");
      c = await card(E1);
      check(c.state === "wrong" && /Not right/.test(c.text) && (await attempts()).e1.tries === 1, "a wrong answer after them is the first try: " + c.text);
      await typed(E1, "6/4");
      c = await card(E1);
      check(c.state === "correct" && /Correct\.\s*6\/4 is 3\/2 in lowest terms\./.test(c.text), "a right unreduced fraction is correct, with the lowest-terms note: " + c.text);
      eq((await attempts()).e1.tries, 2, "the right answer is the second try");

      /* blanks: k1 is [35, 145], k2 is [289, 17] */
      await fill(K1, ["35", "UNREAD"]);
      c = await card(K1);
      eq([c.kind, c.text, c.blanks], ["nudge", "Blank 2: Type just the number.", [[null, null, null], [null, null, null]]], "an unread blank stops the check, named, with nothing marked");
      await fill(K1, ["35", "FORM"]);
      c = await card(K1);
      eq([c.kind, c.text, c.state, c.blanks, (await attempts()).k1], ["form", "Right values. Write it as (6, -2).", null, [["true", null, null], ["false", "form", "true"]], undefined],
        "one form blank: the card is form at no cost, the blank marked like a wrong one and tagged");
      await fill(K1, ["35", "987654"]);
      c = await card(K1);
      eq([c.state, c.blanks[1], (await attempts()).k1.tries], ["wrong", ["false", null, "true"], 1], "a wrong answer in that blank next: the tag is cleared before the mark, and the miss counts");
      /* [form, wrong]: the detectors are asked about the wrong blank, never the form one */
      await page.evaluate(() => { window.__asked = []; window.BMLearn.detect = function (inp) { window.__asked.push(inp.given); return null; }; });
      await fill(K2, ["FORM", "987654"]);
      c = await card(K2);
      eq([c.state, c.blanks, await page.evaluate(() => window.__asked)], ["wrong", [["false", "form", "true"], ["false", null, "true"]], ["987654"]], "[form, wrong] blanks: wrong, and the detectors see the second blank only");
      await fill(K2, ["289", "17"]);
      c = await card(K2);
      eq([c.state, c.blanks], ["correct", [["true", null, null], ["true", null, null]]], "all right: the marks reset and the tag goes");
      eq(errors, [], "no errors through the injected verdicts on a page");
      await context.close();

      /* the Arena: BMCore.judge read at check time; unread nudges, form is a miss */
      const a = await open(browser, "arena.html", {});
      await a.page.evaluate(() => {
        /* every section the generators cover, solid in the deck, as arena.test.js seeds it */
        var all = {}, t = Date.now() - 864e5 * 2;
        window.BMGen.list().forEach(function (s) {
          var ch = s.section.split("#")[0], sec = s.section.split("#")[1], recs = all[ch] = all[ch] || {};
          recs["z" + sec + "1"] = { tries: 1, first: 1, solved: t, section: sec };
          recs["z" + sec + "2"] = { tries: 1, first: 1, solved: t + 1, section: sec };
        });
        localStorage.setItem("bm.attempts.v1", JSON.stringify(all));
      });
      await a.page.reload();
      await a.page.waitForFunction(() => document.readyState === "complete");
      /* parity first, on the real judge: 500 seeded golden cases in Chromium against Node */
      {
        const golden = require("../fixtures/grade-golden.json");
        const { judge, specOf } = require("../../src/core/answer/check.ts");
        const all = [];
        golden.groups.forEach((g) => { g.right.concat(g.wrong).forEach((given) => all.push({ given, answer: g.answer, type: g.type, tol: g.tol })); });
        const rand = mulberry(20261007), picked = [];
        for (let i = 0; i < 500; i++) picked.push(all[Math.floor(rand() * all.length)]);
        const node = picked.map((x) => judge(x.given, specOf(x)));
        const web = await a.page.evaluate((cs) => cs.map((x) => window.BMCore.judge(x.given, window.BMCore.specOf(x))), picked);
        let differ = 0;
        for (let i = 0; i < picked.length; i++) if (JSON.stringify(node[i]) !== JSON.stringify(web[i])) differ++;
        eq([web.length, differ], [500, 0], "BMCore.judge in Chromium agrees with Node on 500 seeded golden cases");
      }
      await a.page.evaluate(INJECT, VERDICTS);
      const ar = () => a.page.evaluate(() => {
        var r = window.BMArena.state(), q = r.qs[r.i], v = document.querySelector(".arena-feedback .arena-verdict"), n = document.querySelector(".arena-nudge");
        return { i: r.i, phase: r.cur.phase, el: r.cur.el, hearts: r.hearts, streak: r.streak, timed: q.timed, hf: q.hf, ans: r.ans[r.i] || null,
          verdict: v && [v.getAttribute("data-kind"), v.getAttribute("data-verdict"), v.textContent.trim()], nudge: n && !n.hidden ? n.textContent : "" };
      });
      const type = async (value) => { await a.page.fill("#arena-answer", value); await a.page.click('.arena-run [data-act="check"]'); };
      await a.page.click('[data-act="start"][data-mode="standard"]');
      for (let k = 0; k < 10; k++) {
        const s = await ar();
        if (s.timed && !s.hf) break;
        await a.page.click('.arena-run [data-act="pass"]');
        if ((await ar()).phase === "retry") await a.page.click('.arena-run [data-act="pass"]');
        await a.page.click('.arena-feedback [data-act="next"]');
      }
      let s = await ar();
      check(s.timed && !s.hf && s.hearts === 3, "on a timed question with hearts");
      await type("UNREAD");
      await wait(2300);
      s = await ar();
      eq([s.nudge, s.phase, s.hearts, s.ans, s.el > 0], ["Type just the number.", "ask", 3, null, true], "unread in the Arena: a nudge, still asking, no heart, nothing recorded, and the clock runs on");
      await type("FORM");
      s = await ar();
      eq([s.phase, s.hearts, s.streak, s.ans && s.ans.miss, s.ans && s.ans.lost, s.nudge, s.verdict],
        ["retry", 2, 0, true, true, "", ["no", "form", "✗ Right values. Write it as (6, -2). That cost a heart."]],
        "form in the Arena is a miss (heart, streak), and its reason stands in for the miss text");
      await a.page.reload();
      await a.page.waitForFunction(() => document.readyState === "complete");
      s = await ar();
      eq([s.phase, s.verdict && s.verdict[2]], ["retry", "✗ Right values. Write it as (6, -2). That cost a heart."], "the reason survives a reload with the run");
      await a.page.evaluate(INJECT, VERDICTS);
      await type("FORM");
      s = await ar();
      eq([s.phase, s.hearts, s.verdict], ["done", 2, ["no", "form", "✗ Right values. Write it as (6, -2). Here is how it goes."]], "form on the retry: the second miss, with its reason");
      await a.page.click('.arena-feedback [data-act="next"]');
      await type("987654321");
      s = await ar();
      eq([s.phase, s.hearts, s.verdict], ["retry", 1, ["no", null, "✗ Not right, and that cost a heart."]], "a wrong answer still reads as before");
      eq(a.errors, [], "no errors through the injected verdicts in the Arena");
      await a.context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}
function window_level(xp) { let L = 1; while (5 * L * (L + 4) <= xp) L++; return L; }
/* a local YYYY-MM-DD, n days back, as site.js keys the activity days */
function dayAgo(n) {
  const d = new Date(), t = (x) => (x < 10 ? "0" : "") + x;
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + t(d.getMonth() + 1) + "-" + t(d.getDate());
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " browser: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
