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
   8a. the worked solution opens by itself after a right answer (card U-1): the button reads "Hide
      solution", the line says so, XP, hearts and pips are as before and no "opened first" is recorded;
      in view for four seconds it earns the shield (bm.game.v1.cmp), scrolled past it earns none; a
      reload restores the card solved with the solution closed and a line that invites opening it; the
      twin button is there without a click
   8b. the change-approach card (src/learn/approach.ts): once every clue is open, the second miss shows one card
      after the verdict (not the first, not a third), a Reread link into the curriculum, Keep going hides it;
      the encounter's Regroup still names a section
   8c. the support line (src/ui/ladder.ts): a shaky prerequisite gives one line on a section's first card, naming it
      with a link, and its button focuses the worked example; strong ones give a first wrong check no offer line
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
  11. the real verdicts, with the typed grader live: on 01-numbers 0.667 for the key 2/3 is
      form/rounded at no cost, 1-1/2 is an unread nudge worded by the owner's Q4(a), 1 1/2 is
      wrong (it is 3/2) with the "We read that as 3/2" line, 4/6 is right with the
      lowest-terms note, a mixed number in a blank marks that blank and shows its reading,
      and an unread blank leaves the last check's marks; on 08-coordinates a wrong x=3 on an
      exact card shows no reading line, 8/2 stays wrong for 4|iv, and a labeled point for a
      point key is form/notation with its reading; in the Arena, on frac-sum problems set into the run, the key with º or ˚
      is unread/units (a nudge, no heart, the clock runs on), with " deg" or ° it is still
      right after clean(), and its 3-place decimal is form/rounded, a miss with its reason
  12. the learning log (src/ui/events.ts, bm.events.v1) on ch05: a wrong then a right check
      are two entries, a clue 2 an h entry, the solution opened on an untouched exercise an
      o entry and the right answer after it a c entry with its flag; ids carry the device id;
      what was typed never reaches storage; a reload keeps the log; the Reset button empties
      it and redraws the device id; a page-only history has no schedule; no console errors
  13. the finale's reveal (src/ui/results.ts): with motion on it plays (data-seq, Skip after the
      title, the real numbers in the text throughout, one announcement), Skip, Escape and a
      click each end it and leave the markup a reduced-motion render holds, focus goes to the
      title when Skip had it, a reload does not replay it, and Reduce motion and Study mode
      never start it
  14. the faded rung and the authored notes (a response rewrite gives ch05's exercise e1 a
      data-final step, two more clues and a ul.ex-miss; the pages ship without them): the
      button counts the worked steps as the fourth rung, they open with focus and without
      the answer line, the final step or any id, rung 4 is saved and comes back unfocused,
      the right answer then pays 4 XP, costs no heart and counts as not first time for the
      medal; a wrong answer equal to a note's data-given shows the note and no question,
      another wrong answer shows no note, the attempt record gains no key; the same under
      Reduce motion and Study mode
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
  /* a page response rewritten in flight (case 14): the built page, plus the markup the pages do not ship yet */
  if (opts.rewrite) {
    await context.route(url(page0), async (r) => {
      const res = await r.fetch();
      await r.fulfill({ response: res, body: opts.rewrite(await res.text()) });
    });
  }
  await page.goto(url(page0));
  /* seed storage on the server's origin, then load the page again from that state */
  if (!opts.blockStorage) {
    await page.evaluate((seed) => {
      localStorage.clear();
      if (!("bm.guide.v1" in seed)) localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}');
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
      await wait(2400);   /* the finale's reveal (src/ui/results.ts) ends by 2000ms; its overlays are in the text until then */
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

    /* ------------------ the boss bar follows the practice set (U-3) */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await page.evaluate(() => {
        window.__att = [];
        window.BMStore.on(function (c) { if (c.type === "attempt") window.__att.push([c.correct, c.detector === undefined ? "undef" : c.detector]); });
      });
      const k = await page.evaluate(() => {
        var all = Array.prototype.slice.call(document.querySelectorAll("#practice .ex"));
        var ex = all.filter(function (e, i) { return i >= 5 && e.getAttribute("data-type") === "number" && /^[1-9]\d*$/.test(e.getAttribute("data-answer") || ""); })[0];
        return ex && ex.getAttribute("data-key");
      });
      check(!!k, "ch05 has a whole-number exercise from the sixth on (" + k + ")");
      const sel = '#practice .ex[data-key="' + k + '"]';
      const bar = () => page.evaluate(() => {
        var b = document.querySelector(".bossbar");
        if (!b) return null;
        return {
          hidden: b.hidden, aria: b.getAttribute("aria-hidden"), inMain: !!b.closest("main"), html: document.documentElement.hasAttribute("data-bossbar"),
          segs: b.querySelectorAll(".bossbar-seg").length, solved: b.querySelectorAll('.bossbar-seg[data-how="solved"],.bossbar-seg[data-how="first"]').length,
          full: b.querySelectorAll(".bossbar-hearts i[data-full]").length, brk: b.querySelectorAll("i[data-break]").length,
          hit: b.hasAttribute("data-hit"), say: b.querySelector(".bossbar-say").textContent
        };
      });
      const toEx = () => page.evaluate((s) => { window.scrollTo({ top: document.querySelector(s).getBoundingClientRect().top + window.scrollY - 180, behavior: "instant" }); }, sel);
      eq((await bar()).hidden, true, "at the top of the page the card is in view and the bar is hidden");
      await toEx();
      await wait(300);
      const b0 = await bar();
      eq([b0.hidden, b0.aria, b0.inMain, b0.html, b0.segs, b0.full], [false, "true", false, true, 10, 3], "with the card out of view the bar shows: aria-hidden, outside main, ten segments, three hearts");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await wait(300);
      eq((await bar()).hidden, true, "back at the top, hidden again");
      await toEx();
      await wait(300);
      await page.fill(sel + " .ex-form input[type=text]", "-" + (await page.$eval(sel, (e) => e.getAttribute("data-answer").split("|")[0])));
      await page.press(sel + " .ex-form input[type=text]", "Enter");
      await wait(520);
      const b1 = await bar();
      eq([b1.full, b1.brk, b1.say], [2, 1, "A sign slipped past you. I like it that way."], "a sign slip: two hearts, one breaking, the sign taunt");
      await wait(500);
      await answer(page, sel, true);
      await wait(520);
      const b2 = await bar();
      eq([b2.solved, b2.hit, b2.say], [b0.solved + 1, true, ""], "a right answer: one more segment, the hit, the taunt gone");
      await wait(1100);
      const b3 = await page.evaluate(() => ({ brk: document.querySelectorAll("[data-break]").length, hit: document.querySelectorAll("[data-hit]").length, fresh: document.querySelectorAll(".bossbar [data-fresh]").length }));
      eq(b3, { brk: 0, hit: 0, fresh: 0 }, "the break, hit and fresh marks clear on their own");
      eq(await page.evaluate(() => window.__att), [[false, "sign"], [true, null]], "the attempt event carries the detector, null when right");
      eq(errors, [], "no errors with the boss bar");
      await context.close();
    }

    {
      const { context, page } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": '{"calm":true}' });
      const seen = [];
      for (const y of [0, 900, 2200, 4000, 6000]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
        await wait(250);
        seen.push(await page.evaluate(() => { var b = document.querySelector(".bossbar"); return !b || b.hidden; }));
      }
      eq(seen, [true, true, true, true, true], "Study mode: the boss bar is hidden at every scroll position");
      await context.close();
    }

    {
      const { context, page } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => { document.documentElement.setAttribute("data-motion", "reduce"); });
      const sel = '#practice .ex[data-key="e7"]';
      await page.evaluate((s) => { window.scrollTo({ top: document.querySelector(s).getBoundingClientRect().top + window.scrollY - 180, behavior: "instant" }); }, sel);
      await wait(300);
      await answer(page, sel, true);
      await wait(520);
      check(await page.evaluate(() => !document.querySelector(".bossbar").hidden), "reduced motion: the bar is shown");
      await wait(100);
      eq(await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".bossbar")).length), 0, "reduced motion: the bar runs no animation after a solve");
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
          if (p === "progress.html") eq([info.achievements, info.recall], [28, true], "progress page lists 28 achievements and the Recall panel");
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

    /* ------------- the solution opens by itself after a right answer (U-1) */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const E1 = '#practice .ex[data-key="e1"]', E2 = '#practice .ex[data-key="e2"]';
      const view = (sel, how) => page.evaluate(({ sel, how }) => {
        var s = document.querySelector(sel + " .ex-solution");
        if (how === "in") s.scrollIntoView({ block: "center" });
        else window.scrollTo(0, 0);
      }, { sel, how });
      const cmp = () => page.evaluate(() => (JSON.parse(localStorage.getItem("bm.game.v1") || "{}").cmp || {}).ch05 || {});
      const shield = () => page.evaluate(() => !!(JSON.parse(localStorage.getItem("bm.run.v1") || "{}").combo || {}).shield);
      const solShown = (sel) => page.$eval(sel, (ex) => ({
        show: ex.querySelector(".ex-solution").getAttribute("data-show"),
        btn: ex.querySelector(".ex-show").textContent.trim(),
        line: (ex.querySelector(".ex-feedback .ex-next") || {}).textContent || ""
      }));
      check(await page.$(E1 + " .ex-solution") !== null && await page.$(E2 + " .ex-solution") !== null, "ch05 e1 and e2 have solutions");
      const x0 = (await state(page)).xp;
      await answer(page, E1, true);
      const s1 = await state(page);
      eq([s1.xp - x0, s1.hearts, s1.pips], [10, 3, 1], "a right first answer pays 10, keeps 3 hearts and gains a pip");
      const sh = await solShown(E1);
      eq([sh.show, sh.btn], ["true", "Hide solution"], "the solution opened by itself");
      check(/The solution is open below\. Compare your route with it\./.test(sh.line), "the line says the solution is open (" + sh.line + ")");
      /* hiding it by hand changes the hint line; showing it again changes it back */
      await page.click(E1 + " .ex-show");
      check(/Open the solution below to compare your route\./.test((await solShown(E1)).line), "hiding the auto-opened solution turns the line into an invitation");
      await page.click(E1 + " .ex-show");
      check(/The solution is open below\./.test((await solShown(E1)).line), "and showing it again says it is open");
      const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("bm.attempts.v1")).ch05.e1);
      check(rec.solved && !rec.opened, "no solution-opened-first mark in the attempt record: " + JSON.stringify(rec));
      await view(E1, "in");
      await wait(4500);
      check(!!(await cmp()).e1, "in view for four seconds: the comparison is recorded");
      check(await shield(), "and the shield is ready");
      /* a second one, scrolled past at once */
      await answer(page, E2, true);
      await view(E2, "out");
      await wait(4500);
      check(!(await cmp()).e2, "scrolled past: no comparison recorded for the second card");
      /* the twin button needs no click on Show solution */
      check(await page.$eval(E1 + " .ex-twin-btn", (b) => !b.hidden).catch(() => false), "the Try one like it button is there after the auto-open");
      /* a reload restores solved, closed, with an invitation */
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      const rs = await solShown(E1);
      eq([rs.show, rs.btn], [null, "Show solution"], "after a reload the solved card's solution is closed");
      check(/Open the solution below to compare your route\./.test(rs.line), "and the line invites opening it (" + rs.line + ")");
      eq(errors, [], "no errors around the auto-open");
      await context.close();
    }

    /* ------------- the change-approach card: every clue open, two more misses, one card */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const keys = await page.evaluate(() => {
        var typed = Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-hint]"), function (e) {
          return e.getAttribute("data-kind") !== "choice" && e.getAttribute("data-kind") !== "multi" && e.querySelector(".ex-solution") &&
            e.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])");
        }).map(function (e) { return e.getAttribute("data-key"); });
        return typed;
      });
      check(keys.length >= 1, "ch05 has a typed practice exercise with clues and a solution");
      const sel = '#practice .ex[data-key="' + keys[0] + '"]';
      const cards = () => page.$$eval(sel + " .ex-approach", (c) => c.length);
      await answer(page, sel, false);
      await answer(page, sel, false);
      eq(await cards(), 0, "two misses while a clue is still unopened show no approach card");
      for (let i = 0; i < 6 && await page.$eval(sel + " .ex-clue-btn", (b) => !b.hidden); i++) await page.click(sel + " .ex-clue-btn");
      check(await page.$eval(sel + " .ex-clue-btn", (b) => b.hidden), "every clue (and the faded rung) is open");
      await answer(page, sel, false);
      eq(await cards(), 0, "the first miss after the ladder ran out shows no approach card");
      await answer(page, sel, false);
      eq(await cards(), 1, "the second shows one");
      check(await page.$eval(sel, (ex) => {
        var c = ex.querySelector(".ex-approach"), fb = ex.querySelector(".ex-feedback");
        return fb.nextElementSibling === c && !c.contains(document.activeElement) && !c.contains(fb) && /Try a different way in/.test(c.textContent);
      }), "it follows the verdict and takes no focus");
      await answer(page, sel, false);
      eq(await cards(), 1, "a third miss adds no second card");
      const href = await page.$eval(sel + " .ex-approach a.btn", (a) => a.getAttribute("href"));
      check(/\.html#[\w-]+$/.test(href || ""), "the Reread link points into the curriculum (" + href + ")");
      /* every miss so far is on this card, so the most-missed section is its own */
      const own = await page.$eval(sel, (ex) => ex.getAttribute("data-section") || "");
      if (own) check((href || "").endsWith("#" + own.slice(own.indexOf("#") + 1)), "the Reread link names the section behind the misses (" + own + ")");
      await page.click(sel + " .ex-approach [data-keep-going]");
      check(await page.$eval(sel + " .ex-approach", (c) => c.hidden), "Keep going hides it");

      /* the encounter's Regroup still names a section: three more misses in the set */
      const others = await page.evaluate((k) => Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-key]"), function (e) {
        return e.getAttribute("data-key") !== k;
      }).slice(0, 3).map(function (e) { return e.getAttribute("data-key"); }), keys[0]);
      for (const k of others) await answer(page, '#practice .ex[data-key="' + k + '"]', false);
      await wait(700);
      const rg = await page.$eval("#practice .encounter-regroup", (r) => r.textContent).catch(() => null);
      check(rg && /trace back to/.test(rg), "the encounter regroup still names a section (" + rg + ")");
      eq(errors, [], "no errors around the approach card");
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
      await wait(2400);   /* the finale's reveal (src/ui/results.ts) ends by 2000ms; its overlays are in the text until then */
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

    /* ------------------- U-8: one progress story in the sidebar, a steady puzzle, a phone row */
    {
      const side = (page) => page.evaluate(() => {
        var el = document.querySelector("[data-side-progress]");
        return { text: el.textContent.replace(/\s+/g, " ").trim(), width: el.querySelector(".bar span").style.width };
      });
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const N = await page.evaluate(() => document.querySelectorAll("#main .ex[data-inline]").length);
      const T = await page.evaluate(() => document.querySelectorAll("#main .ex:not([data-inline])").length);
      check(N > 0 && T > 0, "CH05 has inline checks and a practice set");
      const s0 = await side(page);
      check(s0.text.indexOf("Practice: 0 of " + T + " solved") > -1 && s0.text.indexOf("Checks: 0 of " + N) > -1, "the sidebar opens with both counts: " + s0.text);
      await answer(page, "#t1", true);
      const s1 = await side(page);
      check(s1.text.indexOf("Checks: 1 of " + N) > -1 && s1.text.indexOf("Practice: 0 of " + T) > -1, "a solved Your turn moves the Checks count only: " + s1.text);
      eq(s1.width, s0.width, "the bar still tracks the practice set");
      await answer(page, '#practice .ex[data-key="e1"]', true);
      const s2 = await side(page);
      check(s2.text.indexOf("Practice: 1 of " + T) > -1 && s2.text.indexOf("Checks: 1 of " + N) > -1, "a solved exercise moves the Practice count: " + s2.text);
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      const s3 = await side(page);
      check(s3.text.indexOf("Practice: 1 of " + T) > -1 && s3.text.indexOf("Checks: 1 of " + N) > -1, "both counts are restored on reload: " + s3.text);
      eq(errors, [], "no errors on the sidebar counts");
      await context.close();
    }
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"steps"}' });
      const top = () => page.evaluate(() => { var n = document.querySelector(".lesson-next"); return n ? n.getBoundingClientRect().top : null; });
      const t0 = await top();
      check(t0 !== null, "the Continue card is on the opening step");
      await page.click(".puzzle .guess-chip");
      const t1 = await top();
      check(t0 !== null && t1 !== null && Math.abs(t1 - t0) <= 1, "picking a guess does not move the Continue card (" + t0 + " -> " + t1 + ")");
      eq(errors, [], "no errors on the opening puzzle");
      await context.close();
    }
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' }, { width: 390 });
      const g = await page.evaluate(() => {
        var ex = Array.prototype.filter.call(document.querySelectorAll("#practice .ex[data-kind='text']"), function (e) { return e.querySelector(".ex-show"); })[0];
        var r = function (el) { var b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        return { input: r(ex.querySelector(".ex-form > input")), check: r(ex.querySelector(".ex-form .btn:not(.ghost)")), show: r(ex.querySelector(".ex-show")) };
      });
      check(g.show.t >= g.input.b - 0.5, "on a phone, Show solution sits below the answer box");
      check(g.show.l > g.check.r, "on a phone, Show solution is beside Check, not under the box's left half (" + g.show.l + " > " + g.check.r + ")");
      eq(errors, [], "no errors on the phone row");
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
      check(!/★/.test(st.text), "no star characters left for the medal or the missions");
      check(await page.$(".banner-meta svg.icon-star") !== null, "the banner's missions stat draws the star icon");
      eq(errors, [], "no errors in the toast and hearts run");
      await context.close();
    }

    /* ------------------- card U-2: rewards land top-right, the XP pill flies, the level card says what is next */
    {
      const seed = { "bm.lesson.v1": '{"mode":"page"}', "bm.activity.v1": JSON.stringify({ days: { [dayAgo(0)]: 20 }, goal: 500 }), "bm.run.v1": JSON.stringify({ seen: { level: 1, ach: 1 } }) };
      for (const w of [1280, 400]) {
        const { context, page, errors } = await open(browser, CH05, seed, { width: w });
        await answer(page, '#practice .ex[data-key="e1"]', true);
        await wait(200);
        const g = await page.evaluate(() => {
          var t = document.querySelector(".toasts").getBoundingClientRect(), bar = document.querySelector(".topbar").getBoundingClientRect();
          return { top: t.top, right: t.right, left: t.left, barBottom: bar.bottom, vw: window.innerWidth,
            n: document.querySelectorAll(".toast:not([data-out])").length, first: document.querySelector(".toast").textContent };
        });
        check(g.top >= g.barBottom - 1, w + "px: the toast stack starts under the top bar (" + g.top + " vs " + g.barBottom + ")");
        eq(g.n, 1, w + "px: one toast after a plain right answer (the level card; the pill and chip carry the XP)");
        check(!/\+\d+ XP/.test(g.first) && /Level/.test(g.first), w + "px: no +N XP card when a pill flew and there is no combo or goal (" + g.first + ")");
        if (w === 1280) check(g.vw - g.right <= 24 && g.vw - g.right >= 0, "1280px: the stack's right edge is within 24px of the viewport (" + (g.vw - g.right) + ")");
        else check(g.left <= 17 && g.vw - g.right <= 17, "400px: the stack spans the width under the HUD (" + g.left + ", " + (g.vw - g.right) + ")");
        if (w === 1280) {
          const lv = await page.evaluate(() => { var c = document.querySelector(".toast.level"); return c && { kicker: c.querySelector(".toast-kicker").textContent, rank: c.querySelector("b").textContent, text: c.querySelector(".toast-text").textContent }; });
          check(lv && lv.kicker === "Level 2" && lv.rank.length > 0 && /^\d+ XP to level 3\.$/.test(lv.text), "the level card holds the kicker, the rank and what is next (" + JSON.stringify(lv) + ")");
        }
        eq(errors, [], "no errors in the U-2 toast run at " + w);
        await context.close();
      }
      /* the pill flies with motion, and never exists without it */
      {
        const { context, page, errors } = await open(browser, CH05, seed);
        await page.evaluate(() => {
          window.__fly = 0; window.__flash = 0;
          setInterval(function () {
            if (document.querySelector(".xp-fly")) window.__fly++;
            if (document.querySelector(".hud-xpbar[data-flash]")) window.__flash++;
          }, 10);
        });
        await answer(page, '#practice .ex[data-key="e1"]', true);
        await wait(100);
        check(await page.evaluate(() => window.__fly > 0), "an .xp-fly is on screen within 100 ms of a right answer");
        await wait(1400);
        eq(await page.evaluate(() => Array.prototype.filter.call(document.querySelectorAll(".toast"), function (t) { return /\+\d+ XP/.test(t.textContent); }).length), 0, "a plain flown answer makes no +N XP card");
        const e = await page.evaluate(() => ({ fly: document.querySelectorAll(".xp-fly").length, flash: window.__flash }));
        eq(e.fly, 0, "the pill is gone within 1.2 s");
        check(e.flash > 0, "the HUD XP bar flashed when it landed");
        eq(errors, [], "no errors in the XP flight run");
        await context.close();
      }
      {
        const { context, page, errors } = await open(browser, CH05, Object.assign({}, seed, { "bm.prefs.v1": JSON.stringify({ motion: "reduce" }) }));
        check(await page.evaluate(() => document.documentElement.getAttribute("data-motion") === "reduce"), "the seeded preference sets html[data-motion=reduce]");
        await page.evaluate(() => {
          window.__fly = 0;
          new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.classList && n.classList.contains("xp-fly")) window.__fly++; }); }); })
            .observe(document.body, { childList: true, subtree: true });
        });
        await answer(page, '#practice .ex[data-key="e1"]', true);
        await wait(100);
        const r = await page.evaluate(() => ({ fly: window.__fly, anims: document.getAnimations().length }));
        eq(r, { fly: 0, anims: 0 }, "under reduced motion no pill is made and nothing animates");
        check(await page.evaluate(() => Array.prototype.some.call(document.querySelectorAll(".toast"), function (t) { return /\+\d+ XP/.test(t.textContent); })), "under reduced motion the +N XP card still appears after a plain answer");
        eq(errors, [], "no errors in the reduced-motion run");
        await context.close();
      }
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

    /* ------------------------------ U-12: the progress page's shape */
    {
      const { context, page, errors } = await open(browser, "progress.html", {});
      await wait(200);
      const f = await page.evaluate(() => ({
        labels: Array.from(document.querySelectorAll("[data-progress] > .stats:first-of-type .stat-label")).map((e) => e.textContent),
        next: Array.from(document.querySelectorAll(".next-list a")).map((a) => a.textContent),
        head: (document.querySelector(".next-list h3") || {}).textContent,
        hrefs: Array.from(document.querySelectorAll(".next-list a")).map((a) => a.getAttribute("href")),
        chips: document.querySelectorAll(".goal-pick .chip").length,
        chart: !!document.querySelector(".daychart"),
        note: (document.querySelector(".chart-note") || {}).textContent,
        ach: document.querySelectorAll("#achievements .ach").length,
        groups: Array.from(document.querySelectorAll("#achievements h3.ach-group")).map((h) => h.textContent)
      }));
      eq(f.labels.slice(0, 3), ["Level", "Streak", "Today"], "fresh: the tiles lead with Level, Streak, Today");
      eq([f.head, f.next], ["Your next steps", ["Start with Chapter 1"]], "fresh: the empty chart is the next steps, without the check (the invitation panel has it)");
      check(f.hrefs.length === 1 && f.hrefs[0].endsWith("parts/1-algebra/01-numbers.html"), "fresh: the next steps link to Chapter 1");
      eq([f.chips, f.chart, f.note], [4, false, "Your 14-day chart appears once you have studied on two days."], "fresh: goal chips and the note stay, the chart is gone");
      eq(f.ach, 28, "fresh: 28 achievements");
      check(!f.groups.includes("Closest to done") && !f.groups.includes("Other"), "fresh: no Closest to done and no Other group");
      eq(f.groups, ["Habits and streaks", "First try and accuracy", "Careful study", "Arena", "Review and repair", "Completion"], "fresh: the group headings in order");
      eq(errors, [], "no errors on a fresh progress page");
      await context.close();

      const recs = {};
      for (let i = 1; i <= 20; i++) recs["e" + i] = { tries: 1, solved: 1000 + i, first: 1, section: "angles" };
      const b = await open(browser, "progress.html", {
        "bm.attempts.v1": JSON.stringify({ ch05: recs }),
        "bm.activity.v1": JSON.stringify({ days: { [dayAgo(0)]: 20, [dayAgo(2)]: 20, [dayAgo(4)]: 20 } })
      });
      await wait(200);
      const g = await b.page.evaluate(() => ({
        chart: !!document.querySelector(".daychart"), next: !!document.querySelector(".next-list"),
        chips: document.querySelectorAll(".goal-pick .chip").length,
        ach: document.querySelectorAll("#achievements .ach").length,
        groups: Array.from(document.querySelectorAll("#achievements h3.ach-group")).map((h) => h.textContent),
        near: Array.from(document.querySelectorAll("#achievements ul.achievements:first-of-type li.ach")).map((l) => l.getAttribute("data-id")),
        steady: document.querySelectorAll('#achievements [data-id="steady-hand"]').length,
        levels: Array.from(document.querySelectorAll("#achievements, #achievements h2, #achievements h3")).map((e) => e.tagName)
      }));
      eq([g.chart, g.next, g.chips], [true, false, 4], "active on 3 days: the chart is back, the next steps are gone");
      eq(g.ach, 28, "seeded: still 28 achievements");
      eq(g.groups, ["Closest to done", "Habits and streaks", "First try and accuracy", "Careful study", "Arena", "Review and repair", "Completion"], "seeded: Closest to done first, then the groups in order");
      eq(g.near[0], "steady-hand", "seeded: steady-hand leads Nearest");
      check(g.near.length >= 1 && g.near.length <= 3, "seeded: Nearest lists at most three");
      eq(g.steady, 1, "seeded: steady-hand appears once");
      eq(b.errors, [], "no errors on a seeded progress page");
      await b.context.close();
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
        "bm.game.v1": JSON.stringify({ sec: { "ch05#parallels": { n: 1, ok: 1 }, "ch05#angles": { n: 1, ok: 1 } } })
      };
      const b = await open(browser, "parts/1-algebra/03-real-numbers.html", weakSeed);
      /* weak is the event log's band: three missed Arena answers on parallels (box 1, placed today) and a right one on angles */
      await b.page.evaluate(([d]) => {
        var miss = { section: "ch05#parallels", g: "g0", first: false, retry: false, hf: false };
        window.BMEvents.fromRun({ day: d, mode: "standard", answers: [miss, miss, miss, { section: "ch05#angles", g: "g0", first: true, retry: false, hf: false }] });
      }, [today]);
      await b.page.reload();
      await b.page.waitForFunction(() => document.readyState === "complete");
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

    /* ------------- the hub's list (P14c): each chapter on the contents page shows what is due and its mastery */
    {
      const ev = (sec, n, right, day) => ({ day, mode: "standard", answers: Array.from({ length: n }, () => ({ section: sec, g: "g0", first: right, retry: false, hf: false })) });
      const seedEvents = (page, runs) => page.evaluate((runs) => { runs.forEach((r) => window.BMEvents.fromRun(r)); }, runs);
      const hubOf = (page, id) => page.evaluate((id) => {
        var p = document.querySelectorAll('li.stop[data-chapter="' + id + '"] p.stop-hub');
        return { n: p.length, text: p[0] ? p[0].textContent.replace(/\s+/g, " ").trim() : "",
          links: p[0] ? Array.from(p[0].querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href"), !a.closest("a.stop-link")]) : [] };
      }, id);
      const hubs = await open(browser, "index.html", {});
      eq([await hubOf(hubs.page, "ch05")].map((h) => [h.n, h.text]), [[0, ""]], "hub list: with no evidence a chapter has no hub line at all");
      /* a section placed in the Arena four days ago and solved on its page is due; one weak, one strong */
      await hubs.page.evaluate((a) => localStorage.setItem("bm.attempts.v1", a), JSON.stringify({ ch02: {
        e1: { tries: 1, solved: 1, first: 1, section: "one-unknown" }, e2: { tries: 1, solved: 2, first: 1, section: "one-unknown" } } }));
      await seedEvents(hubs.page, [ev("ch02#one-unknown", 1, true, dayAgo(4)), ev("ch05#parallels", 3, false, dayAgo(0)), ev("ch05#angles", 8, true, dayAgo(0))]);
      await hubs.page.waitForFunction(() => /weak/.test((document.querySelector('li.stop[data-chapter="ch05"] p.stop-hub') || {}).textContent || ""));
      const h5 = await hubOf(hubs.page, "ch05"), h2 = await hubOf(hubs.page, "ch02");
      check(/^Mastery: (\d+ strong · )?(\d+ building · )?1 weak$/.test(h5.text) && /1 strong/.test(h5.text), "hub list: ch05 reads its mastery counts: " + h5.text);
      check(/^Due for a check: §2\.\d+ One unknown, ?.*Review in the Arena/.test(h2.text) || /^Due for a check: §2\.\d+ One unknown · Review in the Arena/.test(h2.text), "hub list: ch02 names its due section: " + h2.text);
      const due2 = h2.links.find((l) => /One unknown/.test(l[0]));
      eq(due2 && due2[1], "parts/1-algebra/02-linear-equations.html#one-unknown", "and the due section's link goes to the section");
      eq(h2.links.some((l) => l[1] === "arena.html?mode=review"), true, "with one Review in the Arena link");
      check(h2.links.length > 0 && h2.links.every((l) => l[2]), "no hub link is inside a.stop-link");
      /* a burst of events ends in a redraw that reads the final state (the redraw is debounced) */
      await seedEvents(hubs.page, [1, 2, 3, 4].map(() => ev("ch06#isometries", 8, true, dayAgo(0))));
      await hubs.page.waitForTimeout(300);
      const band6 = await hubs.page.evaluate(() => window.BMEvents.bands()["ch06#isometries"]);
      eq([band6 === "strong" || band6 === "building", (await hubOf(hubs.page, "ch06")).text], [true, "Mastery: 1 " + band6],
        "hub list: after a burst of four runs the line reads the final state");
      await hubs.page.evaluate(() => { window.BMHubList.redraw(document); window.BMHubList.redraw(document); });
      eq(await hubs.page.evaluate(() => Array.from(document.querySelectorAll("li.stop")).every((li) => li.querySelectorAll("p.stop-hub").length <= 1)), true,
        "hub list: redecorating twice leaves at most one p.stop-hub per chapter");
      await hubs.page.click('li.stop[data-chapter="ch02"] p.stop-hub a[href$="#one-unknown"]');
      await hubs.page.waitForFunction(() => /02-linear-equations/.test(location.pathname));
      eq(hubs.errors, [], "no errors with the hub list");
      await hubs.context.close();
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
      check(await page.$(E1 + " .ex-feedback svg.icon-tick") !== null, "a correct verdict carries the tick icon, not a fallback glyph");
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
        ["retry", 2, 0, true, true, "", ["no", "form", "Right values. Write it as (6, -2). That cost a heart."]],
        "form in the Arena is a miss (heart, streak), and its reason stands in for the miss text");
      await a.page.reload();
      await a.page.waitForFunction(() => document.readyState === "complete");
      s = await ar();
      eq([s.phase, s.verdict && s.verdict[2]], ["retry", "Right values. Write it as (6, -2). That cost a heart."], "the reason survives a reload with the run");
      await a.page.evaluate(INJECT, VERDICTS);
      await type("FORM");
      s = await ar();
      eq([s.phase, s.hearts, s.verdict], ["done", 2, ["no", "form", "Right values. Write it as (6, -2). Here is how it goes."]], "form on the retry: the second miss, with its reason");
      await a.page.click('.arena-feedback [data-act="next"]');
      await type("987654321");
      s = await ar();
      eq([s.phase, s.hearts, s.verdict], ["retry", 1, ["no", null, "Not right, and that cost a heart."]], "a wrong answer still reads as before");
      check(await a.page.$(".arena-feedback .arena-verdict[data-kind=\"no\"] svg.icon-cross") !== null, "the miss verdict carries the cross icon");
      eq(a.errors, [], "no errors through the injected verdicts in the Arena");
      await a.context.close();
    }

    /* ------------- 11. real verdicts: the typed grader on 01-numbers and in the Arena */
    {
      const CH01 = "parts/1-algebra/01-numbers.html";
      const { context, page, errors } = await open(browser, CH01, { "bm.lesson.v1": '{"mode":"page"}' });
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
      const attempts = () => page.evaluate(() => JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}").ch01 || {});
      /* t7 is the number key 2/3 with no tol; t5 has no type (exact) and the key 1; k3 is the blanks [8, 3, 11] */
      const T7 = ".ex#t7", K3 = ".ex#k3";
      eq(await page.$eval(T7, (e) => [e.getAttribute("data-type"), e.getAttribute("data-answer"), e.getAttribute("data-tol")]), ["number", "2/3", null], "t7 is the number key 2/3 with no tol");
      await typed(T7, "0.667");
      let c = await card(T7);
      eq([c.kind, c.text, c.state, (await attempts()).t7], ["form", "That is rounded. Give the exact value.", null, undefined], "0.667 for 2/3 is form/rounded, at no cost");
      await typed(T7, "1-1/2");
      c = await card(T7);
      eq([c.kind, c.text, c.state], ["nudge", "Type a mixed number with a space, like 2 1/3, or as a fraction, like 7/3.", null], "1-1/2 is unread/ambiguous-mixed, a retype nudge worded by the owner's Q4(a)");
      await typed(T7, "1 1/2");
      c = await card(T7);
      check(c.state === "wrong" && /Not right\./.test(c.text) && /We read that as 3\/2\./.test(c.text) && (await attempts()).t7.tries === 1, "1 1/2 is wrong (Q4(a): it is 3/2), with the reading line, as the first try: " + c.text);
      await typed(T7, "4/6");
      c = await card(T7);
      check(c.state === "correct" && /Correct\.\s*4\/6 is 2\/3 in lowest terms\./.test(c.text), "4/6 is right with the lowest-terms note (Q3(a)): " + c.text);
      /* blanks: the reading line names the blank's own reading; an unread blank leaves the last marks */
      await fill(K3, ["1 1/2", "3", "11"]);
      c = await card(K3);
      eq([c.state, c.blanks, /We read that as 3\/2\./.test(c.text)], ["wrong", [["false", null, "true"], ["true", null, null], ["true", null, null]], true], "a mixed number in a blank: the card is wrong, that blank marked, and its reading shown");
      await fill(K3, ["8", "x=3", "11"]);
      c = await card(K3);
      eq([c.kind, c.text, c.state, c.blanks], ["nudge", "Blank 2: Type just the number.", "wrong", [["false", null, "true"], ["true", null, null], ["true", null, null]]], "an unread blank stops the check, named, and the last check's marks stay as they were");
      await fill(K3, ["8", "3", "11"]);
      c = await card(K3);
      eq([c.state, c.blanks], ["correct", [["true", null, null], ["true", null, null], ["true", null, null]]], "all right: the marks reset");
      eq(errors, [], "no errors through the real verdicts on a page");
      await context.close();

      /* exact cards on 08-coordinates: t1 is the scalar key 4|iv, e3 the point key (2,-5)|2,-5; neither has a type */
      const x = await open(browser, "parts/3-coordinates/08-coordinates.html", { "bm.lesson.v1": '{"mode":"page"}' });
      const xcard = (sel) => x.page.evaluate((sel) => {
        var ex = document.querySelector(sel), fb = ex.querySelector(".ex-feedback"), v = fb.querySelector(".ex-verdict");
        return { state: ex.getAttribute("data-state"), kind: v && v.getAttribute("data-kind"), text: fb.getAttribute("data-show") === "true" ? fb.textContent.replace(/\s+/g, " ").trim() : "" };
      }, sel);
      const xtyped = async (sel, value) => { await x.page.fill(sel + " .ex-form input[type=text]", value); await x.page.click(sel + " .ex-form .btn:not(.ghost)"); };
      const XT1 = ".ex#t1", XE3 = "#practice .ex#e3";
      eq(await x.page.$eval(XT1, (e) => [e.getAttribute("data-type"), e.getAttribute("data-answer")]), [null, "4|iv"], "t1 is the exact key 4|iv");
      eq(await x.page.$eval(XE3, (e) => [e.getAttribute("data-type"), e.getAttribute("data-answer")]), [null, "(2,-5)|2,-5"], "e3 is the exact key (2,-5)|2,-5");
      await xtyped(XT1, "x=3");
      c = await xcard(XT1);
      check(c.state === "wrong" && /Not right\./.test(c.text) && !/We read that as/.test(c.text), "a wrong x=3 on an exact card shows no reading line: " + c.text);
      await xtyped(XT1, "8/2");
      c = await xcard(XT1);
      check(c.state === "wrong" && !/We read that as/.test(c.text), "a scalar exact key stays text: 8/2 is wrong for 4|iv, with no reading line: " + c.text);
      await xtyped(XE3, "y=-5, x=2");
      c = await xcard(XE3);
      check(c.kind === "form" && c.state === null && /^Right values\. Write it as \(2, -5\)\.\s*We read that as \(2, -5\)\.$/.test(c.text), "a labeled point for a point key is form/notation, with its reading, at no cost: " + c.text);
      await xtyped(XE3, "(2.0, -5)");
      c = await xcard(XE3);
      check(c.state === "correct" && /Correct\./.test(c.text), "the point by value is right: " + c.text);
      eq(x.errors, [], "no errors through the real verdicts on the exact cards");
      await x.context.close();

      /* the Arena, on frac-sum problems set into the run (BMArena.state() is the live run) */
      const a = await open(browser, "arena.html", {});
      await a.page.evaluate(() => {
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
      /* three frac-sum seeds: any two, and one whose value rounded at 3 places is form/rounded in Node */
      const { judge, specOf } = require("../../src/core/answer/check.ts");
      const { readNumber } = require("../../src/core/answer/read.ts");
      const { roundTo } = require("../../src/core/answer/rational.ts");
      const probs = await a.page.evaluate(() => { var out = []; for (var s = 1; s <= 80; s++) { var p = window.BMGen.make("frac-sum", s); out.push({ s: s, answer: p.answer, type: p.type }); } return out; });
      const decimal3 = (key) => { const r = readNumber(key, { q4: "a" }); if (!r.ok) return null; const q = roundTo(r.value, 3); const n = (q.n < 0n ? -q.n : q.n).toString().padStart(4, "0"); return (q.n < 0n ? "-" : "") + n.slice(0, -3) + "." + n.slice(-3); };
      const numberOf = (p) => (p.type === "number" || p.type === "fraction") && readNumber(p.answer.split("|")[0], { q4: "a" }).ok;
      const plain = probs.filter(numberOf), rounded = probs.find((p) => numberOf(p) && judge(decimal3(p.answer.split("|")[0]), specOf(p)).kind === "form");
      check(plain.length >= 2 && !!rounded, "frac-sum gives two number problems and one whose 3-place decimal is form/rounded (" + plain.length + ", " + (rounded && rounded.s) + ")");
      const picked = [plain[0], plain[1], rounded];
      const ar = () => a.page.evaluate(() => {
        var r = window.BMArena.state(), q = r.qs[r.i], p = window.BMGen.make(q.g, q.s), v = document.querySelector(".arena-feedback .arena-verdict"), n = document.querySelector(".arena-nudge");
        return { i: r.i, phase: r.cur.phase, el: r.cur.el, hearts: r.hearts, streak: r.streak, timed: q.timed, hf: q.hf, g: q.g, s: q.s, key: String(p.answer).split("|")[0], type: p.type, ans: r.ans[r.i] || null,
          verdict: v && [v.getAttribute("data-kind"), v.getAttribute("data-verdict"), v.textContent.trim()], nudge: n && !n.hidden ? n.textContent : "" };
      });
      const type = async (value) => { await a.page.fill("#arena-answer", value); await a.page.click('.arena-run [data-act="check"]'); };
      const next = async () => { await a.page.click('.arena-feedback [data-act="next"]'); };
      await a.page.click('[data-act="start"][data-mode="standard"]');
      /* the next three questions become the picked frac-sum problems, timed, with hearts at stake */
      await a.page.evaluate((seeds) => {
        var r = window.BMArena.state();
        seeds.forEach(function (s, j) { var q = r.qs[r.i + 1 + j]; q.g = "frac-sum"; q.s = s; q.timed = true; q.hf = false; q.par = 60; });
      }, picked.map((p) => p.s));
      await a.page.click('.arena-run [data-act="pass"]');
      if ((await ar()).phase === "retry") await a.page.click('.arena-run [data-act="pass"]');
      await next();
      let s = await ar();
      eq([s.g, s.s, s.type, s.timed, s.hf, s.hearts, s.phase], ["frac-sum", picked[0].s, "fraction", true, false, 3, "ask"], "the first picked problem is up, timed, hearts at stake");
      const k1 = s.key;
      await type(k1 + "º");
      await wait(2300);
      s = await ar();
      eq([s.nudge, s.phase, s.hearts, s.ans, s.el > 0], ["Type the number without units.", "ask", 3, null, true], "the key with º is unread/units: a nudge, no heart, nothing recorded, the clock runs on");
      await type(k1 + "˚");
      s = await ar();
      eq([s.nudge, s.phase, s.hearts], ["Type the number without units.", "ask", 3], "and with ˚ too");
      await type(k1 + " deg");
      s = await ar();
      eq([s.phase, s.hearts, s.nudge, s.ans && s.ans.first, s.verdict && s.verdict[0]], ["done", 3, "", true, "ok"], "the key with \" deg\" is still right after clean()");
      await next();
      s = await ar();
      const k2 = s.key;
      await type(k2 + "°");
      s = await ar();
      eq([s.g, s.s, s.phase, s.hearts, s.verdict && s.verdict[0]], ["frac-sum", picked[1].s, "done", 3, "ok"], "the key with ° is right after clean()");
      await next();
      s = await ar();
      eq([s.g, s.s, s.phase, s.streak], ["frac-sum", picked[2].s, "ask", 2], "the third picked problem is up, with a streak of 2");
      await type(decimal3(s.key));
      s = await ar();
      eq([s.phase, s.hearts, s.streak, s.ans && s.ans.miss, s.ans && s.ans.lost, s.nudge, s.verdict],
        ["retry", 2, 0, true, true, "", ["no", "form", "That is rounded. Give the exact value. That cost a heart."]],
        "a rounded decimal for a fraction key is form/rounded: a miss in the Arena (Q1(c)), heart and streak, with its reason");
      await type(s.key);
      s = await ar();
      eq([s.phase, s.hearts, s.verdict && s.verdict[0]], ["done", 2, "ok"], "the exact fraction on the retry is right");
      eq(a.errors, [], "no errors through the real verdicts in the Arena");
      await a.context.close();
    }

    /* ----- the placement check's seed (D-7): BMGame.seedRecall, §6 of the design */
    {
      const U = "ch02#one-unknown", A = "ch05#angles", P = "ch05#parallels";
      const two = (ch, section, at) => ({ [ch]: { e1: { tries: 1, solved: at || 1, first: 1, section }, e2: { tries: 1, solved: (at || 1) + 1, first: 1, section } } });
      const yest = dayAgo(1);
      const lastTile = (page) => page.evaluate(() => {
        var t = Array.from(document.querySelectorAll("#recall .stat")).find((x) => /Last practiced/.test(x.textContent));
        return t && [t.querySelector(".stat-value").textContent, t.querySelector(".stat-sub").textContent];
      });

      /* a seeded, never-worked section stays out of deck() and does not set "Last practiced" */
      {
        const a = await open(browser, "progress.html", { "bm.attempts.v1": JSON.stringify(two("ch05", "angles")) });   /* solid on its page, never placed */
        const wrote = await a.page.evaluate(([u, d]) => window.BMGame.seedRecall({ [u]: { box: 1, last: d } }), [U, yest]);
        eq(wrote, [U], "seedRecall returns the ids it wrote");
        eq(await a.page.evaluate(([u, d]) => [JSON.parse(localStorage.getItem("bm.game.v1")).sec[u], window.BMEvents.schedule(u, d)], [U, dayAgo(0)]).then((x) => [x[0], x[1].box, x[1].last]), [undefined, 1, yest], "and writes the seed to the event log (box and last), nothing into bm.game.v1.sec");
        eq(await a.page.evaluate(() => window.BMGame.deck().map((d) => d.id)), [A], "a seeded section stays out of deck()");
        eq(await a.page.evaluate((u) => window.BMGame.sectionStatus(u), U), "new", "its status is still new");
        await a.page.reload();
        await a.page.waitForFunction(() => document.readyState === "complete");
        eq(await lastTile(a.page), ["—", "no Arena run yet"], "a seed does not set \"Last practiced\" on the progress page");
        check(!/Sign in|across devices/.test(await a.page.$eval("[data-progress]", (e) => e.textContent)), "the progress page has no \"Sign in\" sentence when signed out");
        eq(a.errors, [], "no errors with a seed");
        await a.context.close();
      }

      /* "Last practiced" still reads a section with Arena answers (n > 0), and shows that day */
      {
        const a = await open(browser, "progress.html", {
          "bm.attempts.v1": JSON.stringify(two("ch05", "angles")),
          "bm.game.v1": JSON.stringify({ sec: { [A]: { n: 2, ok: 2 } } })
        });
        await a.page.evaluate(([x, y, dx, dy]) => window.BMEvents.seed({ [x]: { box: 1, last: dx }, [y]: { box: 1, last: dy } }), [A, U, dayAgo(10), yest]);
        await a.page.reload();
        await a.page.waitForFunction(() => document.readyState === "complete");
        const want = await a.page.evaluate((d) => { var m = d.split("-"); return new Date(+m[0], +m[1] - 1, +m[2]).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }, dayAgo(10));
        eq(await lastTile(a.page), [want, "in the Arena"], "a section with Arena answers sets \"Last practiced\" to its day, not the seed's");
        await a.context.close();
      }

      /* both guards at write time; unknown fields kept; bad input dropped */
      {
        const a = await open(browser, "progress.html", {
          "bm.attempts.v1": JSON.stringify(two("ch05", "parallels")),
          "bm.game.v1": JSON.stringify({ v: 2, sec: { [A]: { n: 1, ok: 1 }, "ch01#addition": { keep: "me", fix: 7 } } })
        });
        await a.page.evaluate(([x, d]) => window.BMEvents.seed({ [x]: { box: 2, last: d } }), [A, dayAgo(5)]);
        const patch = {
          [A]: { n: 9, box: 0, last: yest }, [P]: { box: 1, last: yest }, [U]: { box: 1, last: yest, n: 5, ok: 5, extra: 1 },
          "ch01#addition": { box: 1, last: yest, keep: "me", fix: 7 }, "ch01#integers": { box: 2, last: yest },
          "ch01#bad": { box: 1, last: "tomorrow" }, "ch01#bad2": { box: "1", last: yest }
        };
        const wrote = await a.page.evaluate((p) => window.BMGame.seedRecall(p), patch);
        eq(wrote.slice().sort(), ["ch01#addition", U], "a placed section and a section with an attempt row are skipped; a box other than 0 or 1 and a bad day are dropped");
        const g = await a.page.evaluate(() => JSON.parse(localStorage.getItem("bm.game.v1")));
        eq(g.sec[A], { n: 1, ok: 1 }, "the placed section is untouched");
        check(g.sec[P] === undefined, "the section with an attempt row is not seeded");
        const sch = (id) => a.page.evaluate(([i, d]) => { var s = window.BMEvents.schedule(i, d); return [s.box, s.last]; }, [id, dayAgo(0)]);
        eq([g.sec[U], await sch(U)], [undefined, [1, yest]], "the seed is a log entry: n, ok and other fields in the patch are not written, and bm.game.v1.sec gets no record");
        eq([JSON.stringify(g.sec["ch01#addition"], Object.keys(g.sec["ch01#addition"]).sort()), await sch("ch01#addition")], [JSON.stringify({ fix: 7, keep: "me" }), [1, yest]], "an existing unplaced record keeps its fields, and gets its box and day in the log");
        eq(g.v, 2, "and so does the rest of the game record");
        const bad = await a.page.evaluate(() => [null, "x", 3, [], undefined, JSON.parse('{"__proto__":{"box":1,"last":"2026-01-01"}}')].map((p) => window.BMGame.seedRecall(p)));
        eq(bad, [[], [], [], [], [], []], "a patch that is not an object, or only __proto__, writes nothing");
        eq(await a.page.evaluate(() => ({}).box), undefined, "and pollutes nothing");
        eq(await a.page.evaluate((p) => window.BMGame.seedRecall(p), patch), [], "a second seed writes nothing: what the first wrote is placed");
        /* the guards read the state at the moment of writing, not when the patch was made */
        await a.page.evaluate(() => {
          window.BMEvents.seed({ "ch01#integers": { box: 3, last: "2026-01-01" } });
        });
        eq(await a.page.evaluate(() => window.BMGame.seedRecall({ "ch01#integers": { box: 0, last: "2026-02-02" } })), [], "a section placed since the patch was made is skipped");
        eq((await sch("ch01#integers"))[0], 3, "and keeps its box");
        eq(a.errors, [], "no errors seeding");
        await a.context.close();
      }

      /* the day must be a real one before today; the ref must be in the curriculum; a seed that
         writes nothing emits nothing, and one that writes emits the change the account pushes */
      {
        const a = await open(browser, "progress.html", {});
        await a.page.evaluate(() => { window.__ev = 0; window.BMStore.on((c) => { if (c.type === "event") window.__ev++; }); });
        const ev = () => a.page.evaluate(() => window.__ev);
        const seed = (p) => a.page.evaluate((p) => window.BMGame.seedRecall(p), p);
        const today = dayAgo(0), future = (() => { const d = new Date(); d.setDate(d.getDate() + 3); const t = (x) => (x < 10 ? "0" : "") + x; return d.getFullYear() + "-" + t(d.getMonth() + 1) + "-" + t(d.getDate()); })();
        const none = { "ch01#addition": { box: 1, last: today }, "ch01#integers": { box: 1, last: future }, "ch02#one-unknown": { box: 1, last: "2026-13-45" },
          "ch05#angles": { box: 0, last: "yesterday" }, "x#1": { box: 1, last: yest }, constructor: { box: 1, last: yest }, "ch01#nope": { box: 1, last: yest }, "ch01": { box: 1, last: yest } };
        eq(await seed(none), [], "today, a future day, an impossible date, a non-date, an unknown ref and a bare name are not written");
        eq([await ev(), await a.page.evaluate(() => localStorage.getItem("bm.events.v1"))], [0, null], "and nothing is stored or emitted for them");
        eq(await seed({ "ch01#addition": { box: 1, last: yest } }), ["ch01#addition"], "a real earlier day on a known ref is written");
        eq(await ev(), 1, "and it announces the log change that drives the account push");
        eq(await seed({ "ch01#addition": { box: 1, last: yest } }), [], "the same seed again writes nothing");
        eq(await ev(), 1, "and emits nothing");
        await a.context.close();
      }

      /* signed out, the page says where its data comes from, and does not invite sign-up */
      {
        const a = await open(browser, "progress.html", {});
        check(await a.page.evaluate(() => window.BMAccount && window.BMAccount.configured), "(the build has accounts configured)");
        const t = await a.page.$eval("[data-progress]", (e) => e.textContent);
        check(t.indexOf("This page is built from what this browser has saved.") > -1 && !/Sign in/.test(t), "signed out, the progress page says it is built from what this browser has saved, with no sign-in line");
        await a.context.close();
      }

      /* worked on its page, never placed: not seeded, still due now, 3 XP on its first Arena answer */
      {
        const a = await open(browser, "progress.html", { "bm.attempts.v1": JSON.stringify(two("ch02", "one-unknown")) });
        eq(await a.page.evaluate((p) => window.BMGame.seedRecall(p), { [U]: { box: 1, last: yest } }), [], "a section worked on its page is not seeded");
        const d = await a.page.evaluate((u) => window.BMGame.deck().filter((x) => x.id === u).map((x) => [x.status, x.due, x.box, x.last]), U);
        eq(d, [["solid", true, 0, null]], "it is solid, due now, in box 0 and never placed");
        const xp = await a.page.evaluate((u) => window.BMGame.recordRun({ answers: [{ section: u, first: true }], mode: "standard" }).parts.answers, U);
        eq(xp, 3, "its first Arena answer pays 3 XP, the due bonus");
        await a.context.close();
      }

      /* §6.3: a box 0 seed that page work then makes solid today is due for a check today, and
         sorts ahead of a never-placed due section */
      {
        const a = await open(browser, "progress.html", {});
        eq(await a.page.evaluate(([u, d]) => window.BMGame.seedRecall({ [u]: { box: 0, last: d } }), [U, yest]), [U], "the box 0 seed is written on a section never worked");
        const solved = Date.now();
        await a.page.evaluate(([ch2, ch5]) => {
          localStorage.setItem("bm.attempts.v1", JSON.stringify(Object.assign({}, ch2, ch5)));
        }, [two("ch02", "one-unknown", solved), two("ch05", "angles", solved - 864e5 * 3)]);
        await a.page.reload();
        await a.page.waitForFunction(() => document.readyState === "complete");
        const order = await a.page.evaluate(() => {
          var R = window.BMReview.recall, day = window.BMSite.dayKey();
          var rows = window.BMGame.deck().filter((d) => d.due && R.checkDue(d, day));
          return { due: rows.map((r) => r.id).sort(), order: R.byOverdue(rows, day).map((r) => r.id) };
        });
        eq(order.due, [U, A], "the seeded section, solved on its page today, is due for a check today; so is the unseeded one solved three days ago");
        eq(order.order, [U, A], "and it sorts ahead of the never-placed section");
        eq(await a.page.evaluate((a5) => window.BMGame.deck().filter((d) => d.id === a5).map((d) => d.last), A), [null], "(the unseeded section was never placed)");
        await a.context.close();
      }
    }

    /* ------------------------------------------------ 12: the learning log */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}' });
      const log = () => page.evaluate(() => JSON.parse(localStorage.getItem("bm.events.v1") || "{}"));
      const pairs = async () => Object.entries((await log()).ev || {});
      const entries = async () => pairs().then((l) => l.map((e) => e[1]));
      /* an entry is [t, d, src, sec, ref, k, ok, n, r, f] (src/sync/events.ts Payload) */
      const of = async (k) => (await entries()).filter((P) => P[5] === k);
      const keys = await page.evaluate(() => {
        var typed = Array.prototype.filter.call(document.querySelectorAll("#practice .ex"), function (e) {
          return e.getAttribute("data-kind") !== "choice" && e.getAttribute("data-kind") !== "multi" && e.getAttribute("data-kind") !== "blank" &&
            e.querySelector(".ex-form input:not([type=radio]):not([type=checkbox])");
        }).map(function (e) { return { key: e.getAttribute("data-key"), two: e.hasAttribute("data-hint2") }; });
        var two = typed.filter(function (x) { return x.two; })[0], rest = typed.filter(function (x) { return x !== two; });
        return { wrong: rest[0] && rest[0].key, solution: rest[1] && rest[1].key, ladder: two && two.key };
      });
      check(keys.wrong && keys.solution && keys.ladder, "ch05 has three typed exercises for the log check " + JSON.stringify(keys));
      const exSel = (k) => '#practice .ex[data-key="' + k + '"]';

      /* what is typed never reaches the log: the grader reads SECRET-7Q as no answer at all (a
         nudge, nothing marked), so it leaves no entry, and the wrong answer that follows is a
         number (the helper's) */
      await page.fill(exSel(keys.wrong) + " .ex-form input:not([type=radio]):not([type=checkbox])", "SECRET-7Q");
      await page.click(exSel(keys.wrong) + " .ex-form .btn:not(.ghost)");
      eq((await entries()).length, 0, "an unreadable answer leaves no entry");

      /* a wrong then a right check on one exercise */
      await answer(page, exSel(keys.wrong), false);
      await answer(page, exSel(keys.wrong), true);
      const nowMin = await page.evaluate(() => Math.floor(Date.now() / 60000));
      const cs = (await of("c")).filter((P) => P[4] === "ch05/" + keys.wrong).sort((a, b) => a[7] - b[7]);
      eq(cs.map((P) => [P[2], P[6], P[7]]), [["ex", 0, 1], ["ex", 1, 2]], "a wrong then a right check: two c entries, src ex, ok 0 then 1, n 1 then 2");
      check(cs.every((P) => Math.abs(P[0] - nowMin) <= 2 && P[1] === Math.floor(P[0] / 1440)), "their t is the minute they were made and d is its day " + JSON.stringify(cs));

      /* clue 2 */
      await page.click(exSel(keys.ladder) + " .ex-clue-btn");
      await page.click(exSel(keys.ladder) + " .ex-clue-btn");
      check((await of("h")).some((P) => P[4] === "ch05/" + keys.ladder && P[8] === 2), "opening clue 2 writes an h entry with r 2 " + JSON.stringify(await of("h")));

      /* the solution on an untouched exercise, then the right answer */
      await page.click(exSel(keys.solution) + " .ex-form .ex-show");
      check((await of("o")).some((P) => P[4] === "ch05/" + keys.solution), "the solution opened on an untouched exercise writes an o entry " + JSON.stringify(await of("o")));
      await answer(page, exSel(keys.solution), true);
      const after = (await of("c")).filter((P) => P[4] === "ch05/" + keys.solution);
      check(after.length === 1 && after[0][6] === 1 && (after[0][9] & 1) === 1, "answering it right afterwards writes a c entry with f bit 1 set " + JSON.stringify(after));

      /* ids carry the device id */
      const dev = await page.evaluate(() => JSON.parse(localStorage.getItem("bm.device.v1") || "{}").id);
      const all = await pairs();
      /* checkpoints (k z) are written under the shared id 00000000 */
      const own = all.filter((e) => e[1][5] !== "z");
      check(own.length >= 5 && own.every((e) => /^[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{7}$/.test(e[0]) && e[0].slice(0, 8) === dev), "every entry id is device-rand-hash, its first 8 characters the device id " + JSON.stringify([dev, all.map((e) => e[0])]));
      check(all.every((e) => /^[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{7}$/.test(e[0])), "(and checkpoint ids have the same shape)");

      /* what was typed is nowhere in storage */
      check(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("SECRET"), "the typed answer is not in any storage key");

      /* a page-only history schedules nothing */
      eq(await page.evaluate(() => window.BMEvents.scheduleAll(window.BMSite.dayKey())), {}, "page work alone gives no schedule");

      /* a reload keeps the log */
      const ids = all.map((e) => e[0]).sort();
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete");
      eq((await pairs()).map((e) => e[0]).sort(), ids, "a reload keeps every entry");

      /* the outbox has something in it, so the reset below has something to empty */
      await page.evaluate(() => localStorage.setItem("bm.events.out.v1", JSON.stringify({ ids: ["x"] })));

      /* Reset progress (about.html) empties the log and the outbox and redraws the device id */
      await page.goto(url("about.html"));
      await page.waitForFunction(() => document.readyState === "complete");
      await page.click('[data-action="reset-progress"]');
      const gone = await page.evaluate(() => ({
        ev: (JSON.parse(localStorage.getItem("bm.events.v1") || "{}").ev) || {}, out: localStorage.getItem("bm.events.out.v1"),
        id: JSON.parse(localStorage.getItem("bm.device.v1") || "{}").id
      }));
      check(Object.keys(gone.ev).length === 0, "Reset progress empties the learning log " + JSON.stringify(gone.ev));
      check(gone.out === null || Object.keys(JSON.parse(gone.out) || {}).length === 0, "and the outbox " + gone.out);
      check(/^[0-9a-z]{8}$/.test(gone.id || "") && gone.id !== dev, "and the device id is redrawn " + JSON.stringify([dev, gone.id]));
      eq(errors, [], "no errors around the learning log");
      await context.close();
    }
    /* the lesson's step mode: passing an unanswered inline check writes one s entry, once */
    {
      const { context, page, errors } = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"steps"}' });
      for (let i = 0; i < 30; i++) {
        const ready = await page.$eval(".lesson-next", (b) => b.getAttribute("data-ready"));
        if (ready === "false") break;
        await page.click(".lesson-next .btn");
      }
      const waiting = await page.evaluate(() => {
        var shown = window.BMLesson.shown(), out = [];
        window.BMLesson.steps[shown - 1].forEach(function (el) {
          var list = el.matches(".ex[data-inline]") ? [el] : Array.prototype.slice.call(el.querySelectorAll(".ex[data-inline]"));
          list.forEach(function (ex) { if (ex.getAttribute("data-state") !== "correct") out.push(ex.getAttribute("data-key")); });
        });
        return out;
      });
      check(waiting.length > 0, "found a step waiting on an inline check");
      const skips = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("bm.events.v1") || "{}").ev || {}).filter((P) => P[5] === "s"));
      eq((await skips()).length, 0, "no skip entry before advancing");
      await page.click(".lesson-next .btn");
      const first = (await skips()).filter((P) => P[4] === "ch05/" + waiting[0]);
      eq(first.length, 1, "advancing past an unanswered inline check writes one s entry for it");
      eq(first[0].slice(2, 3), ["in"], "its src is in");
      await page.click(".lesson-next .btn");
      eq((await skips()).filter((P) => P[4] === "ch05/" + waiting[0]).length, 1, "advancing again adds no second one for it");
      eq(errors, [], "no errors in step mode's log");
      await context.close();
    }

    /* ------------------------------------------- 13: the finale's reveal */
    {
      /* ch05 solved right first time, ten answers, through to the finale; seq/live record what the page did */
      const finish = async (prefs) => {
        const o = await open(browser, CH05, { "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": JSON.stringify(prefs || {}) });
        await o.page.evaluate(() => {
          window.__seqSeen = false; window.__live = [];
          new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.target.getAttribute && m.target.getAttribute("data-seq")) window.__seqSeen = true; }); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["data-seq"], subtree: true });
          new MutationObserver(function () { var t = document.getElementById("bm-live").textContent; if (t) window.__live.push(t); })
            .observe(document.getElementById("bm-live"), { childList: true, characterData: true, subtree: true });
        });
        for (let i = 1; i <= 10; i++) await answer(o.page, '#practice .ex[data-key="e' + i + '"]', true);
        await o.page.waitForSelector("#practice .encounter-result:not([hidden])");
        return o;
      };
      const snap = (page) => page.evaluate(() => {
        var r = document.querySelector("#practice .encounter-result"), t = r.querySelector(".encounter-result-title");
        var bs = Array.prototype.map.call(r.querySelectorAll(".stat > b"), function (b) {
          var c = b.cloneNode(true);
          Array.prototype.forEach.call(c.querySelectorAll(".bm-count"), function (o) { o.remove(); });
          return c.textContent;
        });
        return {
          seq: r.getAttribute("data-seq"), skip: !!r.querySelector("[data-skip]"), overlays: r.querySelectorAll(".bm-count").length,
          counting: r.querySelectorAll("[data-counting]").length, styled: r.querySelectorAll("[style]").length,
          afterTitle: !!t && t.nextElementSibling === r.querySelector("[data-skip]"), stats: bs, html: r.innerHTML,
          active: document.activeElement && document.activeElement.className
        };
      });
      const clean = { seq: null, skip: false, overlays: 0, counting: 0, styled: 0 };
      const cleanOf = (x) => ({ seq: x.seq, skip: x.skip, overlays: x.overlays, counting: x.counting, styled: x.styled });

      /* (a) it plays, (b) Skip finalises to the reduced-motion markup, (g) one announcement, (e) once per key */
      let skippedHtml, playStats;
      {
        const { context, page, errors } = await finish();
        const p = await snap(page);
        eq([p.seq, p.skip, p.afterTitle], ["play", true, true], "the finale plays with motion on, and Skip follows the title");
        check(p.overlays > 0 && p.stats.length >= 2 && p.stats.every((t) => /^\d+ of \d+$/.test(t)), "while it plays every stat's text is already its final value " + JSON.stringify(p.stats));
        playStats = p.stats;
        await page.evaluate(() => document.querySelector("#practice .encounter-result [data-skip]").click());
        const a = await snap(page);
        eq(cleanOf(a), clean, "Skip leaves no data-seq, overlay, Skip button, counting mark or inline style");
        eq(a.stats, playStats, "and the stats read the same as they did while it played");
        skippedHtml = a.html;
        await wait(5200);
        const live = await page.evaluate(() => window.__live.filter((t) => /medal/.test(t)));
        eq(live.length, 1, "the finale is announced once: " + JSON.stringify(live));
        const run = await page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1") || "{}"));
        check(run.seen && run.seen.results && Object.keys(run.seen.results).some((k) => /^ch05\//.test(k)), "it is remembered as seen " + JSON.stringify(run.seen));
        /* once per key: the same key asked again does not play */
        const again = await page.evaluate(() => {
          var sec = document.querySelector("#practice .encounter-result"), seen = window.BMStore.read(window.BMStore.keys.run, {}).seen.results || {};
          var key = Object.keys(seen).filter((k) => /^ch05\//.test(k))[0];
          return { key: key, played: window.BMResults.playResults(sec, { key: key }), seq: sec.hasAttribute("data-seq") };
        });
        check(/^ch05\//.test(again.key || ""), "the run store holds the finale's key " + JSON.stringify(again.key));
        eq([again.played, again.seq], [false, false], "asked again with the same key, the reveal does not play");
        eq(errors, [], "no errors playing and skipping the finale");
        await context.close();
      }

      /* the reference: Reduce motion never starts it, and its markup is what Skip leaves */
      {
        const { context, page, errors } = await finish({ motion: "reduce" });
        const r = await snap(page);
        eq(cleanOf(r), clean, "under Reduce motion the finale has no sequence");
        check(!(await page.evaluate(() => window.__seqSeen)), "and data-seq was never set");
        check(r.html === skippedHtml, "a skipped finale is the markup a reduced-motion render holds");
        eq(errors, [], "no errors under Reduce motion");
        await context.close();
      }
      /* Study mode */
      {
        const { context, page } = await finish({ calm: true });
        eq(cleanOf(await snap(page)), clean, "in Study mode the finale has no sequence");
        check(!(await page.evaluate(() => window.__seqSeen)), "and data-seq was never set");
        await context.close();
      }
      /* (c) Escape */
      {
        const { context, page } = await finish();
        check((await snap(page)).seq === "play", "setup: the finale plays");
        await page.keyboard.press("Escape");
        eq(cleanOf(await snap(page)), clean, "Escape ends the sequence");
        await context.close();
      }
      /* (c) a click inside the section */
      {
        const { context, page } = await finish();
        check((await snap(page)).seq === "play", "setup: the finale plays");
        await page.click("#practice .encounter-result .encounter-medal");
        eq(cleanOf(await snap(page)), clean, "a click inside the section ends the sequence");
        await context.close();
      }
      /* (d) Skip by keyboard: focus goes to the title */
      {
        const { context, page } = await finish();
        await page.focus("#practice .encounter-result [data-skip]");
        await page.keyboard.press("Enter");
        const a = await snap(page);
        eq(cleanOf(a), clean, "Skip by keyboard ends the sequence");
        check(/encounter-result-title/.test(a.active || ""), "and focus moves to the title (" + a.active + ")");
        check(a.html === skippedHtml, "and the markup is the reduced-motion render's");
        await context.close();
      }
    }

    /* -------------------------------- 14: the faded rung and the authored notes */
    {
      /* The chapter pages ship neither (the content is the owner's), so the response is
         rewritten: exercise e1 gets two more clues, a data-final on the last step of its
         solution, and one hidden note for the sign-flipped answer -140, which the sign detector asks about on the plain page. */
      const FINAL = "so the supplement is $180 - 40 = 140$.";
      const NOTE = "Authored note: that is the answer with its sign flipped.";
      const rewrite = (html) => {
        const from = html.indexOf('<div class="ex" id="e1"'), to = html.indexOf('<div class="ex-solution">', from);
        let head = html.slice(from, to);
        head = head.replace('data-hint="Angles on a straight line add to 180°."', 'data-hint="Angles on a straight line add to 180°." data-hint2="A straight line is half a turn." data-hint3="Subtract the angle from 180°."');
        const ul = '<ul class="ex-miss" hidden><li data-given="-140">' + NOTE + '</li></ul>\n        ';
        let rest = html.slice(to).replace(FINAL, "<span data-final>" + FINAL + "</span>");
        return html.slice(0, from) + head + ul + rest;
      };
      const E1 = '#practice .ex[data-key="e1"]';
      const prefs = (p) => ({ "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": JSON.stringify(p || {}) });
      const btn = (page) => page.$eval(E1 + " .ex-clue-btn", (b) => (b.hidden ? "(hidden)" : b.textContent.replace(/\s+/g, " ").trim())).catch(() => "(none)");
      const rec = (page) => page.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}"), found = null;
        (function walk(o) { if (!o || typeof o !== "object" || found) return; if (o.e1 && typeof o.e1 === "object") { found = o.e1; return; } Object.keys(o).forEach(function (k) { walk(o[k]); }); })(all);
        return found;
      });
      const faded = (page) => page.evaluate((sel) => {
        var f = document.querySelector(sel + " .ex-faded");
        if (!f) return null;
        return {
          answer: f.querySelectorAll(".answer").length, final: f.querySelectorAll("[data-final]").length,
          ids: f.querySelectorAll("[id]").length + (f.id ? 1 : 0), text: f.textContent.replace(/\s+/g, " ").trim(),
          focused: document.activeElement === f, restored: f.getAttribute("data-restored") === "true",
          level: f.getAttribute("data-level"), label: f.querySelector(".ex-hint-label").textContent
        };
      }, E1);
      const climb = async (page) => {
        const labels = [await btn(page)];
        for (let i = 0; i < 3; i++) { await page.click(E1 + " .ex-clue-btn"); if (i < 2) labels.push(await btn(page)); }
        labels.push(await btn(page));
        return labels;
      };

      /* 1, 2, 3: the climb, the reload, the right answer */
      {
        const { context, page, errors } = await open(browser, CH05, prefs(), { rewrite });
        check(await page.$(E1 + " .ex-solution [data-final]") !== null && await page.$(E1 + " ul.ex-miss[hidden]") !== null, "setup: the rewritten page carries the data-final and the note");
        const labels = await climb(page);
        eq([labels[0], labels[3]], ["Show a clue (1 of 4)", "Show the worked steps (4 of 4)"], "the button counts the worked steps as the fourth rung " + JSON.stringify(labels));
        await page.click(E1 + " .ex-clue-btn");
        const f = await faded(page);
        check(f && f.answer === 0 && f.final === 0 && f.ids === 0, "the worked steps hold no answer line, no data-final and no id " + JSON.stringify(f));
        check(f && f.focused && f.level === "4" && f.label === "Worked steps", "focus goes to the worked steps, level 4, labelled " + JSON.stringify(f && [f.focused, f.level, f.label]));
        check(f && /Supplementary angles add to 180°/.test(f.text) && !/so the supplement is|140|Authored note/.test(f.text) && /Finish the last step/.test(f.text), "they keep the earlier steps and lose the final one and what follows: " + JSON.stringify(f && f.text));
        check(await page.$eval(E1 + " .ex-solution", (s) => s.getAttribute("data-show") !== "true"), "the real solution stays closed");
        for (let i = 0; i < 40 && ((await rec(page)) || {}).rung !== 4; i++) await wait(50);   /* the store writes a moment later */
        eq([await btn(page), (await rec(page) || {}).rung], ["(hidden)", 4], "the button is gone and the record saves rung 4");

        await page.reload();
        await page.waitForFunction(() => document.readyState === "complete");
        const g = await faded(page);
        eq([await page.$$eval(E1 + " .ex-ladder .ex-clue", (n) => n.length), g && g.restored, g && g.focused, await btn(page)], [4, true, false, "(hidden)"], "after a reload the three clues and the worked steps are back, none focused");

        const s0 = await state(page);
        await answer(page, E1, true);
        const s1 = await state(page), r = await rec(page);
        eq([s1.xp - s0.xp, s1.hearts], [4, s0.hearts], "the right answer after the worked steps pays 4 XP and costs no heart");
        eq([r.rung, r.first], [4, 0], "and the record keeps rung 4 and no first-time credit " + JSON.stringify(r));
        check(await page.evaluate((r) => window.BMGame.medalMark(r), r), "the medal counts it as not first time");
        eq(errors, [], "no errors on the faded rung");
        await context.close();
      }

      /* 4: the notes, and the record gains no key (compared with the same steps on the unmodified page) */
      const wrongRun = async (rw, p) => {
        const { context, page, errors } = await open(browser, CH05, prefs(p), rw ? { rewrite: rw } : {});
        const typeCheck = async (v) => { await page.fill(E1 + " .ex-form input", v); await page.click(E1 + " .ex-form .btn:not(.ghost)"); };
        await typeCheck("-140");
        const one = await page.$eval(E1 + " .ex-feedback", (f) => ({ note: f.querySelector(".ex-miss-note") && f.querySelector(".ex-miss-note").textContent, ask: f.querySelectorAll(".ex-ask").length, offer: f.querySelectorAll(".ex-offer").length }));
        await typeCheck("987654");
        const two = await page.$eval(E1 + " .ex-feedback", (f) => ({ note: f.querySelector(".ex-miss-note") && f.querySelector(".ex-miss-note").textContent, offer: f.querySelectorAll(".ex-offer").length }));
        const keys = Object.keys(await rec(page)).sort();
        eq(errors, [], "no errors on the notes");
        await context.close();
        return { one, two, keys };
      };
      const plain = await wrongRun(null);
      /* the sign detector fires on -140 without the note, so the note (not a quiet detector) is why the rewritten page asks nothing */
      eq([plain.one.note, plain.one.ask > 0], [null, true], "on the plain page the wrong answer -140 gets the detectors' question and no note");
      for (const [name, p] of [["", {}], [" under Reduce motion", { motion: "reduce" }], [" in Study mode", { calm: true }]]) {
        const w = await wrongRun(rewrite, p);
        eq([w.one.note, w.one.ask, w.one.offer], [NOTE, 0, 1], "a wrong answer equal to the note's data-given shows the note, no question and the offer line" + name);
        eq([w.two.note, w.two.offer], [null, 1], "another wrong answer shows no note" + name);
        eq(w.keys, plain.keys, "the attempt record gains no key from the notes" + name);
      }
      /* 5: the climb under Reduce motion and in Study mode is the same */
      for (const [name, p] of [["Reduce motion", { motion: "reduce" }], ["Study mode", { calm: true }]]) {
        const { context, page } = await open(browser, CH05, prefs(p), { rewrite });
        const labels = await climb(page);
        await page.click(E1 + " .ex-clue-btn");
        const f = await faded(page);
        eq([labels[0], labels[3], f && f.focused, f && f.answer, f && f.final], ["Show a clue (1 of 4)", "Show the worked steps (4 of 4)", true, 0, 0], "the climb to the worked steps under " + name);
        await context.close();
      }
    }

    /* ---------------------------------------- 15: "Try one like it", the near-transfer twin */
    {
      const EX = (k) => '#practice .ex[data-key="' + k + '"]';
      const GEN_CHUNK = /arena-diagnostic\.js/;
      const lm = (p) => ({ "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": JSON.stringify(p || {}) });
      const recOf = (page, k) => page.evaluate((k) => {
        var all = JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}"), ch = document.body.getAttribute("data-chapter");
        return all[ch] && all[ch][k] ? all[ch][k] : null;
      }, k);
      const fetched = (page) => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /arena-diagnostic\.js/.test(e.name)).length);
      const hasBtn = (page, k) => page.$eval(EX(k) + " .ex-twin-btn", (b) => !b.hidden).catch(() => false);
      /* the twin the page should offer, rebuilt with the generators it loaded (the seed is the rule's) */
      const expectTwin = (page, k, sec, n) => page.evaluate(({ k, sec, n }) => {
        var G = window.BMGen, ch = document.body.getAttribute("data-chapter");
        var seed = G.hash("twin:" + ch + "/" + k + ":" + n), specs = G.forSection(ch + "#" + sec);
        for (var i = 0; i < 5; i++) {
          var p = G.make(specs[(seed % specs.length + i) % specs.length].id, seed);
          if (!p.verify || p.verify()) return { answer: String(p.answer).split("|")[0], q: p.q, hint: p.hint || "", steps: p.steps || [] };
        }
        return null;
      }, { k, sec, n });
      const bus = (page) => page.evaluate(() => { window.__ev = []; window.BMStore.on((c) => window.__ev.push(c.type + ":" + (c.why || ""))); });
      const snap = async (page, k) => ({
        xp: await page.evaluate(() => window.BMActivity.total()), pips: await page.evaluate(() => window.BMGame.combo().pips),
        rec: await recOf(page, k), medal: await page.evaluate((r) => window.BMGame.medalMark(r), await recOf(page, k)),
        progress: await page.evaluate(() => localStorage.getItem("bm.progress.v1"))
      });
      const submit = async (page, k, v) => {
        await page.fill(EX(k) + " .ex-twin-card input", v);
        await page.click(EX(k) + " .ex-twin-card .btn:not(.ghost)");
        await wait(250);
      };
      const without = (r) => { const c = Object.assign({}, r); delete c.twin; return c; };

      for (const [name, prefs] of [["", {}], [" in Study mode", { calm: true }]]) {
        const { context, page, errors } = await open(browser, CH05, lm(prefs));
        await bus(page);
        /* 1: absent until help is open; the generators are not fetched by loading the page */
        eq([await hasBtn(page, "e1"), await fetched(page)], [false, 0], "no twin button on a card with no help open, and no generator chunk fetched" + name);
        await page.click(EX("e1") + " .ex-show");
        await page.waitForSelector(EX("e1") + " .ex-twin-btn:not([hidden])");
        eq(await fetched(page), 0, "opening the solution shows the button without fetching the generators" + name);
        /* 2: the first click loads them once, shows the question rendered, focuses the box */
        await page.click(EX("e1") + " .ex-twin-btn");
        await page.waitForSelector(EX("e1") + " .ex-twin-card input");
        await wait(200);
        const q0 = await page.$eval(EX("e1") + " .ex-twin-q", (q) => q.textContent);
        const e0 = await expectTwin(page, "e1", "angles", 0);
        eq([await fetched(page), await page.$(EX("e1") + " .ex-twin-q .katex") !== null, await page.evaluate(() => document.activeElement && document.activeElement.closest(".ex-twin-card") !== null)],
          [1, true, true], "the first click fetches the generator chunk once; the question has math rendered and the box has focus" + name);
        /* 3: a right answer pays 3, once, and only the twin flag changes */
        const before = await snap(page, "e1");
        await submit(page, "e1", e0.answer);
        const after = await snap(page, "e1");
        eq([after.xp - before.xp, after.rec.twin], [3, 1], "a right twin answer pays 3 XP and the record gains twin: 1" + name);
        eq([without(after.rec), after.pips, after.medal, after.progress], [before.rec, before.pips, before.medal, before.progress], "nothing else moves: the record, the combo, the medal mark, progress" + name);
        const ev = await page.evaluate(() => window.__ev);
        check(ev.includes("xp:twin") && ev.includes("twin:") && !ev.some((e) => /^attempt:/.test(e)), "the bus saw xp (why twin) and twin, and no attempt: " + JSON.stringify(ev) + name);
        /* 4: another one is a different question and pays nothing */
        await page.click(EX("e1") + " .ex-twin-card > .btn.ghost");
        await wait(200);
        const e1x = await expectTwin(page, "e1", "angles", 1);
        const q1 = await page.$eval(EX("e1") + " .ex-twin-q", (q) => q.textContent);
        check(q1 !== q0 && e1x.q !== e0.q, "Another one shows a different question" + name);
        const b2 = await snap(page, "e1");
        await submit(page, "e1", e1x.answer);
        const a2 = await snap(page, "e1");
        eq([a2.xp - b2.xp, a2.rec], [0, b2.rec], "a second right twin pays 0 and changes no record" + name);
        eq(await fetched(page), 1, "the chunk was fetched once in all" + name);
        eq(errors, [], "no errors from the twin" + name);
        /* 5: reload: the same first question, still paid, pays 0 */
        await page.reload();
        await page.waitForFunction(() => document.readyState === "complete");
        await page.click(EX("e1") + " .ex-show");
        await page.waitForSelector(EX("e1") + " .ex-twin-btn:not([hidden])");
        await page.click(EX("e1") + " .ex-twin-btn");
        await page.waitForSelector(EX("e1") + " .ex-twin-card input");
        await wait(200);
        eq(await page.$eval(EX("e1") + " .ex-twin-q", (q) => q.textContent), q0, "after a reload the first twin is the same question" + name);
        const b3 = await snap(page, "e1");
        await submit(page, "e1", e0.answer);
        eq((await snap(page, "e1")).xp - b3.xp, 0, "and it pays 0, the twin was paid" + name);
        await context.close();
      }

      /* the authored template path: the card's own twin, its solution shown as the steps (not hidden by the page's CSS) */
      {
        const TW = '<template class="ex-twin" data-type="number" data-answer="9"><div class="ex-q"><p>Compute $6 - (-3)$.</p></div><div class="ex-solution"><p>Subtracting a negative adds: $6 + 3 = 9$.</p></div></template>';
        const rewrite = (html) => {
          const from = html.indexOf('<div class="ex" id="e1"'), at = html.indexOf("</div>", html.indexOf('<div class="ex-solution">', from)) + "</div>".length;
          return html.slice(0, at) + TW + html.slice(at);
        };
        const { context, page, errors } = await open(browser, CH05, lm(), { rewrite });
        await page.click(EX("e1") + " .ex-show");
        await page.waitForSelector(EX("e1") + " .ex-twin-btn:not([hidden])");
        await page.click(EX("e1") + " .ex-twin-btn");
        await page.waitForSelector(EX("e1") + " .ex-twin-card input");
        eq([await fetched(page), /Compute/.test(await page.$eval(EX("e1") + " .ex-twin-q", (q) => q.textContent))], [0, true], "an authored twin shows its own question and fetches no generator");
        await submit(page, "e1", "987654");
        await page.click(EX("e1") + " .ex-twin-extras .btn");
        await wait(200);
        const st = await page.$eval(EX("e1") + " .ex-twin-steps", (b) => ({ text: b.textContent.trim(), shown: b.offsetParent !== null, solutions: b.querySelectorAll(".ex-solution").length, focused: document.activeElement === b }));
        check(/Subtracting a negative adds/.test(st.text) && st.shown && st.solutions === 0 && st.focused, "Show steps on an authored twin shows its solution text, visible and focused: " + JSON.stringify(st));
        const b = await snap(page, "e1");
        await submit(page, "e1", "9");
        const a = await snap(page, "e1");
        eq([a.xp - b.xp, a.rec.twin], [3, 1], "the authored twin pays 3 and sets twin: 1 like a generated one");
        eq(errors, [], "no errors on the authored twin");
        await context.close();
      }

      /* 6: solved first time, solution opened after: the twin pays nothing and writes nothing */
      {
        const { context, page, errors } = await open(browser, CH05, lm());
        await answer(page, EX("e2"), true);
        await wait(500);
        await page.click(EX("e2") + " .ex-show");
        await page.waitForSelector(EX("e2") + " .ex-twin-btn:not([hidden])");
        await page.click(EX("e2") + " .ex-twin-btn");
        await page.waitForSelector(EX("e2") + " .ex-twin-card input");
        const exp = await expectTwin(page, "e2", "angles", 0);
        const b = await snap(page, "e2");
        await submit(page, "e2", exp.answer);
        const a = await snap(page, "e2");
        eq([a.xp - b.xp, a.rec], [0, b.rec], "a twin on an exercise solved first time pays 0 and writes nothing");
        eq(errors, [], "no errors on the unpaid twin");
        await context.close();
      }

      /* 7: a wrong answer: the verdict, then the steps on request; the record is untouched */
      {
        const { context, page, errors } = await open(browser, CH05, lm());
        await bus(page);
        await page.click(EX("e3") + " .ex-show");
        await page.waitForSelector(EX("e3") + " .ex-twin-btn:not([hidden])");
        await page.click(EX("e3") + " .ex-twin-btn");
        await page.waitForSelector(EX("e3") + " .ex-twin-card input");
        const exp = await expectTwin(page, "e3", "parallels", 0);
        const b = await snap(page, "e3");
        await submit(page, "e3", "987654");
        eq([await page.$eval(EX("e3") + " .ex-twin-verdict", (v) => [v.textContent, v.getAttribute("role")]), await page.$(EX("e3") + " .ex-twin-extras .btn") !== null],
          [["Not quite.", "status"], true], "a wrong twin answer shows the verdict in a status line and Show steps");
        await page.click(EX("e3") + " .ex-twin-extras .btn");
        await wait(200);
        const steps = await page.$$eval(EX("e3") + " .ex-twin-steps p", (ps) => ps.length);
        eq(steps, [exp.hint].concat(exp.steps).filter(Boolean).length, "Show steps shows the generator's hint and steps");
        const a = await snap(page, "e3");
        eq([a.xp, a.rec, a.pips], [b.xp, b.rec, b.pips], "a wrong twin answer moves nothing");
        const ev = await page.evaluate(() => window.__ev);
        check(ev.includes("twin:") && !ev.some((e) => /^attempt:/.test(e)), "and fires a twin event, never an attempt: " + JSON.stringify(ev));
        eq(errors, [], "no errors on the wrong twin");
        await context.close();
      }
    }
    /* ------------- the support line (src/ui/ladder.ts): where the shaky ground is, nothing else changes */
    {
      const seedLog = (page, sec, kind, n, ok) => page.evaluate(([sec, kind, n, ok]) => {
        var t = Math.floor(Date.now() / 60000) - 30;
        for (var i = 1; i <= n; i++) window.BMEvents.record([t + i, Math.floor((t + i) / 1440), "ex", sec, "ch05/s" + kind + i, kind, ok, 1, 0, 0]);
      }, [sec, kind, n, ok]);
      /* the first card after the section's h2, in document order: the one that carries the line */
      const FIRST = () => {
        var h = document.getElementById("parallels"), stop = document.getElementById("pythagoras");
        return Array.prototype.filter.call(document.querySelectorAll(".ex"), function (e) {
          return (h.compareDocumentPosition(e) & 4) && (stop.compareDocumentPosition(e) & 2);
        })[0];
      };
      const prefs = { "bm.lesson.v1": '{"mode":"page"}', "bm.prefs.v1": '{"calm":true,"sound":true}' };
      {
        const { context, page, errors } = await open(browser, CH05, prefs);
        await seedLog(page, "ch05#angles", "o", 3, 0);
        await page.reload();
        await page.waitForSelector(".ex-support");
        eq(await page.$$eval(".ex-support", (n) => n.length), 2, "the weak section itself and the section built on it each carry one line");
        const got = await page.evaluate((src) => {
          var first = (new Function("return " + src))()();
          var h = document.getElementById("parallels"), stop = document.getElementById("pythagoras");
          var all = Array.prototype.filter.call(document.querySelectorAll(".ex-support"), function (e) {
            return (h.compareDocumentPosition(e) & 4) && (stop.compareDocumentPosition(e) & 2);
          });
          var sup = all[0];
          return {
            n: all.length, inFirst: !!first && first.contains(sup), before: !!first && sup.compareDocumentPosition(first.querySelector(".ex-form")) & 4,
            live: !!sup.closest("[aria-live]"), text: sup.textContent, link: (sup.querySelector("a") || {}).textContent, href: (sup.querySelector("a") || {}).getAttribute && sup.querySelector("a").getAttribute("href"),
            calm: document.documentElement.getAttribute("data-calm"), section: first && first.closest("main") !== null
          };
        }, FIRST.toString());
        eq([got.n, got.inFirst, !!got.before, got.live, got.calm], [1, true, true, false, "true"], "one support line, on the section's first card, before the form, not live, calm mode on " + JSON.stringify(got));
        check(/This section builds on .*Angles.*shaky/.test(got.text) && /\.html#angles$/.test(got.href || ""), "it names the weak prerequisite with a link " + JSON.stringify([got.text, got.href]));
        await page.click(".ex-support [data-worked]");
        await wait(300);
        const f = await page.evaluate(() => ({ tag: document.activeElement.tagName, inWorked: !!document.activeElement.closest(".worked"), ph: document.getElementById("parallels").compareDocumentPosition(document.activeElement) & 4 }));
        check(f.tag === "H3" && f.inWorked && f.ph, "See the worked example focuses the worked example heading " + JSON.stringify(f));
        eq(errors, [], "no errors around the support line");
        await context.close();
      }
      {
        const { context, page, errors } = await open(browser, CH05, prefs);
        await seedLog(page, "ch05#angles", "c", 5, 1);
        await page.reload();
        await page.waitForSelector(".ex");
        eq(await page.$$eval(".ex-support", (n) => n.length), 0, "a strong prerequisite shows no support line");
        const id = await page.evaluate((src) => (new Function("return " + src))()().id, FIRST.toString());
        const sel = "#" + id;
        await answer(page, sel, false);
        await page.waitForSelector(sel + " .ex-feedback *");
        eq(await page.$$eval(sel + " .ex-offer", (n) => n.length), 0, "light: the first wrong check has no offer line");
        await page.click(sel + " .ex-clue-btn");
        eq(await page.$$eval(sel + " .ex-clue", (n) => n.length), 1, "the clue button still opens clue 1");
        await answer(page, sel, false);
        eq(await page.$$eval(sel + " .ex-offer", (n) => n.length), 1, "the second wrong check has its offer line");
        eq(errors, [], "no errors in the light case");
        await context.close();
      }
    }
      /* 10. the HUD explains itself (card U-7): a chip on hover, a popover on the level badge */
      {
        const days = {}; days[dayAgo(0)] = 13; days[dayAgo(1)] = 140; days[dayAgo(3)] = 20;
        const seed = { "bm.lesson.v1": '{"mode":"page"}', "bm.activity.v1": JSON.stringify({ days }) };
        const boxes = (page) => page.evaluate(() => Array.from(document.querySelectorAll(".topbar .hud > *")).map((e) => { const r = e.getBoundingClientRect(); return [e.className, r.x, r.y, r.width, r.height].join(" "); }));
        for (const reduced of ["no-preference", "reduce"]) {
          const { context, page, errors } = await open(browser, CH05, seed, { reducedMotion: reduced });
          await page.waitForSelector(".topbar .hud-streak");
          const before = await boxes(page);
          await page.hover(".topbar .hud-streak");
          await page.waitForSelector(".hud-tip:not([hidden])", { timeout: 400 + 250 });
          const tip = await page.$$eval(".hud-tip", (n) => n.map((e) => ({ t: e.textContent, hidden: e.getAttribute("aria-hidden") })));
          eq(tip.length, 1, reduced + ": one chip");
          check(/Streak: 2 days\. Today: 13 of 30 XP\./.test(tip[0].t) && tip[0].hidden === "true", reduced + ": the streak chip says " + tip[0].t);
          eq(await boxes(page), before, reduced + ": the chip moves no part of the bar");
          if (reduced === "reduce") eq(await page.evaluate(() => document.getAnimations().length), 0, "reduce motion: no animation while the chip shows");
          await page.mouse.move(600, 600);
          await page.waitForTimeout(300);
          eq(await page.$$eval(".hud-tip:not([hidden])", (n) => n.length), 0, reduced + ": the chip is gone after the pointer leaves");
          eq(errors, [], reduced + ": no errors with the chip");
          await context.close();
        }
        {
          const { context, page, errors } = await open(browser, CH05, seed);
          await page.waitForSelector(".topbar .hud-level");
          const here = new URL(page.url()).pathname;
          await page.click(".topbar .hud-level");
          await page.waitForSelector(".hud-pop");
          const portrait = await page.$eval(".hud-pop .hud-pop-form", (e) => ({ bg: e.style.backgroundImage, hidden: e.getAttribute("aria-hidden"), size: getComputedStyle(e).backgroundSize }));
          check(/models\/forms\/form-2-poses\.webp/.test(portrait.bg) && portrait.hidden === "true", "the popover shows the worn form's pose sheet: " + portrait.bg);
          eq(portrait.size, "600% 100%", "the portrait shows one of the sheet's six frames");
          /* a toast raised while the popover is open must not paint over it: park the toast on the popover's box */
          await page.evaluate(() => {
            const r = document.querySelector(".hud-pop").getBoundingClientRect();
            window.BMToast("A toast over the popover", "");
            const host = document.querySelector(".toasts"), t = host.querySelector(".toast");
            host.style.cssText += ";left:" + r.left + "px;top:" + r.top + "px;right:auto;width:" + r.width + "px;max-width:none";
            t.style.cssText += ";pointer-events:auto;min-height:" + r.height + "px";
          });
          await page.waitForSelector(".toasts .toast");
          const covered = await page.evaluate(() => {
            const r = document.querySelector(".hud-pop").getBoundingClientRect();
            const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { inPop: !!e && !!e.closest(".hud-pop"), tag: e && e.className };
          });
          check(covered.inPop, "a toast does not paint over the open popover: " + covered.tag);
          await page.waitForTimeout(300);
          const formReqs = await page.evaluate(() => [...new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\/models\/forms\//.test(u)).map((u) => u.replace(/^.*\/models\/forms\//, "")))]);
          eq(formReqs, ["form-2-poses.webp"], "the pose sheet is the only form request on a chapter page");
          eq(new URL(page.url()).pathname, here, "a plain click on the badge does not navigate");
          const txt = await page.textContent(".hud-pop");
          check(/Level \d+ · \w+/.test(txt) && /XP to level/.test(txt), "the popover names the level and rank and the XP to level: " + txt);
          check(/Form: \w+/.test(txt), "the popover names the form: " + txt);
          check(/Active 3 of the last 30 days/.test(txt), "the popover counts the active days");
          eq(await page.getAttribute(".hud-pop a", "href"), "../../progress.html", "the popover links to the progress page");
          await page.keyboard.press("Tab");
          check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("pop-link")), "Tab goes into the popover");
          const linkInfo = await page.evaluate(() => {
            const a = document.querySelector(".hud-pop .pop-link"), box = document.querySelector(".hud-pop");
            const cs = getComputedStyle(box);
            const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return { btn: a.classList.contains("btn"), ratio: a.getBoundingClientRect().width / inner, focused: document.activeElement === a, href: a.getAttribute("href") };
          });
          check(linkInfo.btn, "the progress link is a .btn");
          check(linkInfo.ratio >= 0.9, "the progress link is full width: " + linkInfo.ratio);
          check(linkInfo.focused && /progress\.html$/.test(linkInfo.href), "one Tab focuses the progress link: " + linkInfo.href);
          await page.keyboard.press("Escape");
          eq(await page.$$eval(".hud-pop", (n) => n.length), 0, "Escape closes the popover");
          check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("hud-level")), "focus is back on the badge");
          await page.keyboard.press("Enter");
          await page.waitForSelector(".hud-pop");
          eq(new URL(page.url()).pathname, here, "Enter on the badge opens the popover too");
          await page.mouse.click(600, 600);
          eq(await page.$$eval(".hud-pop", (n) => n.length), 0, "a click outside closes it");
          const start = page.url();
          const popup = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
          await page.click(".topbar .hud-level", { modifiers: ["Control"] });
          const tab = await popup;
          if (tab) await tab.waitForLoadState().catch(() => {});
          check(page.url() === start && !!tab && /\/progress\.html/.test(tab.url()), "Ctrl+click opens progress.html in a new tab (" + (tab && tab.url()) + ")");
          eq(await page.$$eval(".hud-pop", (n) => n.length), 0, "Ctrl+click opens no popover");
          eq(errors, [], "no errors with the popover");
          await context.close();
        }
        {
          const { context, page, errors } = await open(browser, "parts/4-topics/16-determinants.html", seed);
          await page.waitForSelector(".topbar .hud-level");
          await page.click(".topbar .hud-level");
          await page.waitForSelector(".hud-pop");
          const portrait = await page.$eval(".hud-pop .hud-pop-form", (e) => ({ bg: e.style.backgroundImage, hidden: e.getAttribute("aria-hidden"), size: getComputedStyle(e).backgroundSize }));
          check(/models\/forms\/form-2-poses\.webp/.test(portrait.bg) && portrait.hidden === "true", "a later Part's page: the popover shows the pose sheet: " + portrait.bg);
          eq(portrait.size, "600% 100%", "a later Part's page: the portrait shows one of six frames");
          eq(errors, [], "no errors with the popover on a later Part's page");
          await context.close();
        }
      }
    /* ------------------------------------------------ U-6b: the first-run guide */
    {
      const UNSEEN = { "bm.guide.v1": '{"v":1}' };
      const guideKey = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.guide.v1") || "null"));
      const step = (page) => page.$eval("#guide-sheet .guide-step", (e) => e.textContent);
      const isOpen = (page) => page.evaluate(() => { const d = document.getElementById("guide-sheet"); return !!d && d.open; });
      {
        const { context, page, errors } = await open(browser, CH05, UNSEEN);
        await page.waitForSelector("#guide-sheet[open]", { timeout: 1500 });
        eq(await page.evaluate(() => document.activeElement && document.activeElement.id), "guide-sheet-title", "guide: the title is focused");
        eq(await step(page), "1 of 5", "guide: opens on card 1 of 5");
        await page.click("#guide-sheet [data-guide-next]");
        eq(await step(page), "2 of 5", "guide: Next goes to 2 of 5");
        await page.click("#guide-sheet [data-guide-back]");
        eq(await step(page), "1 of 5", "guide: Back goes to 1 of 5");
        /* j and k do nothing while it is open */
        await page.keyboard.press("j");
        await page.keyboard.press("k");
        eq(await page.$$eval("[data-keys-cursor]", (n) => n.length), 0, "guide: j and k do not move the shortcut cursor");
        /* Tab stays inside the modal */
        let inside = true;
        const seen = [];
        for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + "#" + a.id + (a.closest("#guide-sheet") ? " in" : " out") : "none"; })); }
        /* headless Chromium hands focus to the frame (BODY) once, after the last button, and the next Tab is back inside: allow that hand-off, never an element of the page */
        inside = seen.every((x, i) => / in$/.test(x) || (/^BODY#/.test(x) && i < seen.length - 1 && / in$/.test(seen[i + 1])));
        if (!inside) console.log("guide Tab trail:", seen.join(", "));
        check(inside, "guide: Tab stays inside the dialog");
        await page.keyboard.press("Escape");
        check(!(await isOpen(page)), "guide: Escape closes it");
        check(!!(await guideKey(page)).seen, "guide: Escape writes seen");
        await page.reload();
        await page.waitForFunction(() => document.readyState === "complete");
        await wait(400);
        check(!(await isOpen(page)), "guide: a reload shows no dialog");
        eq(errors, [], "guide: no errors");
        await context.close();
      }
      {
        const { context, page } = await open(browser, CH05, UNSEEN);
        await page.waitForSelector("#guide-sheet[open]", { timeout: 1500 });
        await page.click("#guide-sheet [data-guide-next]");
        await page.click("#guide-sheet [data-guide-next]");
        eq(await step(page), "3 of 5", "guide: card 3");
        await page.click("#guide-sheet [data-guide-skip]");
        check(!(await isOpen(page)) && !!(await guideKey(page)).seen, "guide: Skip on card 3 sets seen");
        await context.close();
      }
      {
        const { context, page } = await open(browser, CH05, UNSEEN);
        await page.waitForSelector("#guide-sheet[open]", { timeout: 1500 });
        for (let i = 0; i < 4; i++) await page.click("#guide-sheet [data-guide-next]");
        eq(await step(page), "5 of 5", "guide: card 5");
        check(await page.$eval("#guide-sheet [data-guide-next]", (b) => b.hidden), "guide: no Next on the last card");
        await page.click("#guide-sheet [data-guide-done]");
        check(!(await isOpen(page)) && !!(await guideKey(page)).seen, "guide: Done on card 5 sets seen");
        await context.close();
      }
      {
        const { context, page } = await open(browser, "index.html", UNSEEN);
        await wait(600);
        check(!(await isOpen(page)), "guide: index.html shows no dialog");
        await context.close();
      }
      {
        const { context, page } = await open(browser, CH05, UNSEEN);
        await page.waitForSelector("#guide-sheet[open]", { timeout: 1500 });
        await page.click("#guide-sheet [data-guide-skip]");
        const seen = (await guideKey(page)).seen;
        await page.click(".topbar .hud-menu");
        await page.click("#hud-sheet [data-guide-replay]");
        await page.waitForSelector("#guide-sheet[open]");
        eq(await step(page), "1 of 5", "guide: replay opens on card 1");
        await page.keyboard.press("Escape");
        eq(await page.evaluate(() => document.activeElement && document.activeElement.className.indexOf("hud-menu") >= 0), true, "guide: closing restores focus to the menu button");
        const k = await guideKey(page);
        check(k.seen === seen && !!k.replay, "guide: replay writes replay and keeps seen");
        await context.close();
      }
      {
        const { context, page } = await open(browser, "index.html");
        await page.click(".topbar .hud-menu");
        await page.click("#hud-sheet [data-guide-replay]");
        await page.waitForSelector("#guide-sheet[open]");
        eq(await step(page), "1 of 5", "guide: replay opens on a non-chapter page");
        await context.close();
      }
      {
        const { context, page } = await open(browser, CH05, Object.assign({ "bm.prefs.v1": '{"calm":true}' }, UNSEEN));
        await page.waitForSelector("#guide-sheet[open]", { timeout: 1500 });
        for (let i = 0; i < 3; i++) await page.click("#guide-sheet [data-guide-next]");
        check(/hearts and the combo are off/.test(await page.$eval("#guide-sheet .guide-body", (e) => e.textContent)), "guide: Study mode card 4 says hearts and the combo are off");
        eq(await page.evaluate(() => document.getAnimations().length), 0, "guide: no animations in Study mode");
        await context.close();
      }
      {
        const { context, page } = await open(browser, CH05, { "bm.guide.v1": null, "bm.progress.v1": JSON.stringify({ ch05: { solved: { e1: 1 }, total: 5 } }) });
        await wait(700);
        check(!(await isOpen(page)) && !!(await guideKey(page)).seen, "guide: an existing learner gets no dialog and seen is written");
        await context.close();
      }
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
