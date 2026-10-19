#!/usr/bin/env node
/* Headless Chromium checks of the avatar's forms: recording an unlock, the toast on every
   page, and the evolution moment on the progress page (src/ui/form-unlock.ts,
   src/ui/forms.ts), with SwiftShader WebGL on the built site (dist/, which must be current):
     node tools/game/forms.test.js
   1. progress page at 300 XP (stage 3): the 3D view, "Stage 3 of 5", all five tiles with
      their rendered PNG (loaded), 4-5 locked and dimmed, the meter, the "Highest" caption
   2. Equip 2: form.wear.n is 2, got unchanged, the tile says Equipped, a reload shows
      Sprig; equipping it again writes nothing
   3. a pending evolution plays anticipate, flash, reveal, done; the new stage's GLB is
      requested before the flash and the model is in after the reveal; the caption;
      seen.evolved is 3; a reload plays nothing
   4. the same under reduced motion: a cut, no animation, the caption at once
   5. Skip jumps to the caption; Escape with no dialog open does the same and counts it played
   6. progress.html?3d=off: the flat card, the PNG strip still showing, no Three.js or GLB request
   7. a chapter page: crossing a stage gives one toast, records got, no Three.js; no
      second toast; none after a reload
   8. several stages at once: one toast naming the highest, all recorded
   9-11. the model arrives, the buttons match the manifest's clips, a drag turns it, frames
      stop at rest; an emote after the idle window on the medium tier plays at full weight
   12. Spin plays (the live region says so) and returns, then the frames stop
   13. under reduced motion: still with no input, Wave plays once, still again
   14. a GLB 404 leaves the drawn figure, hides the emote row, raises no page error
   15. an 11 s GLB falls back at the timeout, then the model swaps in
   16. a lost WebGL context goes flat: the canvas gone, the row hidden
   17. the dialog holds the canvas and the one row; arrows turn, wheel zooms, Escape
      closes with focus back on "View larger" and the zoom reset
   18. a thumbnail 404 shows that tile's pip; the other four load
   19. pagehide disposes the view
   20. progress.html fetches form-model.js, three-model.js and three.js once each
   21. several stages at once end on the highest with no more memory than one */
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
/* the model viewer's files: the GLBs and the model chunks (src/model/index.ts, the three-model vendor chunk) */
const MODEL = /\/models\/forms\/[^?#]*\.glb(?:[?#]|$)|\/bundle\/(?:form-model|three-model)\.js(?:[?#]|$)/;
const CHAPTER = "parts/1-algebra/01-numbers.html";
/* assets/game.js shows cards one at a time, each up for 2600 ms and 400 ms leaving, and
   a form toast queues behind the level card the same XP raised, so it enters the DOM at
   3000 ms; the wait covers that card and a second one */
const CARD_MS = 2600 + 400, TOAST_WAIT = 2 * CARD_MS + 500;

let server, browser;
const contexts = [];

/* today's local day key, as BMSite.dayKey() makes it */
const TODAY = (() => { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); })();
/* the arrival emote plays once a day; every case but the last two has already been greeted today,
   so its "frozen before input" assertions hold. `greet` leaves the day out */
function seeds(xp, extra, greet) {
  const s = Object.assign({ "bm.activity.v1": JSON.stringify({ days: { "2026-10-10": xp } }) }, extra || {});
  const run = JSON.parse(s["bm.run.v1"] || '{"seen":{}}');
  run.seen = run.seen || {};
  if (!greet) run.seen.greeted = TODAY;
  s["bm.run.v1"] = JSON.stringify(run);
  return s;
}

