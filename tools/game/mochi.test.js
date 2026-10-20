#!/usr/bin/env node
/* Headless Chromium checks of Mochi, the 3D companion (src/ui/companion.ts, src/mochi/), with
   SwiftShader WebGL on the built site (dist/, which must be current, served under its _headers):
     node tools/game/mochi.test.js
   1. a chapter page: the still first, then data-3d; the GLB, five textures and three chunks once
      each; nothing from /models/forms/; the canvas hidden from the tree; the still's background
      gone after the fade; 18762 triangles and 33 morphs
   2. the nine moods: setMood returns true, the mood clip reaches full weight and the other eight
      fall to nothing, data-mood and the aria-label name it; an unknown name is refused
   3. back at idle, a variation plays and the idle returns to full weight
   4. reduced motion: no variations, the frames stop, the fade is the longer one
   5. ?3d=off: stays 2d, no GLB and no mochi chunk, the sheet requested
   6. a lost WebGL context: the still comes back, a reason is given, no error, no retry
   7. the lilac pref loads lilac files only; setPref("mochi","pink") swaps with one canvas
   8. pagehide disposes the stage
   9. arena.html: the docked 64 px figure gets the model too
   10. two wrong attempts: sad at once with "Let's look again.", then thinking
   11. throughout: no page errors and no Content Security Policy violations */
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
const CHAPTER = "parts/1-algebra/01-numbers.html";
const MOODS9 = ["idle", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"];
const VARIATIONS = ["idle_look", "idle_stretch", "idle_wiggle"];
const TEXTURES = ["body", "gill", "eye", "pupil", "face"];

let server, browser;
const contexts = [];
const TODAY = (() => { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); })();
const SEEN = JSON.stringify({ seen: { companion: 1, greeted: TODAY } });
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);

async function open(path, extra, opts) {
  opts = opts || {};
  while (contexts.length) await contexts.pop().close().catch(() => {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  contexts.push(context);
  const requests = [], errors = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    requests.push(new URL(u).pathname);
    return r.continue();
  });
  const seed = Object.assign({ "bm.run.v1": SEEN }, extra || {});
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}');
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push("csp: " + m.text()); });
  page.on("requestfailed", (r) => { if (server.owns(r.url())) errors.push("blocked: " + r.url()); });
  await page.goto(server.url + path, { waitUntil: "load" });
  return { context, page, requests, errors };
}
const info = (page) => page.evaluate(() => window.BMCompanion.info());
const threeD = (page, ms) => until(page, () => !!document.querySelector("figure[data-companion]") && document.querySelector("figure[data-companion]").hasAttribute("data-3d"), null, ms || 15000);
const count = (reqs, re) => reqs.filter((u) => re.test(u)).length;
/* true once the stage's frame counter has not moved for `still` ms, looking for at most `ceiling` ms */
async function frozen(page, still, ceiling) {
  let f = -1, n = 0;
  for (let t = 0; t < ceiling && n * 100 < still; t += 100) {
    await wait(100);
    const g = (await info(page)).stage.frames;
    n = g === f ? n + 1 : 0;
    f = g;
  }
  return n * 100 >= still;
}
function noErrors(c, tag) { check(c.errors.length === 0, tag + ": no page errors or CSP violations", c.errors); }

