#!/usr/bin/env node
/* Headless Chromium checks of the Arena's settling rules (assets/arena.js with
   assets/game.js), over file:// URLs with every network request aborted:
     BM_PLAYWRIGHT_FROM=~/dev/json-data-drift-analyzer/ node tools/game/arena.test.js

   1. a Repair banked after one right answer repairs nothing; a full one still does
   2. the Daily is one attempt a day: once played (or banked) the tile shows today's
      result and cannot start again, "Another run" becomes a Standard run, and a second
      Daily dealt the same day (another tab) pays nothing
   3. calm mode switched on mid-run stops the clock and the hearts for the rest of the
      run, says so, and the run is scored as untimed; switching it off does not restart them
   4. without a heart at stake, a wrong answer is never better than "I don't know": both
      lead to the same hint and retry, which scores nothing; with a heart it still pays 30
   5. a section picked by hand stays picked after a chapter page writes the run store
   6. a rematch before the practice set is cleared says why it won no medal
   7. a run open in two tabs is paid once
   8. Esc, Esc after an answer puts focus back on Next
   9. the paused par label keeps its text contrast (only the bar fades) */
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

async function ctx(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: opts.scheme || "light" });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  return context;
}
async function page(context, errors) {
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push("console: " + m.text());
  });
  return p;
}
/* open page0 with storage seeded from `seed`; with solid=true every section the
   generators cover is put in the deck (two exercises solved there, first time) */
async function open(context, errors, page0, seed, solid) {
  const p = await page(context, errors);
  await p.goto(url("arena.html"));
  await p.evaluate(({ seed, solid }) => {
    localStorage.clear();
    Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); });
    if (solid) {
      var all = JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}"), t = Date.now() - 864e5 * 2;
      window.BMGen.list().forEach(function (s) {
        var ch = s.section.split("#")[0], sec = s.section.split("#")[1], recs = all[ch] = all[ch] || {};
        recs["z" + sec + "1"] = { tries: 1, first: 1, solved: t, section: sec };
        recs["z" + sec + "2"] = { tries: 1, first: 1, solved: t + 1, section: sec };
      });
      localStorage.setItem("bm.attempts.v1", JSON.stringify(all));
    }
  }, { seed: seed || {}, solid: !!solid });
  await p.goto(url(page0));
  await p.waitForFunction(() => document.readyState === "complete");
  return p;
}

const st = (p) => p.evaluate(() => {
  var r = window.BMArena.state();
  if (!r) return null;
  var q = r.qs[r.i];
  return { i: r.i, n: r.qs.length, phase: r.cur.phase, el: r.cur.el, hearts: r.hearts, score: r.score, done: !!r.done,
    timed: q.timed, hf: q.hf, tempo: r.tempo, ans: r.ans[r.i] || null };
});
async function answer(p, right) {
  await p.evaluate((right) => {
    var r = window.BMArena.state(), q = r.qs[r.i];
    document.getElementById("arena-answer").value = right ? String(window.BMGen.make(q.g, q.s).answer).split("|")[0] : "987654321";
  }, right);
  await p.click('.arena-run [data-act="check"]');
}
async function next(p) { await p.click('.arena-feedback [data-act="next"]'); }
/* play every remaining question right first time, through to the results */
async function playOut(p) {
  for (let k = 0; k < 12; k++) {
    if (await p.$(".arena-result")) return;
    await answer(p, true);
    await next(p);
  }
}
const xp = (p) => p.evaluate(() => window.BMActivity.total());
const game = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("bm.game.v1") || "{}"));
const runStore = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1") || "{}"));