async function open(path, seed, opts) {
  opts = opts || {};
  /* the cases run one after another: a page left over from the last one would keep its
     WebGL context and slow this one's timers (SwiftShader draws on the CPU) */
  while (contexts.length) await contexts.pop().close().catch(() => {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  contexts.push(context);
  const requests = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (THREE.test(u) || MODEL.test(u)) requests.push(u);
    return r.continue();
  });
  /* seeded once per context, on the first load only, so a reload keeps what the page wrote */
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    if (!("bm.guide.v1" in s)) localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}');
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed);
  /* a case's own routes, added after the catch-all so they run first (route.fallback() passes on) */
  if (opts.setup) await opts.setup(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => { if (opts.errors) opts.errors.push(e.message); else check(false, "page error: " + e.message); });
  await page.goto(server.url + path, { waitUntil: "load" });
  return { context, page, requests };
}
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key);
const seqAttr = (page) => page.evaluate(() => { const p = document.querySelector("#form"); return p ? p.getAttribute("data-form-seq") : null; });
const SEED3 = { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 3 } }) };
const GLB = "**/models/forms/form-*.glb";
const PNG = "**/models/forms/form-*.png";
const info = (page) => page.evaluate(() => window.BMForms.info());
/* polls a condition in the page every 100 ms up to ms; true when it held */
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000, polling: 100 }).then(() => true, () => false);
const modelIn = (page) => until(page, () => window.BMForms.info() && window.BMForms.info().model === "model" && window.BMForms.info().state === "3d");
/* true once the frame counter has not moved for `still` ms */
async function frozen(page, still, ceiling) {
  let f = -1, n = 0;
  for (let t = 0; t < (ceiling || 5000) && n * 100 < still; t += 100) {
    await wait(100);
    const g = (await info(page)).frames;
    n = g === f ? n + 1 : 0;
    f = g;
  }
  return n * 100 >= still;
}
const SEED4 = { "bm.run.v1": JSON.stringify({ seen: { form: 4, evolved: 1 } }) };
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
          return {
            state: li.getAttribute("data-state"), locked: li.hasAttribute("data-locked"), tag: li.querySelector(".form-tile-tag").textContent,
            src: img.getAttribute("src") || "", shown: !img.hidden, loaded: img.complete && img.naturalWidth > 0,
            opacity: Number(getComputedStyle(img).opacity)
          };
        }),
        strip: window.BMForms.info().strip,
        now: Number(document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow")),
        seq: document.querySelector("#form").getAttribute("data-form-seq")
      }));
      check(st.view === "3d", "1: the view reaches 3d", st.view);
      check(st.stage === "Stage 3 of 5", "1: stage text", st.stage);
      check(st.tiles.every((t, i) => t.shown && new RegExp("models/forms/form-" + (i + 1) + "\\.png$").test(t.src)), "1: all five tiles carry their PNG", st.tiles);
      /* the file loads lazily: give a slow runner a moment before reading naturalWidth */
      await page.waitForFunction(() => [...document.querySelectorAll(".form-pic img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
      const loaded = await page.evaluate(() => [...document.querySelectorAll(".form-pic img")].map((i) => i.naturalWidth));
      check(loaded.length === 5 && loaded.every((w) => w > 0), "1: every picture has loaded", loaded);
      check(st.tiles.slice(0, 3).every((t) => t.state !== "locked" && !t.locked && t.opacity === 1), "1: tiles 1-3 unlocked at full strength", st.tiles);
      check(st.tiles.slice(3).every((t) => t.state === "locked" && t.locked && t.opacity < 0.5), "1: tiles 4-5 locked and dimmed", st.tiles);
      check(st.strip.length === 5 && st.strip.map((t) => t.locked).join() === "false,false,false,true,true", "1: info().strip reports the locks", st.strip);
      check(st.now > 0 && st.now < 100, "1: meter between 0 and 100", st.now);
      check(/Highest/.test(st.tiles[2].tag), "1: the Highest caption on tile 3", st.tiles[2].tag);
      check(st.seq === null, "1: no sequence when nothing is pending", st.seq);
      /* the real GLB, from dist/: the model replaces the drawn form */
      await page.waitForFunction(() => window.BMForms.info() && window.BMForms.info().model === "model", null, { timeout: 20000 }).catch(() => {});
      const info = await page.evaluate(() => window.BMForms.info());
      check(info && info.model === "model", "1: the model is shown", info);
      const emo = await page.evaluate(() => Array.from(document.querySelectorAll(".form-emotes [data-emote]")).map((b) => ({ e: b.getAttribute("data-emote"), dis: b.getAttribute("aria-disabled") })));
      /* the generated manifest (src/data/form-models.ts) says whether stage 3's file has clips */
      const man = require("fs").readFileSync(require("path").join(site.ROOT, "src/data/form-models.ts"), "utf8");
      const m3 = /n: 3,[^\n]*?clips: \[([^\]]*)\]/.exec(man);
      const clips = m3 ? m3[1].split(",").filter((c) => c.trim()).length : -1;
      check(emo.length === 4 && emo.map((b) => b.e).join() === "wave,bow,flex,spin", "1: four emote buttons", emo);
      if (clips >= 0) check(emo.every((b) => b.dis === (clips > 0 ? "false" : "true")), "1: the emotes are enabled as the manifest lists clips", [clips, emo]);
      const label = await page.getAttribute(".form-stage", "aria-label");
      check(/^Wayfinder, your form, stage 3 of 5\./.test(label || ""), "1: the stage is named", label);
      const yaw0 = info ? info.yaw : 0;
      const bb = await page.locator(".form-stage").boundingBox();
      const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 120, y, { steps: 6 });
      await page.mouse.up();
      await wait(300);
      const after = await page.evaluate(() => window.BMForms.info());
      check(after && Math.abs(after.yaw - yaw0) > 0.5, "1: a drag turns the form", [yaw0, after && after.yaw]);
      /* at rest the loop stops: no frames while nothing moves */
      /* the frame counter stops: poll until it has not changed for 1 s */
      let f1 = -1, f2 = -2, still1 = 0;
      for (let i = 0; i < 40 && still1 < 4; i++) {
        await wait(250);
        f2 = (await page.evaluate(() => window.BMForms.info())).frames;
        still1 = f2 === f1 ? still1 + 1 : 0;
        f1 = f2;
      }
      console.log("frames at rest: " + f1 + " (steady for " + still1 * 250 + " ms); info " + JSON.stringify(after));
      check(still1 >= 4, "1: no frames at rest", [f1, f2]);
    }
    /* 1b: on the mid tier, an emote pressed long after the last wake plays at full strength (the idle does not run over it) */
    {
      const { page } = await open("progress.html", seeds(300, { "bm.run.v1": JSON.stringify({ seen: { form: 3, evolved: 3 } }), "bm.prefs.v1": JSON.stringify({ gfx: "mid" }) }));
      await page.waitForFunction(() => window.BMForms.info() && window.BMForms.info().model === "model", null, { timeout: 20000 }).catch(() => {});
      await wait(6500);   /* past AMBIENT_MS with no input */
      const before = await page.evaluate(() => window.BMForms.info());
      check(before && before.model === "model" && Object.keys(before.clips).length > 0, "1b: the model has clips", before);
      await page.evaluate(() => document.querySelector('[data-emote="wave"]').click());
      await wait(500);
      const mid = await page.evaluate(() => window.BMForms.info());
      check(mid.clips.wave === 1 && mid.clips.idle === 0, "1b: the wave runs at weight 1 and the idle at 0", mid.clips);
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
      const { page, requests } = await open("progress.html", seeds(300, PENDING));
      /* the next stage's GLB is asked for at the anticipation, so it is in before the white-out */
      await page.waitForSelector('#form[data-form-seq="flash"]', { timeout: 6000 }).catch(() => {});
      check(requests.some((u) => /models\/forms\/form-3\.glb/.test(u)), "3: form-3.glb requested by the flash", requests);
      /* the panel logs every step it passes (data-form-seq-log), so the path is read whole rather than sampled */
      await page.waitForSelector('#form[data-form-seq="done"]', { timeout: 6000 }).catch(() => {});
      const log = (await page.evaluate(() => (document.querySelector("#form") || { getAttribute: () => "" }).getAttribute("data-form-seq-log"))) || "";
      await page.waitForSelector('[data-form-view][data-model="model"]', { timeout: 20000 }).catch(() => {});
      check((await page.getAttribute("[data-form-view]", "data-model")) === "model", "3: the model is in after the reveal");
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
        pics: [1, 2, 3, 4, 5].map((n) => { const i = document.querySelector('.form-tile[data-stage="' + n + '"] img'); return !i.hidden && i.complete && i.naturalWidth > 0; })
      }));
      check(st.view === "flat", "6: the view is flat", st.view);
      check(st.pip === "3", "6: the card shows 3", st.pip);
      check(st.pics.every(Boolean), "6: the tiles show the PNG strip", st.pics);
      check(requests.length === 0, "6: no Three.js or model request", requests);
    }
    /* 7 */
    {
      const { page, requests } = await open(CHAPTER, seeds(50, { "bm.run.v1": JSON.stringify({ seen: { form: 1, evolved: 1 } }) }));
      await wait(500);
      await page.evaluate(() => window.BMActivity.add(20, "test"));
      let timedOut = false;
      await page.waitForSelector(".toast.form", { timeout: TOAST_WAIT }).catch(() => { timedOut = true; });
      const t = await page.evaluate(() => Array.from(document.querySelectorAll(".toast.form")).map((e) => e.textContent));
      check(t.length === 1 && /Sprig/.test(t[0]), "7: one toast naming Sprig", timedOut ? "toast did not appear within " + TOAST_WAIT + " ms; " + JSON.stringify(t) : t);
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
      await page.waitForSelector(".toast.form", { timeout: TOAST_WAIT }).catch(() => { timedOut = true; });
      /* fixed wait on purpose: it gives a second toast time to appear, since the check is for exactly one */
      await wait(300);
      const t = await page.evaluate(() => Array.from(document.querySelectorAll(".toast.form")).map((e) => e.textContent));
      check(t.length === 1 && /Surveyor/.test(t[0]), "8: one toast naming Surveyor", timedOut ? "toast did not appear within " + TOAST_WAIT + " ms; " + JSON.stringify(t) : t);
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
    /* 12: Spin plays and returns */
    {
      const { page } = await open("progress.html", seeds(300, SEED3));
      check(await modelIn(page), "12: the model arrives");
      await frozen(page, 1000, 8000);
      await page.evaluate(() => document.querySelector('[data-emote="spin"]').click());
      check(await until(page, () => !!document.querySelector('[data-emote="spin"][data-playing]'), null, 3000), "12: Spin is marked playing");
      const said = await page.evaluate(() => (document.querySelector(".form-emotes [aria-live]") || {}).textContent);
      check(said === "Playing: Spin", "12: the live region names it", said);
      check(await until(page, () => !document.querySelector("[data-emote][data-playing]"), null, 6000), "12: data-playing clears");
      const left = await page.evaluate(() => (document.querySelector(".form-emotes [aria-live]") || {}).textContent);
      check(left === "", "12: the live region is empty again", left);
      check(await frozen(page, 500, 5000), "12: frames stop after the emote");
    }
    /* 13: an emote under reduced motion */
    {
      const { page } = await open("progress.html", seeds(300, Object.assign({ "bm.prefs.v1": JSON.stringify({ motion: "reduce" }) }, SEED3)), { reduced: true });
      check(await modelIn(page), "13: the model arrives");
      check(await frozen(page, 1500, 8000), "13: no frames with no input");
      const f0 = (await info(page)).frames;
      await page.evaluate(() => document.querySelector('[data-emote="wave"]').click());
      check(await until(page, () => !!document.querySelector('[data-emote="wave"][data-playing]'), null, 3000), "13: Wave is marked playing");
      check(await until(page, (n) => window.BMForms.info().frames > n, f0, 3000), "13: frames rise while it plays");
      check(await until(page, () => !document.querySelector("[data-emote][data-playing]"), null, 6000), "13: the emote ends");
      check(await frozen(page, 1000, 6000), "13: frames stop again");
    }
    /* 14: the GLB is missing: the drawn form stays */
    {
      const errors = [];
      const { page } = await open("progress.html", seeds(300, SEED3), { errors, setup: (c) => c.route(GLB, (r) => r.abort()) });
      check(await until(page, () => document.querySelector("[data-form-view]").getAttribute("data-model") === "fallback"), "14: data-model is fallback");
      const st = await page.evaluate(() => ({
        state: document.querySelector("[data-form-view]").getAttribute("data-state"),
        row: !!document.querySelector(".form-emotes") && document.querySelector(".form-emotes").hidden
      }));
      check(st.state === "3d", "14: the toon figure stays in the 3d box", st);
      check(st.row === true, "14: the emote row is hidden", st);
      check(errors.length === 0, "14: no uncaught page error", errors);
    }
    /* 15: a slow GLB: the drawn form first, the model swaps in later */
    {
      const fs = require("fs"), path = require("path");
      const t0 = Date.now();
      const { page } = await open("progress.html", seeds(300, SEED3), {
        setup: (c) => c.route(GLB, async (r) => {
          const file = path.join(site.ROOT, "dist", "models", "forms", path.basename(new URL(r.request().url()).pathname));
          await wait(11000);
          await r.fulfill({ status: 200, contentType: "model/gltf-binary", body: fs.readFileSync(file) }).catch(() => {});
        })
      });
      const fb = await until(page, () => document.querySelector("[data-form-view]").getAttribute("data-model") === "fallback", null, 14000);
      const tFb = Date.now() - t0;
      check(fb, "15: the view shows the drawn form after the timeout", tFb);
      const mid = await page.evaluate(() => ({ st: document.querySelector("[data-form-view]").getAttribute("data-state"), row: document.querySelector(".form-emotes").hidden }));
      check(mid.st === "3d" && mid.row === true, "15: the toon figure shows and the row is hidden", mid);
      check(await modelIn(page), "15: the model swaps in later");
      const row = await page.evaluate(() => ({ hidden: document.querySelector(".form-emotes").hidden, dis: [...document.querySelectorAll("[data-emote]")].map((b) => b.getAttribute("aria-disabled")) }));
      check(row.hidden === false && row.dis.every((d) => d === "false"), "15: the row is back and the buttons enabled", row);
    }
    /* 16: a lost WebGL context leaves the box flat */
    {
      const { page } = await open("progress.html", seeds(300, SEED3));
      check(await modelIn(page), "16: the model arrives");
      await page.evaluate(() => { document.querySelector("canvas.form-canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(); });
      check(await until(page, () => document.querySelector("[data-form-view]").getAttribute("data-state") === "flat", null, 10000), "16: the box goes flat");
      const st = await page.evaluate(() => ({ canvas: !!document.querySelector("canvas.form-canvas"), row: document.querySelector(".form-emotes").hidden }));
      check(!st.canvas && st.row === true, "16: the canvas is gone and the row hidden", st);
    }
    /* 17: the dialog takes the canvas and the row, and gives them back */
    {
      const { page } = await open("progress.html", seeds(300, SEED3));
      check(await modelIn(page), "17: the model arrives");
      await page.click("[data-form-large]");
      check(await until(page, () => { const d = document.querySelector("dialog.form-dialog"); return !!d && d.open && !!d.querySelector("canvas.form-canvas") && !!d.querySelector(".form-emotes"); }, null, 5000), "17: the dialog holds the canvas and the row");
      check((await page.evaluate(() => document.querySelectorAll(".form-emotes").length)) === 1, "17: one row in the document");
      const y0 = (await info(page)).yaw;
      await page.focus("dialog .form-stage");
      await page.keyboard.press("ArrowRight");
      check(await until(page, (y) => window.BMForms.info().yaw !== y, y0, 3000), "17: ArrowRight turns the form", y0);
      const bb = await page.locator("dialog .form-stage").boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.wheel(0, -300);
      check(await until(page, () => window.BMForms.info().zoom !== 1, null, 3000), "17: the wheel zooms", (await info(page)).zoom);
      await page.keyboard.press("Escape");
      check(await until(page, () => !document.querySelector("dialog.form-dialog").open, null, 3000), "17: Escape closes the dialog");
      /* the close event runs after the dialog's open flag clears: wait for the canvas to be home */
      await until(page, () => !!document.querySelector("#form .form-view canvas.form-canvas"), null, 3000);
      const back = await page.evaluate(() => ({
        focus: document.activeElement && document.activeElement.hasAttribute("data-form-large"),
        canvas: !!document.querySelector("#form .form-view canvas.form-canvas"),
        row: !!document.querySelector("#form [data-form-emotes] .form-emotes"),
        rows: document.querySelectorAll(".form-emotes").length,
        zoom: window.BMForms.info().zoom
      }));
      check(back.focus, "17: focus returns to View larger", back);
      check(back.canvas && back.row && back.rows === 1, "17: the canvas and the row are home", back);
      check(back.zoom === 1, "17: zoom is 1 again", back);
    }
    /* 18: one thumbnail is missing */
    {
      const { page } = await open("progress.html", seeds(300, SEED3), { setup: (c) => c.route(/form-2\.png/, (r) => r.abort()) });
      check(await until(page, () => { const t = document.querySelector('.form-tile[data-stage="2"]'); return !!t && t.querySelector("img").hidden && !t.querySelector(".form-pip").hidden; }), "18: the tile shows its pip and hides the picture");
      check(await until(page, () => [1, 3, 4, 5].every((n) => { const i = document.querySelector('.form-tile[data-stage="' + n + '"] img'); return !i.hidden && i.complete && i.naturalWidth > 0; })), "18: the other four load");
    }
    /* 19: pagehide frees the view */
    {
      const { page } = await open("progress.html", seeds(300, SEED3));
      check(await modelIn(page), "19: the model arrives");
      const before = await info(page);
      check(before.memory && before.memory.geometries > 0 && before.disposed === false, "19: memory is held while shown", before);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
      const gone = await until(page, () => window.BMForms.info().disposed === true, null, 3000);
      const after = await info(page);
      check(gone && after.memory === null && !(await page.evaluate(() => !!document.querySelector("canvas.form-canvas"))), "19: disposed, no renderer, no canvas", after);
    }
    /* 20: the progress page fetches the model chunks and one Three.js */
    {
      const { page, requests } = await open("progress.html", seeds(300, SEED3));
      check(await modelIn(page), "20: the model arrives");
      const n = (re) => requests.filter((u) => re.test(u)).length;
      check(n(/\/bundle\/form-model\.js/) === 1 && n(/\/bundle\/three-model\.js/) === 1 && n(THREE) === 1, "20: form-model, three-model and exactly one three.js", requests);
    }
    /* 21: several stages at once end on the highest, and eviction keeps memory down */
    {
      const { page } = await open("progress.html", seeds(700, SEED4));
      check(await until(page, () => document.querySelector("#form").getAttribute("data-form-seq") === "done" || !!document.querySelector("#form .form-caption"), null, 10000), "21: the sequence finishes");
      check(await modelIn(page), "21: the model arrives");
      check(await until(page, () => window.BMForms.info().stage === 4), "21: the model is stage 4", (await info(page)).stage);
      await frozen(page, 500, 8000);
      const multi = (await info(page)).memory;
      const { page: p2 } = await open("progress.html", seeds(700, { "bm.run.v1": JSON.stringify({ seen: { form: 4, evolved: 4 } }) }));
      check(await modelIn(p2), "21: the single-stage page's model arrives");
      check(await until(p2, () => window.BMForms.info().stage === 4), "21: it shows stage 4");
      await frozen(p2, 500, 8000);
      const single = (await info(p2)).memory;
      check(multi && single && multi.geometries <= single.geometries && multi.textures <= single.textures, "21: memory is no higher than after one stage", [multi, single]);
    }
    /* 22: the arrival emote, once a day */
    {
      const { page } = await open("progress.html", seeds(300, SEED3, true));
      check(await until(page, () => (document.querySelector('[data-f="mood"]') || {}).textContent === "Good to see you.", null, 5000), "22: the mood line greets");
      check(await page.evaluate(() => document.querySelector("#form").getAttribute("data-mood")) === "sleepy", "22: the panel is sleepy");
      check(await modelIn(page), "22: the model arrives");
      check(await until(page, () => !!document.querySelector('[data-emote="bow"][data-playing]'), null, 3000), "22: a bow plays");
      check(await until(page, (d) => { const r = JSON.parse(localStorage.getItem("bm.run.v1") || "{}"); return r.seen && r.seen.greeted === d; }, TODAY, 3000), "22: greeted is today");
      await page.reload({ waitUntil: "load" });
      check(await modelIn(page), "22: the model arrives again");
      check(await frozen(page, 1500, 8000), "22: no emote on the reload, frames stop");
      check(await page.evaluate(() => !document.querySelector("[data-emote][data-playing]")), "22: nothing playing");
    }
    /* 23: reduced motion: the line shows, no emote, the day is not written */
    {
      const { page } = await open("progress.html", seeds(300, SEED3, true), { reduced: true });
      check(await until(page, () => (document.querySelector('[data-f="mood"]') || {}).textContent === "Good to see you.", null, 5000), "23: the mood line shows");
      check(await modelIn(page), "23: the model arrives");
      check(await frozen(page, 1500, 8000), "23: frames stop");
      check(await page.evaluate(() => !document.querySelector("[data-emote][data-playing]")), "23: no emote plays");
      const run = await store(page, "bm.run.v1");
      check(!(run && run.seen && run.seen.greeted), "23: greeted is not written", run && run.seen);
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