async function main() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  browser = await gl.launch(chromium, {}, true);
  const t0 = Date.now();
  try {
    /* 1 */
    {
      const c = await open(CHAPTER);
      const early = await c.page.evaluate(() => ({ fig: !!document.querySelector("figure.companion[data-companion]"), d3: document.querySelector("figure[data-companion]") && document.querySelector("figure[data-companion]").hasAttribute("data-3d") }));
      check(early.fig, "1: the figure is there at load", early);
      check(await threeD(c.page, 15000), "1: data-3d within 15 s");
      /* the still clears 450 ms after the canvas is ready; polled, since a slow runner stretches that */
      check(await until(c.page, () => getComputedStyle(document.querySelector("figure[data-companion] .companion-pic")).backgroundImage === "none", null, 5000), "1: the still's background clears after the fade");
      const st = await c.page.evaluate(() => ({
        aria: (document.querySelector("canvas.companion-canvas") || { getAttribute: () => null }).getAttribute("aria-hidden"),
        bg: getComputedStyle(document.querySelector("figure[data-companion] .companion-pic")).backgroundImage,
        canvases: document.querySelectorAll("canvas.companion-canvas").length
      }));
      const inf = await info(c.page);
      check(st.aria === "true", "1: the canvas is aria-hidden", st);
      check(st.canvases === 1, "1: one canvas", st);
      check(inf.mode === "3d", "1: mode is 3d", inf);
      check(inf.stage && inf.stage.triangles === 18762 && inf.stage.morphs === 33, "1: 18762 triangles and 33 morphs", inf.stage && [inf.stage.triangles, inf.stage.morphs]);
      const r = c.requests;
      check(count(r, /\/models\/mochi\/mochi-pink\.glb$/) === 1, "1: mochi-pink.glb once", r.filter((u) => /mochi/.test(u)));
      TEXTURES.forEach((t) => check(count(r, new RegExp("/models/mochi/mochi-pink-" + t + "\\.webp$")) === 1, "1: pink " + t + " texture once"));
      ["three", "three-model", "mochi"].forEach((n) => check(count(r, new RegExp("/bundle/" + n + "\\.js$")) === 1, "1: bundle/" + n + ".js once", r.filter((u) => /bundle/.test(u))));
      check(count(r, /\/models\/forms\//) === 0, "1: nothing from /models/forms/");
      noErrors(c, "1");
    }
    /* 2 */
    {
      const c = await open(CHAPTER);
      check(await threeD(c.page), "2: data-3d");
      const names = await c.page.evaluate(() => window.BMCompanion.moods());
      check(JSON.stringify(names) === JSON.stringify(MOODS9), "2: moods() lists the nine", names);
      for (const name of names) {
        const f0 = (await info(c.page)).stage.frames;
        const ok = await c.page.evaluate((n) => window.BMCompanion.setMood(n), name);
        check(ok === true, "2: setMood(" + name + ") is true");
        /* the 0.35 s fade, polled to its end rather than timed: the new clip's weight reads 1 before the first
           frame, so the poll also asks for a few frames and for every other mood clip to have faded out */
        check(await until(c.page, (a) => { const s = window.BMCompanion.info().stage; return s.frames >= a.f + 3 && s.weights[a.n] > 0.95 && a.others.every((m) => s.weights[m] < 0.05); }, { n: name, f: f0, others: MOODS9.filter((m) => m !== name) }, 4000), "2: " + name + " clip at full weight after its fade");
        const inf = await info(c.page);
        const w = inf.stage.weights;
        const others = MOODS9.filter((m) => m !== name);
        check(others.every((m) => w[m] < 0.05), "2: the other mood clips are off during " + name, w);
        check(Object.values(w).filter((v) => v > 0.95).length === 1, "2: exactly one weight above 0.95 during " + name, w);
        const dom = await c.page.evaluate(() => ({ mood: document.querySelector("figure[data-companion]").getAttribute("data-mood"), label: document.querySelector("figure[data-companion] .companion-pic").getAttribute("aria-label") }));
        check(dom.mood === name && dom.label.indexOf(name) >= 0, "2: data-mood and aria-label name " + name, dom);
      }
      await c.page.evaluate(() => window.BMCompanion.setMood("happy"));
      const bad = await c.page.evaluate(() => window.BMCompanion.setMood("nope"));
      await wait(200);
      check(bad === false && (await info(c.page)).mood === "happy", "2: an unknown mood is refused and changes nothing", bad);
      noErrors(c, "2");
    }
    /* 3 */
    {
      const c = await open(CHAPTER);
      check(await threeD(c.page), "3: data-3d");
      const v0 = (await info(c.page)).stage.variations;
      check(await until(c.page, (n) => window.BMCompanion.info().stage.variations > n, v0, 12000), "3: a variation plays within 12 s", v0);
      const inf = await info(c.page);
      check(VARIATIONS.includes(inf.stage.lastVariation), "3: lastVariation names an idle variation", inf.stage.lastVariation);
      /* the variation fades the idle down first; waiting for that dip keeps the return from passing on the pre-fade state */
      check(await until(c.page, () => window.BMCompanion.info().stage.weights.idle < 0.5, null, 3000), "3: the idle dips while the variation plays", (await info(c.page)).stage.weights);
      check(await until(c.page, () => window.BMCompanion.info().stage.weights.idle > 0.9, null, 6000), "3: the idle returns above 0.9 within 6 s", (await info(c.page)).stage.weights);
      noErrors(c, "3");
    }
    /* 4 */
    {
      const c = await open(CHAPTER, { "bm.prefs.v1": JSON.stringify({ motion: "reduce" }) }, { reduced: true });
      check(await threeD(c.page), "4: data-3d");
      const inf = await info(c.page);
      check(inf.stage.reduced === true, "4: reduced", inf.stage);
      await wait(12000);
      check((await info(c.page)).stage.variations === inf.stage.variations, "4: no variation in 12 s", [inf.stage.variations, (await info(c.page)).stage.variations]);
      /* sampled in the page 400 ms after the call, so a slow round trip cannot stretch the wait */
      const w = await c.page.evaluate(() => new Promise((res) => { window.BMCompanion.setMood("happy"); setTimeout(() => res(window.BMCompanion.info().stage.weights), 400); }));
      check(w.happy < 0.9, "4: the fade is longer than 0.35 s (happy at 400 ms)", w);
      check(await frozen(c.page, 600, 3000 + 1500), "4: the frames stop after the fade");
      noErrors(c, "4");
    }
    /* 5 */
    {
      const c = await open(CHAPTER + "?3d=off");
      await wait(3000);
      const st = await c.page.evaluate(() => ({ d3: document.querySelector("figure[data-companion]").hasAttribute("data-3d"), mode: window.BMCompanion.info().mode }));
      check(st.mode === "2d" && !st.d3, "5: 2d with no data-3d after 3 s", st);
      check(count(c.requests, /\.glb$/) === 0 && count(c.requests, /\/bundle\/mochi\.js$/) === 0, "5: no GLB and no mochi chunk", c.requests.filter((u) => /glb|mochi/.test(u)));
      check(count(c.requests, /mochi-pink-poses\.webp$/) >= 1, "5: the sheet is requested");
      noErrors(c, "5");
    }
    /* 6 */
    {
      const c = await open(CHAPTER);
      check(await threeD(c.page), "6: data-3d");
      await c.page.evaluate(() => { document.querySelector(".companion-canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(); });
      check(await until(c.page, () => !document.querySelector("figure[data-companion]").hasAttribute("data-3d"), null, 3000), "6: data-3d goes");
      const st = await c.page.evaluate(() => ({ mode: window.BMCompanion.info().mode, why: window.BMCompanion.info().why, bg: document.querySelector("figure[data-companion] .companion-pic").style.backgroundImage }));
      check(st.mode === "2d", "6: mode is 2d", st);
      check(!!st.why, "6: a reason is given", st);
      check(/mochi-pink-poses\.webp/.test(st.bg), "6: the sheet is the background again", st);
      await wait(3000);
      check(count(c.requests, /\.glb$/) === 1, "6: no second GLB request", c.requests.filter((u) => /glb/.test(u)));
      noErrors(c, "6");
    }
    /* 7 */
    {
      const c = await open(CHAPTER, { "bm.prefs.v1": JSON.stringify({ mochi: "lilac" }) });
      check(await threeD(c.page), "7: data-3d with lilac");
      check(count(c.requests, /mochi-lilac\.glb$/) === 1 && count(c.requests, /mochi-pink\.glb$/) === 0, "7: lilac GLB only", c.requests.filter((u) => /mochi-/.test(u)));
      check(count(c.requests, /mochi-pink-/) === 0, "7: no pink texture or sheet", c.requests.filter((u) => /mochi-pink/.test(u)));
      TEXTURES.forEach((t) => check(count(c.requests, new RegExp("mochi-lilac-" + t + "\\.webp$")) === 1, "7: lilac " + t + " texture once"));
      await c.page.evaluate(() => window.BMGame.setPref("mochi", "pink"));
      check(await until(c.page, () => window.BMCompanion.info().variant === "pink", null, 5000), "7: variant is pink");
      check(await threeD(c.page), "7: data-3d again");
      await wait(500);
      check(count(c.requests, /mochi-pink\.glb$/) === 1, "7: mochi-pink.glb once", c.requests.filter((u) => /glb/.test(u)));
      const n = await c.page.evaluate(() => document.querySelectorAll("figure[data-companion] canvas.companion-canvas").length);
      check(n === 1, "7: one canvas in the figure", n);
      noErrors(c, "7");
    }
    /* 8 */
    {
      const c = await open(CHAPTER);
      check(await threeD(c.page), "8: data-3d");
      await c.page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      check(await until(c.page, () => !document.querySelector("figure[data-companion] canvas.companion-canvas") || window.BMCompanion.info().mode === "2d", null, 1000), "8: the canvas is gone or the mode is 2d");
      noErrors(c, "8");
    }
    /* 9 */
    {
      const c = await open("arena.html");
      check(await threeD(c.page), "9: the docked figure gets data-3d");
      await wait(500);
      const box = await c.page.evaluate(() => { const r = document.querySelector("figure[data-companion] .companion-pic").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      check(box[0] === 64 && box[1] === 64, "9: the picture is 64x64", box);
      check(count(c.requests, /mochi-pink\.glb$/) === 1, "9: GLB once", c.requests.filter((u) => /glb/.test(u)));
      noErrors(c, "9");
    }
    /* 10 */
    {
      const c = await open(CHAPTER);
      check(await threeD(c.page), "10: data-3d");
      const miss = () => c.page.evaluate(() => window.BMStore.emit({ type: "attempt", correct: false, tryNo: 1, key: "e1", chapter: "ch01", hintLevel: 0, solutionOpen: false }));
      await miss();
      await wait(4800);   /* past QUIET_AFTER_VERDICT_MS (4 s, src/learn/mood.ts) after the first verdict, which holds a caption back */
      await miss();
      const sad = await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "sad", null, 2000);
      const line = await c.page.evaluate(() => document.querySelector("figure[data-companion] .companion-line").textContent);
      check(sad, "10: sad at once after the second miss");
      check(line === "Let's look again.", "10: the caption", line);
      check((await info(c.page)).stage.mood === "sad", "10: the stage follows to sad", (await info(c.page)).stage);
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "thinking", null, 2500), "10: thinking within 2.5 s");
      check(await until(c.page, () => window.BMCompanion.info().stage.mood === "thinking", null, 1000), "10: the stage follows to thinking");
      noErrors(c, "10");
    }
  } finally {
    for (const c of contexts) { try { await c.close(); } catch (e) { /* closed already */ } }
    await browser.close();
    await server.close();
  }
  console.log((fails ? "FAILED" : "ok") + " mochi: 11 cases, " + passes + " checks passed" + (fails ? ", " + fails + " failed" : "") + " in " + Math.round((Date.now() - t0) / 1000) + " s");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
