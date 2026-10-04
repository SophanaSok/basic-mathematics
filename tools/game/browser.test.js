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

    /* ------------------------- review fixes: the sheet carries theme and account */
    {
      const { context, page, errors } = await open(browser, "parts/1-algebra/01-numbers.html", { "bm.lesson.v1": '{"mode":"page"}', "bm.theme": '"light"' }, { width: 360 });
      await page.click(".hud-menu");
      check(await page.$eval(".hud-sheet .hud-sheet-theme", (b) => !!b.offsetParent), "at 360px the sheet shows a theme button");
      await page.click(".hud-sheet .hud-sheet-theme");
      eq(await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.getElementById("hud-sheet").hidden]), ["dark", false], "it switches the theme and the sheet stays open");
      await page.focus('.hud-sheet [data-pref="map3d"]');
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      check(await page.evaluate(() => document.getElementById("hud-sheet").hidden || document.getElementById("hud-sheet").contains(document.activeElement)), "tabbing out of the sheet closes it");
      eq(errors, [], "no errors around the sheet");
      await context.close();
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
  } finally {
    await browser.close();
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
