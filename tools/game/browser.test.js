#!/usr/bin/env node
/* Headless Chromium checks of the game layer, over file:// URLs.
   Playwright is borrowed from another checkout (nothing is installed here):
     BM_PLAYWRIGHT_FROM=~/dev/json-data-drift-analyzer/ node tools/game/browser.test.js
   Every network request is aborted, so KaTeX and the fonts are absent: the pages
   must work without the CDN anyway, and the run is deterministic.

   1. ch05 in whole-page mode: three first-try answers give 10, 12, 14 XP and 3 pips;
      a first miss on a fresh one costs 2 pips and leaves 2 hearts
   2. reload: pips, hearts, health and medal identical, no XP replayed
   3. solving all ten shows the finale inside #practice, and in step mode too
   4. calm mode hides hearts and combo
   5. no AudioContext is constructed while sound is off (and one is once it is on)
   6. no console errors on index, about, progress and four chapters in both themes
   7. localStorage that throws on every access breaks nothing */
"use strict";
const path = require("path");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "../..");
const FROM = process.env.BM_PLAYWRIGHT_FROM || path.join(process.env.HOME || "", "dev/json-data-drift-analyzer/");
const { chromium } = createRequire(FROM.endsWith("/") ? FROM : FROM + "/")("playwright");

const CH05 = "parts/2-geometry/05-distance-and-angles.html";
const url = (p) => "file://" + path.join(ROOT, p);
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) {
  check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* counts AudioContext constructions, so a test can assert none happen with sound off */
const AUDIO_SPY = "(" + function () {
  window.__ac = 0;
  var AC = window.AudioContext;
  if (AC) {
    window.AudioContext = function () { window.__ac++; return new AC(); };
    window.AudioContext.prototype = AC.prototype;
  }
} + ")()";

async function open(browser, page0, seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, reducedMotion: opts.reducedMotion || "no-preference" });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
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
    if (/Failed to load resource|net::ERR_/.test(m.text())) return; /* the aborted CDN requests */
    errors.push("console: " + m.text());
  });
  await page.goto(url(page0));
  /* seed storage on the file:// origin, then load the page again from that state */
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
  const browser = await chromium.launch();
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
      check(fin && /9 of 10\s*right first time/.test(fin.text), "finale counts first-try answers (" + (fin && fin.text.slice(0, 120)) + ")");
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
      check(await page.$eval("#hud-sheet", (s) => !s.hidden) && await page.$eval(".hud-menu", (b) => b.getAttribute("aria-expanded")) === "true", "menu opens the sheet");
      await page.click('#hud-sheet [data-pref="sound"]');
      eq(await page.evaluate(() => window.BMGame.prefs().sound), false, "the sheet switch turns it off again");
      await page.keyboard.press("Escape");
      check(await page.$eval("#hud-sheet", (s) => s.hidden), "Escape closes the sheet");
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
      await page.click('#practice .ex[data-key="e2"] .ex-form .btn.ghost');
      await answer(page, '#practice .ex[data-key="e3"]', true);
      await wait(700);
      const s1 = await state(page);
      eq([s1.medal, s1.hearts, s1.pips, s1.xp], [3, 3, 4, s0.xp], "wrong re-checks, Show solution and a re-solve on solved work cost nothing and earn nothing");
      eq(await page.evaluate(() => (JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}")).ch05 || {}), {}, "no attempt is recorded for already-solved work");
      eq(errors, [], "no errors re-checking older progress");
      await context.close();
    }

    /* --------------------------- hints already given stay once they run out */
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
        return { one: pick(".ex[data-hint]:not([data-hint2])"), two: pick(".ex[data-hint][data-hint2]") };
      });
      const boxes = (k) => page.$eval('.ex[data-key="' + k + '"]', (ex) => ({
        level: ex.getAttribute("data-hint-level"),
        hints: Array.prototype.map.call(ex.querySelectorAll(".ex-feedback .ex-hint"), function (h) { return h.getAttribute("data-level") + (h.hasAttribute("data-prev") ? "p" : ""); }).join(","),
        next: !!ex.querySelector(".ex-feedback .ex-next")
      }));
      check(keys.one && keys.two, "ch05 has a one-hint and a two-hint typed exercise (" + JSON.stringify(keys) + ")");
      for (let i = 0; i < 3; i++) await answer(page, '.ex[data-key="' + keys.one + '"]', false);
      eq(await boxes(keys.one), { level: "3", hints: "1p", next: true }, "one hint: later misses keep it, quieter, above the nudge to the solution");
      for (let i = 0; i < 3; i++) await answer(page, '.ex[data-key="' + keys.two + '"]', false);
      eq(await boxes(keys.two), { level: "3", hints: "1p,2p", next: true }, "two hints: the third miss keeps both, quieter");
      eq(errors, [], "no errors around hints");
      await context.close();
    }

    /* ------------------------------- theme toggle with storage that throws */
    {
      const { context, page, errors } = await open(browser, "index.html", {}, { blockStorage: true });
      const theme = () => page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.querySelector("[data-theme-toggle]").textContent]);
      const seen = [await theme()];
      for (let i = 0; i < 3; i++) { await page.click("[data-theme-toggle]"); seen.push(await theme()); }
      eq(seen, [["light", "☾"], ["dark", "☀"], ["light", "☾"], ["dark", "☀"]], "the theme toggle switches both ways and its label follows, with storage blocked");
      eq(errors, [], "no errors toggling the theme with storage blocked");
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
        hints: Array.prototype.map.call(ex.querySelectorAll(".ex-feedback .ex-hint"), function (h) { return h.getAttribute("data-level") + (h.hasAttribute("data-prev") ? "p" : ""); }).join(","),
        nudge: !!ex.querySelector(".ex-feedback .ex-verdict.nudge")
      }));
      const empty = (k) => page.$eval('.ex[data-key="' + k + '"]', (ex) => {
        ex.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])").value = "";
        ex.querySelector(".ex-form .btn:not(.ghost)").click();
      });
      check(keys.one && keys.other, "ch05 has two one-hint typed exercises (" + JSON.stringify(keys) + ")");
      await answer(page, '.ex[data-key="' + keys.one + '"]', false);
      await empty(keys.one);
      eq(await boxes(keys.one), { hints: "1", nudge: true }, "an empty Check after the first miss keeps the current hint under the nudge");
      await answer(page, '.ex[data-key="' + keys.one + '"]', false);
      await empty(keys.one);
      eq(await boxes(keys.one), { hints: "1p", nudge: true }, "an empty Check after two misses keeps the quieter hint");
      await answer(page, '.ex[data-key="' + keys.other + '"]', true);
      await answer(page, '.ex[data-key="' + keys.other + '"]', false);
      eq(await boxes(keys.other), { hints: "1", nudge: false }, "a miss after a first-try answer shows the hint as new, not as one already given");
      eq(errors, [], "no errors around empty checks");
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
function window_level(xp) { let L = 1; while (5 * L * (L + 4) <= xp) L++; return L; }

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " browser: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