async function run() {
  const browser = await chromium.launch();
  const errors = [];
  try {
    /* ---------------------------------------- 1. a banked Repair repairs nothing */
    {
      const context = await ctx(browser);
      const seed = { "bm.attempts.v1": JSON.stringify({ ch05: { x1: { section: "parallels", solved: Date.now() - 864e5, first: false, tries: 3 } } }) };
      const p = await open(context, errors, "arena.html?repair=ch05%23parallels", seed);
      const weak = () => p.evaluate(() => window.BMInsights.weak().map((r) => r.id));
      check((await weak()).includes("ch05#parallels"), "the seeded section starts weak");
      await p.click('[data-act="start"][data-mode="repair"]');
      await answer(p, true);
      await p.goto(url("arena.html"));
      await p.click('[data-act="bank"]');
      await p.waitForSelector(".arena-result");
      const g = await game(p);
      check(!(g.sec["ch05#parallels"] || {}).fix, "a banked repair sets no fix");
      check(!(g.ach || {}).comeback, "a banked repair unlocks no Comeback");
      check((await weak()).includes("ch05#parallels"), "a banked repair leaves the section weak");
      const text = await p.$eval(".arena-result", (e) => e.textContent);
      check(!/as repaired/.test(text) && /once all 5 questions are answered/.test(text), "the banked repair says what a repair needs");

      /* the full repair still works */
      await p.goto(url("arena.html?repair=ch05%23parallels"));
      await p.click('[data-act="start"][data-mode="repair"]');
      await playOut(p);
      const g2 = await game(p);
      check(!!(g2.sec["ch05#parallels"] || {}).fix && !!(g2.ach || {}).comeback, "five right answers still repair the section");
      check(/as repaired/.test(await p.$eval(".arena-result", (e) => e.textContent)), "a full repair says so");
      await context.close();
    }

    /* ---------------------------------------- 2. the Daily: one attempt a day */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html", {}, true);
      const tile = () => p.$eval('[data-act="start"][data-mode="daily"]', (b) => ({ disabled: b.disabled, text: b.textContent }));
      check(!(await tile()).disabled, "the Daily starts open");
      await p.click('[data-act="start"][data-mode="daily"]');
      const first = await p.evaluate(() => window.BMArena.state().qs.map((q) => q.g + ":" + q.s).join());
      await playOut(p);
      const xp1 = await xp(p);
      check(xp1 > 0, "the Daily pays");
      eq(await p.$eval('.arena-result [data-act="again"]', (b) => b.textContent), "A Standard run", "after the Daily, the next run offered is a Standard run");
      await p.click('.arena-result [data-act="lobby"]');
      const t = await tile();
      check(t.disabled && /Done today: \d+ points, 5 of 5 first try/.test(t.text), "the lobby shows the Daily done, with today's result — got " + JSON.stringify(t));
      await p.$eval('[data-act="start"][data-mode="daily"]', (b) => { b.disabled = false; b.click(); });
      check(await p.$(".arena-run") === null, "a forced click on the spent Daily starts nothing");
      await p.click('.arena-mode[data-mode="standard"]');
      await p.waitForSelector(".arena-run");
      check(await p.evaluate(() => window.BMArena.state().mode) === "standard", "the Standard run still starts");
      check(first.length > 0, "the Daily had questions");
      await context.close();

      /* a Daily dealt before the day's was spent (in another tab) pays nothing when it ends */
      const c1 = await ctx(browser);
      const p1 = await open(c1, errors, "arena.html", {}, true);
      await p1.click('[data-act="start"][data-mode="daily"]');
      await p1.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1"));
        all.daily = { day: window.BMSite.dayKey(), score: 700, firstTry: 5, n: 5, ended: "complete" };
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      const g1 = await game(p1), x1 = await xp(p1);
      await playOut(p1);
      const r1 = await p1.evaluate(() => window.BMArena.state().result);
      eq([r1.xp, r1.replay, await xp(p1), (await game(p1)).best], [0, true, x1, g1.best], "a second Daily the same day pays nothing and keeps no best");
      check(/had already been played/.test(await p1.$eval(".arena-result", (e) => e.textContent)), "and says why");
      await c1.close();

      /* banked counts as the day's attempt; the bonus needs the end */
      const c2 = await ctx(browser);
      const p2 = await open(c2, errors, "arena.html", {}, true);
      await p2.click('[data-act="start"][data-mode="daily"]');
      await answer(p2, true);
      await next(p2);
      await p2.goto(url("arena.html"));
      check(/waiting where you left it/.test(await p2.$eval('[data-mode="daily"]', (b) => b.textContent)), "an unfinished Daily is offered back by its tile");
      await p2.click('[data-act="start"][data-mode="daily"]');
      eq(await p2.evaluate(() => window.BMArena.state().i), 1, "the Daily tile resumes today's unfinished Daily");
      await p2.goto(url("arena.html"));
      await p2.click('[data-act="bank"]');
      await p2.click('.arena-result [data-act="lobby"]');
      const t2 = await p2.$eval('[data-mode="daily"]', (b) => ({ disabled: b.disabled, text: b.textContent }));
      check(t2.disabled && /Done today/.test(t2.text), "a banked Daily spends the day");
      eq((await runStore(p2)).daily.ended, "banked", "a banked Daily is kept as the day's attempt");
      await c2.close();

      /* played on another device: the synced record alone spends it */
      const c3 = await ctx(browser);
      const p3 = await open(c3, errors, "arena.html", {}, true);
      await p3.evaluate(() => { var g = JSON.parse(localStorage.getItem("bm.game.v1")); g.daily = {}; g.daily[window.BMSite.dayKey()] = 1; localStorage.setItem("bm.game.v1", JSON.stringify(g)); });
      await p3.reload();
      const t3 = await p3.$eval('[data-mode="daily"]', (b) => ({ disabled: b.disabled, text: b.textContent }));
      check(t3.disabled && /Done today\. A new one tomorrow/.test(t3.text), "a Daily synced from another device shows as done");
      await c3.close();
    }

    /* ---------------------------------------- 3. calm mode switched on mid-run */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html", {}, true);
      await p.click('[data-act="start"][data-mode="standard"]');
      for (let k = 0; k < 10; k++) {
        const s = await st(p);
        if (s.timed && !s.hf) break;
        await p.click('.arena-run [data-act="pass"]');
        if ((await st(p)).phase === "retry") await p.click('.arena-run [data-act="pass"]');
        await next(p);
      }
      const s0 = await st(p);
      check(s0.timed && s0.hearts === 3, "found a timed question with hearts");
      check(await p.$eval(".arena-calmnote", (e) => e.hidden), "no calm note before calm");
      await p.evaluate(() => window.BMGame.setPref("calm", true));
      await wait(200);
      const s1 = await st(p);
      await wait(1500);
      const s2 = await st(p);
      eq([s1.hearts, s1.timed, s1.hf, s1.tempo], [null, false, true, "untimed"], "calm on: no hearts, no clock, Untimed");
      check(s2.el === s1.el, "the clock does not run after calm is switched on");
      check(await p.$eval(".arena-par", (e) => e.hidden), "the par bar is gone");
      check(!(await p.$eval(".arena-calmnote", (e) => e.hidden)), "the run screen says calm mode turned the run Untimed");
      await answer(p, false);
      const s3 = await st(p);
      eq([s3.hearts, s3.phase], [null, "retry"], "a wrong answer after calm costs no heart");
      check(await p.$(".arena-out") === null, "no 'last heart' message");
      await p.evaluate(() => window.BMGame.setPref("calm", false));
      await answer(p, true);
      await next(p);
      const s4 = await st(p);
      eq([s4.timed, s4.hearts], [false, null], "switching calm off mid-run does not bring the clock or hearts back");
      await playOut(p);
      const res = await p.evaluate(() => window.BMArena.state().result);
      eq([res.ranked, res.tempo], [false, "untimed"], "the calmed run is scored as untimed");
      check(!(await game(p)).best.standard, "an untimed run keeps no best");
      await context.close();
    }

    /* ---------------------------------------- 4. heart-free: a guess never beats a pass */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html", { "bm.prefs.v1": JSON.stringify({ tempo: "untimed" }) }, true);
      await p.click('[data-act="start"][data-mode="standard"]');
      /* question 1: a guess, then the hint, then right */
      await answer(p, false);
      check(await p.isVisible(".arena-hint"), "a miss shows the hint");
      await answer(p, true);
      const a1 = (await st(p)).ans;
      eq([a1.retry, a1.pts, (await st(p)).score], [true, 0, 0], "a retry after a guess scores nothing without a heart at stake");
      await next(p);
      /* question 2: "I don't know", then the same hint, then right */
      await p.click('.arena-run [data-act="pass"]');
      const s = await st(p);
      eq(s.phase, "retry", "\"I don't know\" without a heart at stake leads to the retry");
      check(await p.isVisible(".arena-hint") && /first a hint/.test(await p.$eval(".arena-feedback", (e) => e.textContent)), "and shows the hint first");
      check(await p.$eval(".arena-feedback", (e) => e.querySelector(".arena-key") === null), "the hint after a pass does not give the answer away");
      await answer(p, true);
      const a2 = (await st(p)).ans;
      eq([a2.retry, a2.pts, (await st(p)).score], [true, 0, 0], "the retry after a pass is worth the same as after a guess");
      await next(p);
      /* question 3: pass, then show the solution */
      await p.click('.arena-run [data-act="pass"]');
      await p.click('.arena-run [data-act="pass"]');
      check(await p.isVisible(".arena-steps[open]"), "the second press shows the worked solution");
      await next(p);
      await playOut(p);
      const res = await p.evaluate(() => window.BMArena.state().result);
      eq(res.xpParts, null, "the game layer paid the run");
      const parts = await p.evaluate(() => { var r = window.BMArena.state(); return r.ans.filter((a) => a.retry && !a.first).map((a) => a.pts); });
      eq(parts, [0, 0], "both second tries scored nothing");
      await p.click('.arena-result [data-act="lobby"]');
      const rulesText = await p.$eval(".arena-rules", (e) => e.textContent);
      check(/never beats passing/.test(rulesText) && /where a heart is at stake a guess is always worse/.test(rulesText), "the lobby rules say what the run does");
      await context.close();

      /* with a heart at stake, the retry still pays 30 and costs a heart */
      const c2 = await ctx(browser);
      const p2 = await open(c2, errors, "arena.html", {}, true);
      await p2.click('[data-act="start"][data-mode="standard"]');
      for (let k = 0; k < 10; k++) {
        const s = await st(p2);
        if (!s.hf) break;
        await p2.click('.arena-run [data-act="pass"]');
        if ((await st(p2)).phase === "retry") await p2.click('.arena-run [data-act="pass"]');
        await next(p2);
      }
      const before = await st(p2);
      await answer(p2, false);
      await answer(p2, true);
      const after = await st(p2);
      eq([after.hearts, after.score - before.score, after.ans.pts], [before.hearts - 1, 30, 30], "with a heart at stake the retry pays 30 after the heart");
      await c2.close();
    }

    /* ---------------------------------------- 5. picks survive a chapter page */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html", {});
      const id = await p.$eval("[data-pick]", (b) => b.getAttribute("data-pick"));
      await p.evaluate((id) => { var b = document.querySelector('[data-pick="' + id + '"]'); b.closest("details").open = true; }, id);
      await p.check('[data-pick="' + id + '"]');
      await p.goto(url(CH05));
      await p.waitForFunction(() => document.readyState === "complete");
      await p.evaluate(() => window.BMGame.updateRun(function (r) { r.combo.pips = 1; }));
      eq((await runStore(p)).picks, { [id]: 1 }, "the run store keeps the picks through game.js writes");
      await p.goto(url("arena.html"));
      check(await p.isChecked('[data-pick="' + id + '"]'), "the section is still ticked in the Arena");
      await context.close();
    }

    /* ---------------------------------------- 6. a rematch before the set is cleared */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html?boss=ch05", {}, true);
      const ctxText = await p.$eval(".arena-context", (e) => e.textContent);
      check(/only raise the medal of a cleared set/.test(ctxText) && !/for Gold/.test(ctxText), "the rematch card says the set must be cleared first");
      check(await p.$('.arena-context a[href$="#practice"]') !== null, "and links to the practice set");
      await p.click('.arena-context [data-act="start"]');
      await playOut(p);
      const r = await p.evaluate(() => { var x = window.BMArena.state().result; return { medal: x.medal, hearts: x.hearts, ranked: x.ranked }; });
      eq(r, { medal: 0, hearts: 3, ranked: true }, "no medal for an uncleared set, all hearts kept");
      const text = await p.$eval(".arena-result", (e) => e.textContent);
      check(/only raise the medal of a cleared set/.test(text) && !/finish with at least one heart/.test(text), "the result names the real reason");
      await context.close();
    }

    /* ---------------------------------------- 7. two tabs pay once */
    {
      const context = await ctx(browser);
      const A = await open(context, errors, "arena.html", {}, true);
      await A.click('[data-act="start"][data-mode="standard"]');
      await answer(A, true); await next(A);
      const B = await page(context, errors);
      await B.goto(url("arena.html"));
      await B.click('[data-act="resume"]');
      check(!!(await st(B)), "tab B resumed the run");
      await playOut(A);
      const paid = await xp(A);
      check(paid > 0, "tab A was paid");
      await wait(300);
      /* B either left the run when A settled it, or refuses to pay on its next move */
      for (let k = 0; k < 12; k++) {
        if (!(await B.$(".arena-run"))) break;
        await answer(B, true);
        if (await B.$('.arena-feedback [data-act="next"]')) await next(B);
      }
      check(await B.$(".arena-result") === null, "tab B shows no second result");
      check(/settled in another tab/.test(await B.$eval(".arena-lobby", (e) => e.textContent)), "tab B says the run was settled elsewhere");
      eq(await xp(B), paid, "the run is paid once");

      /* the same with no storage event: the ledger alone refuses */
      await B.click('[data-act="start"][data-mode="standard"]');
      await answer(B, true); await next(B);
      const x0 = await xp(B);
      await B.evaluate(() => {
        var all = JSON.parse(localStorage.getItem("bm.run.v1")), r = window.BMArena.state();
        all.paid = (all.paid || []).concat([r.id]);
        localStorage.setItem("bm.run.v1", JSON.stringify(all));
      });
      await answer(B, true);
      check(await B.$(".arena-run") === null && /settled in another tab/.test(await B.$eval(".arena-lobby", (e) => e.textContent)), "a run already in the ledger is closed on the next answer");
      const kept = (await runStore(B)).arena;
      eq([await xp(B), kept && kept.ans.filter(Boolean).length], [x0, 1], "and paid nothing, the stored copy not written over");
      await context.close();
    }

    /* ---------------------------------------- 8. Esc, Esc after an answer */
    {
      const context = await ctx(browser);
      const p = await open(context, errors, "arena.html", {}, true);
      await p.click('[data-act="start"][data-mode="standard"]');
      await answer(p, true);
      await p.keyboard.press("Escape");
      eq(await p.evaluate(() => document.activeElement.getAttribute("data-act")), "unpause", "Esc pauses, focus on Resume");
      await p.keyboard.press("Escape");
      eq(await p.evaluate(() => document.activeElement.getAttribute("data-act")), "next", "Esc again resumes with focus on Next");
      await p.keyboard.press("Enter");
      eq((await st(p)).i, 1, "Enter then moves on");
      await context.close();
    }

    /* ---------------------------------------- 9. paused par label contrast */
    {
      const context = await ctx(browser, { scheme: "light" });
      const p = await open(context, errors, "arena.html", {}, true);
      await p.click('[data-act="start"][data-mode="standard"]');
      for (let k = 0; k < 10; k++) {
        if ((await st(p)).timed) break;
        await p.click('.arena-run [data-act="pass"]');
        if ((await st(p)).phase === "retry") await p.click('.arena-run [data-act="pass"]');
        await next(p);
      }
      await p.click('.arena-run [data-act="pause"]');
      const o = await p.evaluate(() => {
        function eff(e) { var o = 1; for (; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; }
        return { label: eff(document.querySelector(".arena-par-label")), text: eff(document.querySelector(".arena-par-text")), track: eff(document.querySelector(".arena-par-track")) };
      });
      eq([o.label, o.text, o.track < 1], [1, 1, true], "paused: the par text is not faded, the bar is");
      await context.close();
    }

    eq(errors, [], "no page errors");
  } finally {
    await browser.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " arena: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
