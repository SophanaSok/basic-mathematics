#!/usr/bin/env node
/* Headless Chromium checks of the avatar's forms: recording an unlock, the toast on every
   page, and the evolution moment on the progress page (src/ui/form-unlock.ts,
   src/ui/forms.ts), with SwiftShader WebGL on the built site (dist/, which must be current):
     node tools/game/forms.test.js
   1. progress page at 300 XP (stage 3): the 3D view, "Stage 3 of 5", tiles 1-3 with
      pictures, 4-5 locked, the meter, the "Highest" caption
   2. Equip 2: form.wear.n is 2, got unchanged, the tile says Equipped, a reload shows
      Sprig; equipping it again writes nothing
   3. a pending evolution plays anticipate, flash, reveal, done; the caption; seen.evolved
      is 3; a reload plays nothing
   4. the same under reduced motion: a cut, no animation, the caption at once
   5. Skip jumps to the caption; Escape with no dialog open does the same and counts it played
   6. progress.html?3d=off: the flat card, pips on the tiles, no Three.js request
   7. a chapter page: crossing a stage gives one toast, records got, no Three.js; no
      second toast; none after a reload
   8. several stages at once: one toast naming the highest, all recorded */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();
const gl = require("../lib/gl");

let fails = 0, passes = 0;
function check(cond, what, detail) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what + (detail === undefined ? "" : " (" + JSON.stringify(detail) + ")")); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const THREE = /\/bundle\/three\.js(?:[?#]|$)/;
const CHAPTER = "parts/1-algebra/01-numbers.html";

let server, browser;
const contexts = [];

function seeds(xp, extra) {
  const s = Object.assign({ "bm.activity.v1": JSON.stringify({ days: { "2026-10-10": xp } }) }, extra || {});
  return s;
}

async function open(path, seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  contexts.push(context);
  const requests = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (THREE.test(u)) requests.push(u);
    return r.continue();
  });
  /* seeded once per context, on the first load only, so a reload keeps what the page wrote */
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed);
  const page = await context.newPage();
  page.on("pageerror", (e) => check(false, "page error: " + e.message));
  await page.goto(server.url + path, { waitUntil: "load" });
  return { context, page, requests };
}
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key);
const seqAttr = (page) => page.evaluate(() => { const p = document.querySelector("#form"); return p ? p.getAttribute("data-form-seq") : null; });
const PENDING = { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 1 } }) };

async function main() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  browser = await gl.launch(chromium, {}, true);
  try {
    /* 1 */
    {
      const { page } = await open("progress.html", seeds(300, { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 3 } }) }));
      await page.waitForSelector('[data-form-view][data-state="3d"]', { timeout: 20000 }).catch(() => {});
      const st = await page.evaluate(() => ({
        view: document.querySelector("[data-form-view]").getAttribute("data-state"),
        stage: document.querySelector('[data-f="stage"]').textContent,
        tiles: [1, 2, 3, 4, 5].map((n) => {
          const li = document.querySelector('.form-tile[data-stage="' + n + '"]');
          const img = li.querySelector("img");
          return { state: li.getAttribute("data-state"), pic: !img.hidden && !!img.getAttribute("src"), tag: li.querySelector(".form-tile-tag").textContent };
        }),
        now: Number(document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")),
        seq: document.querySelector("#form").getAttribute("data-form-seq")
      }));
      check(st.view === "3d", "1: the view reaches 3d", st.view);
      check(st.stage === "Stage 3 of 5", "1: stage text", st.stage);
      check(st.tiles.slice(0, 3).every((t) => t.state !== "locked" && t.pic), "1: tiles 1-3 unlocked with pictures", st.tiles);
      check(st.tiles.slice(3).every((t) => t.state === "locked" && !t.pic), "1: tiles 4-5 locked", st.tiles);
      check(st.now > 0 && st.now < 100, "1: meter between 0 and 100", st.now);
      check(/Highest/.test(st.tiles[2].tag), "1: the Highest caption on tile 3", st.tiles[2].tag);
      check(st.seq === null, "1: no sequence when nothing is pending", st.seq);
    }
    /* 2 */
    {
      const seed = seeds(300, { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 3 } }) });
      const { page } = await open("progress.html", seed);
      await page.waitForSelector('.form-tile[data-stage="2"] [data-equip]:not([hidden])');
      const before = await store(page, "bm.game.v1");
      await page.click('[data-equip="2"]');
      await wait(200);
      const after = await store(page, "bm.game.v1");
      check(after.form.wear.n === 2, "2: wear.n is 2", after.form);
      check(JSON.stringify(after.form.got) === JSON.stringify(before.form.got), "2: got unchanged", [before.form.got, after.form.got]);
      const tag = await page.textContent('.form-tile[data-stage="2"] .form-tile-tag');
      check(tag === "Equipped", "2: the tile says Equipped", tag);
      const at = after.form.wear.at;
      await page.click('[data-equip="2"]');
      await wait(100);
      const again = await store(page, "bm.game.v1");
      check(again.form.wear.at === at, "2: equipping again writes nothing", [at, again.form.wear.at]);
      await page.reload({ waitUntil: "load" });
      await wait(300);
      const name = await page.textContent('#form [data-f="name"]');
      check(name === "Sprig", "2: after a reload the view shows stage 2", name);
    }
    /* 3 */
    {
      const { page } = await open("progress.html", seeds(300, PENDING));
      /* the panel logs every step it passes (data-form-seq-log), so the path is read whole rather than sampled */
      await page.waitForSelector('#form[data-form-seq="done"]', { timeout: 6000 }).catch(() => {});
      const log = (await page.evaluate(() => (document.querySelector("#form") || { getAttribute: () => "" }).getAttribute("data-form-seq-log"))) || "";
      check(log === "anticipate flash reveal done", "3: the sequence passes through every step", log);
      const cap = await page.textContent("#form .form-caption").catch(() => "");
      check(cap === "Evolved: Wayfinder. Stages 2 and 3 unlocked.", "3: the caption names both stages since the last played", cap);
      const run = await store(page, "bm.run.v1");
      check(run.seen.evolved === 3, "3: seen.evolved is 3", run.seen);
      await page.click("[data-form-done]");
      check((await seqAttr(page)) === null, "3: Done removes the sequence");
      await page.reload({ waitUntil: "load" });
      await wait(1500);
      check((await seqAttr(page)) === null, "3: a reload plays nothing");
    }
    /* 4 */
    {
      const { page } = await open("progress.html", seeds(300, Object.assign({ "bm.prefs.v1": JSON.stringify({ motion: "reduce" }) }, PENDING)), { reduced: true });
      await page.waitForSelector("#form .form-caption", { timeout: 200 }).catch(() => {});
      const st = await page.evaluate(() => ({ cap: (document.querySelector("#form .form-caption") || {}).textContent, anims: document.getAnimations().length }));
      check(st.cap === "Evolved: Wayfinder. Stages 2 and 3 unlocked.", "4: the caption is there at once", st.cap);
      check(st.anims === 0, "4: no animation runs", st.anims);
      const run = await store(page, "bm.run.v1");
      check(run.seen.evolved === 3, "4: seen.evolved is 3", run.seen);
    }
    /* 5 */
    {
      const { page } = await open("progress.html", seeds(300, PENDING));
      await page.waitForSelector('#form[data-form-seq="anticipate"]', { timeout: 5000 }).catch(() => {});
      await page.click("[data-form-skip]");
      await page.waitForSelector("#form .form-caption", { timeout: 300 }).catch(() => {});
      const cap = await page.textContent("#form .form-caption").catch(() => "");
      check(/^Evolved: Wayfinder/.test(cap), "5: Skip shows the caption at once", cap);
    }
    /* 5b: Escape, with no dialog open, does what Skip does; a reload then plays nothing */
    {
      const { page } = await open("progress.html", seeds(300, PENDING));
      await page.waitForSelector('#form[data-form-seq="anticipate"]', { timeout: 5000 }).catch(() => {});
      await page.keyboard.press("Escape");
      await page.waitForSelector("#form .form-caption", { timeout: 300 }).catch(() => {});
      const cap = await page.textContent("#form .form-caption").catch(() => "");
      check(/^Evolved: Wayfinder/.test(cap), "5b: Escape shows the caption at once", cap);
      const run = await page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1") || "{}"));
      check(run.seen && run.seen.evolved === 3, "5b: Escape counts the evolution as played", run.seen);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("#form[data-form-seq]", { timeout: 1500 }).catch(() => {});
      check((await seqAttr(page)) === null, "5b: a reload plays nothing");
    }
    /* 6 */
    {
      const { page, requests } = await open("progress.html?3d=off", seeds(300, { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 3 } }) }));
      await wait(1500);
      const st = await page.evaluate(() => ({
        view: document.querySelector("[data-form-view]").getAttribute("data-state"),
        pip: document.querySelector(".form-view .form-fallback [data-f=pip]").textContent,
        pips: [1, 2, 3].every((n) => !document.querySelector('.form-tile[data-stage="' + n + '"] .form-pip').hidden)
      }));
      check(st.view === "flat", "6: the view is flat", st.view);
      check(st.pip === "3", "6: the card shows 3", st.pip);
      check(st.pips, "6: the tiles show pips");
      check(requests.length === 0, "6: no Three.js request", requests);
    }
    /* 7 */
    {
      const { page, requests } = await open(CHAPTER, seeds(50, { "bm.run.v1": JSON.stringify({ seen: { form: 1, evolved: 1 } }) }));
      await wait(500);
      await page.evaluate(() => window.BMActivity.add(20, "test"));
      let timedOut = false;
      await page.waitForSelector(".toast.form", { timeout: 3000 }).catch(() => { timedOut = true; });
      const t = await page.evaluate(() => Array.from(document.querySelectorAll(".toast.form")).map((e) => e.textContent));
      check(t.length === 1 && /Sprig/.test(t[0]), "7: one toast naming Sprig", timedOut ? "toast did not appear within 3000 ms; " + JSON.stringify(t) : t);
      const game = await store(page, "bm.game.v1");
      check(game.form && game.form.got["2"] > 0, "7: got[2] is recorded", game.form);
      const run = await store(page, "bm.run.v1");
      check(run.seen.form === 2, "7: seen.form is 2", run.seen);
      check(requests.length === 0, "7: no Three.js on a chapter page", requests);
      await page.evaluate(() => window.BMActivity.add(5, "test"));
      /* fixed wait on purpose: it asserts the absence of a second toast, which needs time to pass */
      await wait(600);
      const n2 = await page.evaluate(() => document.querySelectorAll(".toast.form").length);
      check(n2 === 1, "7: no second toast", n2);
      await page.reload({ waitUntil: "load" });
      /* fixed wait on purpose: it asserts the absence of a toast after the reload */
      await wait(1000);
      const n3 = await page.evaluate(() => document.querySelectorAll(".toast.form").length);
      check(n3 === 0, "7: no toast after a reload", n3);
    }
    /* 8 */
    {
      const { page } = await open(CHAPTER, seeds(50, { "bm.run.v1": JSON.stringify({ seen: { form: 1, evolved: 1 } }) }));
      await wait(500);
      await page.evaluate(() => window.BMActivity.add(600, "test"));
      let timedOut = false;
      await page.waitForSelector(".toast.form", { timeout: 3000 }).catch(() => { timedOut = true; });
      /* fixed wait on purpose: it gives a second toast time to appear, since the check is for exactly one */
      await wait(300);
      const t = await page.evaluate(() => Array.from(document.querySelectorAll(".toast.form")).map((e) => e.textContent));
      check(t.length === 1 && /Surveyor/.test(t[0]), "8: one toast naming Surveyor", timedOut ? "toast did not appear within 3000 ms; " + JSON.stringify(t) : t);
      const game = await store(page, "bm.game.v1");
      const got = (game.form && game.form.got) || {};
      check(["2", "3", "4"].every((k) => got[k] > 0), "8: stages 2, 3 and 4 recorded", got);
      /* a sync (account.js emits one on every load for a signed-in learner) leaves the
         evolution owed: seen.evolved stays where it was */
      await page.evaluate(() => window.BMStore.emit({ type: "sync" }));
      await wait(200);
      const run = await store(page, "bm.run.v1");
      check(run.seen.form === 4 && run.seen.evolved === 1, "8: a sync keeps the evolution pending", run.seen);
    }
    /* 9: the stages unlocked elsewhere play on the progress page, named together */
    {
      const { page } = await open("progress.html", seeds(700, { "bm.run.v1": JSON.stringify({ seen: { form: 4, evolved: 1 } }) }));
      await page.waitForSelector('#form[data-form-seq="done"]', { timeout: 6000 }).catch(() => {});
      const cap = await page.textContent("#form .form-caption").catch(() => "");
      check(cap === "Evolved: Surveyor. Stages 2 to 4 unlocked.", "9: the caption names the stages since the last played", cap);
      const run = await store(page, "bm.run.v1");
      check(run.seen.evolved === 4, "9: seen.evolved is 4", run.seen);
    }
    /* 10: a first load with progress past stage 1 and no seen: recorded, quiet, nothing plays */
    {
      const { page } = await open("progress.html", seeds(300, {}));
      await wait(1500);
      const game = await store(page, "bm.game.v1"), run = await store(page, "bm.run.v1");
      const got = (game && game.form && game.form.got) || {};
      check(got["2"] > 0 && got["3"] > 0 && !("1" in got), "10: stages 2 and 3 recorded, never 1", got);
      check(run.seen.form === 3 && run.seen.evolved === 3, "10: seen.form and seen.evolved are 3", run.seen);
      check((await seqAttr(page)) === null, "10: no sequence on a first load");
      const toasts = await page.evaluate(() => document.querySelectorAll(".toast.form").length);
      check(toasts === 0, "10: no toast on a first load", toasts);
    }
    /* 11: a fresh visit writes nothing to the game store */
    {
      const { page } = await open("progress.html", {});
      await wait(1200);
      const game = await store(page, "bm.game.v1");
      check(game === null || !game.form, "11: a first visit records no form", game && game.form);
    }
  } finally {
    for (const c of contexts) { try { await c.close(); } catch (e) { /* closed already */ } }
    await browser.close();
    await server.close();
  }
  console.log("forms: " + passes + " passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
