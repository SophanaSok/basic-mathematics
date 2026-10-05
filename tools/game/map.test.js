#!/usr/bin/env node
/* Headless Chromium checks of the course world on the contents page (assets/map3d.js
   and src/world/), and of the Three.js loader (assets/three-loader.js), with SwiftShader
   WebGL, on the built site as lib/target.js serves it (dist/, which must be current):
     node tools/game/map.test.js
   Three.js and the world are the site's own chunks, bundle/three.js and bundle/world.js,
   which the page imports on demand; every request off the local server is aborted, so
   nothing here depends on a CDN or a download.

   SwiftShader is a software renderer, so the device's own tier here is low, which has
   no idle motion (src/world/tiers.ts); the checks of idle motion choose Medium in the
   settings first (bm.prefs.v1 gfx "mid"), as a learner can.

   1. idle motion ends: on Medium the marker bobs (and the props move) for AMBIENT_MS
      after the world appears or the camera settles, to the end of the bob, and then an
      idle page asks for no frames; never under Study mode or reduced motion, and never
      on the low tier
   2. a frame held while the tab is hidden, or a long task, does not tear the world down
   3. an island acts like its list link: Ctrl+click and middle click open a new tab, a press
      (either button) on empty ground dragged onto an island and released opens nothing
   4. the loader: the page asks for the Three.js chunk once and only after the map has
      asked for it; when that request fails, load() says false with the reason "cdn" and
      the list stands alone; when it stalls past the loader's timeout, the reason is
      "timeout"; neither case leaves a THREE behind, and nothing is on window.THREE
   5. the tiers: the device's own tier here is low (a software renderer); each tier
      chosen in the settings is drawn within its budget of draw calls, triangles and
      pixel ratio (TIERS, read through BMMap3D.info().budget), far below the 109 draw
      calls the course map took before the world; the frame times of a flight are
      printed for each tier; with the 3D map switch off neither chunk is fetched
   6. the watchdog: with every frame 60 ms apart, the world steps down a tier (medium to
      low), keeps the tier it settled on in bm.prefs.v1 gfxAuto, starts there on the next
      visit, then gives the list back with the reason "slow" and keeps that too
   7. the keyboard: the canvas is aria-hidden and out of the tab order; Tab reaches the
      Part buttons, Enter flies to a Part, and focusing a chapter in the list flies to its
      island and marks it */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const WORLD_CHUNK = /\/bundle\/world\.js(?:[?#]|$)/;
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
/* the constants these checks wait on, read from their files, so a changed value shows here */
const read = (f) => fs.readFileSync(path.join(site.ROOT, f), "utf8");
const TIMEOUT = +read("assets/three-loader.js").match(/var TIMEOUT = (\d+);/)[1];
const AMBIENT_MS = +read("src/world/tiers.ts").match(/export const AMBIENT_MS = (\d+);/)[1];
const BOB_MS = +read("assets/map3d.js").match(/var BOB_MS = (\d+);/)[1];
const SAMPLES = +read("src/world/tiers.ts").match(/export const SAMPLES = (\d+);/)[1];
/* the draw calls of the course map before the world (BMMap3D.info().calls at rest, 1280 wide) */
const CALLS_BEFORE = 109;
const MEDIUM = { "bm.prefs.v1": '{"gfx":"mid"}' };

let server;
const url = (p) => server.url + p;
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* counts requestAnimationFrame calls; with __hide set, callbacks are held (as Chrome holds
   them for a hidden tab) and run on return with the current timestamp; with __slow set,
   each callback is handed a timestamp 60 ms after the last, as on a device that draws
   at about 16 frames a second */
const RAF_GATE = "(" + function () {
  window.__raf = 0; window.__hide = false; window.__held = []; window.__slow = false;
  var orig = window.requestAnimationFrame.bind(window), fake = 0;
  window.__release = function () { var h = window.__held; window.__held = []; h.forEach(function (cb) { orig(cb); }); };
  window.requestAnimationFrame = function (cb) {
    window.__raf++;
    return orig(function (t) {
      if (window.__hide) { window.__held.push(cb); return; }
      if (window.__slow) { fake = Math.max(fake + 60, t); cb(fake); return; }
      cb(t);
    });
  };
  Object.defineProperty(document, "hidden", { configurable: true, get: function () { return window.__hide; } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__hide ? "hidden" : "visible"; } });
} + ")()";

/* the WebGL renderer's name, as a hardware GPU would give it, for a check that needs the
   device's own tier to be medium rather than SwiftShader's low */
const HARDWARE = "(" + function () {
  var orig = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (p) {
    if (p === 0x9246 || p === 0x1F01) return "ANGLE (Test, Test GPU Direct3D11)";
    return orig.call(this, p);
  };
} + ")()";

/* a context that reaches the local server and nothing else; `three` says what to do
   with the request for bundle/three.js: "serve" (the default), "abort", or "stall"
   (hold it open, never answered, until the context closes) */
async function newContext(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: opts.scale || 1, reducedMotion: opts.reducedMotion || "no-preference" }, opts.context || {}));
  const asked = [], world = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (WORLD_CHUNK.test(u)) world.push(u);
    if (THREE_CHUNK.test(u)) {
      asked.push(u);
      if (opts.three === "abort") return r.abort("failed");
      if (opts.three === "stall") return;         /* never answered */
    }
    return r.continue();
  });
  await context.addInitScript(RAF_GATE);
  if (opts.hardware) await context.addInitScript(HARDWARE);
  await context.addInitScript((seed) => {
    try { if (!sessionStorage.getItem("__seeded")) { Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); }); sessionStorage.setItem("__seeded", "1"); } } catch (e) { /* fine */ }
  }, opts.seed || {});
  return { context, asked, world };
}

async function openMap(browser, seed, opts) {
  opts = opts || {};
  const { context, asked, world } = await newContext(browser, Object.assign({ seed }, opts));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(url("index.html"));
  await ready(page);
  return { context, page, errors, asked, world };
}
async function ready(page) {
  await page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on() &&
    document.querySelector(".map3d-stage[data-state=ready]"), null, { timeout: 20000 });
  await page.evaluate(() => { var c = document.querySelector("[data-map3d] canvas"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 20); });
}
const mapState = (page) => page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), bob: !!(window.BMMap3D.info() && window.BMMap3D.info().bobbing), raf: window.__raf, held: window.__held.length }));
const info = (page) => page.evaluate(() => window.BMMap3D.info());

/* rAF calls over `ms` of doing nothing, and whether the marker bobbed meanwhile */
async function idle(page, ms) {
  const a = await mapState(page);
  let bob = false;
  for (let t = 0; t < ms; t += 250) { await wait(250); bob = bob || (await mapState(page)).bob; }
  return { frames: (await mapState(page)).raf - a.raf, bob };
}
/* waits (up to the idle window, a bob and some slack) until idle motion has stopped */
async function settled(page) {
  for (let t = 0; t < AMBIENT_MS + BOB_MS + 3000; t += 100) {
    if (!(await mapState(page)).bob) return true;
    await wait(100);
  }
  return false;
}

/* a point on an island with empty ground straight below it, in client pixels */
async function islandPoint(page) {
  const cursor = () => page.evaluate(() => document.querySelector("[data-map3d] canvas").style.cursor);
  const ids = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("li.stop[data-chapter]"), function (li) { return li.getAttribute("data-chapter"); }));
  const box = await page.locator("[data-map3d] canvas").boundingBox();
  for (const id of ids) {
    const w = await page.evaluate((id) => window.BMMap3D.where(id), id);
    if (!w || w.x < box.x + 10 || w.x > box.x + box.width - 10 || w.y < box.y + 10 || w.y > box.y + box.height - 60) continue;
    await page.mouse.move(w.x, w.y);
    if (await cursor() !== "pointer") continue;
    for (let d = 10; w.y + d < box.y + box.height - 5; d += 6) {
      await page.mouse.move(w.x, w.y + d);
      if (await cursor() !== "pointer") return { id, x: w.x, y: w.y, below: w.y + d + 6 };
    }
  }
  return null;
}

/* what the loader and the map say once the load has settled, and what is on window. The
   box keeps the world's place while the chunks load, and gives it back in the task after
   the load says no, so this waits that task out */
const loaded = (page) => page.evaluate(() => window.BM3D.load().then(function (ok) {
  return new Promise(function (r) { setTimeout(r, 50); }).then(function () {
    return { ok: ok, why: window.BM3D.why, three: !!(window.BM3D.THREE && window.BM3D.THREE.WebGLRenderer), onWindow: "THREE" in window,
      map: window.BMMap3D.on(), mapWhy: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, list: document.querySelector("[data-course-index]").getAttribute("data-map") };
  });
}));

const prefsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.prefs.v1") || "{}"));

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("map: " + server.where);
  const browser = await chromium.launch({ args: ARGS });
  try {
    /* -------------------------------------------- 1: idle motion ends */
    {
      const { context, page, errors, asked, world } = await openMap(browser, MEDIUM);
      let bobbed = false;
      for (let t = 0; t < 2000 && !bobbed; t += 100) { bobbed = (await mapState(page)).bob; await wait(100); }
      check(bobbed, "on Medium the marker bobs after the world appears");
      check(await settled(page), "and comes to rest within the idle window (" + AMBIENT_MS + " ms) and one bob");
      const r = await idle(page, 1500);
      check(r.frames === 0 && !r.bob, "then the idle world asks for no frames (" + JSON.stringify(r) + ")");
      await page.click(".map3d-part[data-p=\"1\"]");
      await wait(300);
      const f = await idle(page, 2500);
      check(f.frames > 0 && f.bob, "flying to a Part sets it moving again once the camera settles");
      check(await settled(page), "and it comes to rest again");
      const g = await idle(page, 1500);
      check(g.frames === 0 && !g.bob, "and the page asks for no frames (" + JSON.stringify(g) + ")");
      check(errors.length === 0, "no errors on the map page: " + errors.join("; "));
      const l = await loaded(page);
      check(asked.length === 1 && l.ok && l.three && !l.onWindow, "the page asked for bundle/three.js once, the loader holds the namespace on BM3D.THREE and nothing is on window.THREE (" + JSON.stringify({ asked, l }) + ")");
      check(world.length === 1, "and for the world's chunk, bundle/world.js, once (" + world.length + ")");
      await context.close();
    }
    for (const how of ["Study mode", "reduced motion", "the low tier"]) {
      const seed = how === "Study mode" ? { "bm.prefs.v1": '{"calm":true,"gfx":"mid"}' } : how === "the low tier" ? {} : MEDIUM;
      const { context, page } = await openMap(browser, seed, how === "reduced motion" ? { reducedMotion: "reduce" } : {});
      await wait(800);
      const r = await idle(page, 2500);
      const i = await info(page);
      check(!r.bob && r.frames === 0, "no idle motion and no frames with " + how + " (" + JSON.stringify(r) + ", tier " + i.tier + ")");
      await page.click(".map3d-part[data-p=\"2\"]");
      await wait(how === "the low tier" ? 1200 : 300);
      const s = await idle(page, 1500);
      check(!s.bob && s.frames === 0, "nor after flying to a Part with " + how + " (" + JSON.stringify(s) + ")");
      await context.close();
    }

    /* -------------------------------------------- 2: a pause is not a slow frame */
    {
      const { context, page } = await openMap(browser, MEDIUM);
      await page.click(".map3d-part[data-p=\"2\"]");
      await page.evaluate(() => { window.__hide = true; document.dispatchEvent(new Event("visibilitychange")); });
      await wait(3000);
      const held = (await mapState(page)).held;
      await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event("visibilitychange")); window.__release(); });
      await wait(2500);
      const s = await mapState(page);
      check(held > 0 && s.on && !s.why, "a frame held in a hidden tab keeps the world (held " + held + ", " + JSON.stringify(s) + ", tier " + (await info(page)).tier + ")");
      await context.close();
    }
    {
      const { context, page } = await openMap(browser, MEDIUM);
      await page.click(".map3d-part[data-p=\"2\"]");
      await page.evaluate(() => { var t = Date.now(); while (Date.now() - t < 2500) { /* a long task */ } });
      await wait(3000);
      const s = await mapState(page);
      check(s.on && !s.why, "a 2.5 s long task keeps the world (" + JSON.stringify(s) + ", tier " + (await info(page)).tier + ")");
      await context.close();
    }

    /* -------------------------------------------- 3: an island is a link */
    {
      let { context, page } = await openMap(browser);
      await wait(1500);
      const pt = await islandPoint(page);
      check(!!pt, "found an island with empty ground below it");
      if (pt) {
        const start = page.url();
        const popup = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
        await page.keyboard.down("Control");
        await page.mouse.click(pt.x, pt.y);
        await page.keyboard.up("Control");
        const tab = await popup;
        if (tab) await tab.waitForLoadState().catch(() => {});
        check(page.url() === start, "Ctrl+click on an island leaves the index in place (" + page.url() + ")");
        check(!!tab && /\/parts\/.+\.html/.test(tab.url()), "Ctrl+click on an island opens the chapter in a new tab (" + (tab && tab.url()) + ")");
        if (tab) await tab.close();

        await page.mouse.move(pt.x, pt.below);
        await page.mouse.down();
        for (let k = 1; k <= 10; k++) await page.mouse.move(pt.x, pt.below + (pt.y - pt.below) * k / 10);
        await page.mouse.up();
        await wait(1200);
        check(page.url() === start, "pressing on empty ground, dragging onto an island and releasing opens nothing (" + page.url() + ")");

        let mid = context.waitForEvent("page", { timeout: 2500 }).catch(() => null);
        await page.mouse.move(pt.x, pt.below);
        await page.mouse.down({ button: "middle" });
        for (let k = 1; k <= 10; k++) await page.mouse.move(pt.x, pt.below + (pt.y - pt.below) * k / 10);
        await page.mouse.up({ button: "middle" });
        let midTab = await mid;
        check(page.url() === start && !midTab, "the same drag with the middle button opens nothing either (" + (midTab && midTab.url()) + ")");
        if (midTab) await midTab.close();

        mid = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
        await page.mouse.click(pt.x, pt.y, { button: "middle" });
        midTab = await mid;
        check(page.url() === start && !!midTab && /\/parts\/.+\.html/.test(midTab.url()), "a middle click on an island opens its chapter in a new tab (" + (midTab && midTab.url()) + ")");
        if (midTab) await midTab.close();

        await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => null), page.mouse.click(pt.x, pt.y)]);
        check(/\/parts\/.+\.html/.test(page.url()), "a plain click on the same island opens its chapter (" + page.url() + ")");
      }
      await context.close();
    }

    /* -------------------------------------------- 4: the chunk fails, or stalls */
    for (const how of ["abort", "stall"]) {
      const { context, asked } = await newContext(browser, { three: how });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      await page.goto(url("index.html"));
      await page.waitForFunction(() => window.BM3D && window.BMMap3D, null, { timeout: 20000 });
      const t0 = Date.now();
      const l = await loaded(page);
      const took = Date.now() - t0;
      const why = how === "abort" ? "cdn" : "timeout";
      check(l.ok === false && l.why === why && !l.three && !l.onWindow, "when the request for bundle/three.js " + (how === "abort" ? "fails" : "stalls") + ", load() says false with the reason " + JSON.stringify(why) + " and holds no THREE (" + JSON.stringify(l) + ")");
      check(!l.map && l.mapWhy === why && l.hidden && l.list === null, "and the list stands alone, with the map's reason the loader's (" + JSON.stringify({ map: l.map, mapWhy: l.mapWhy, hidden: l.hidden, list: l.list }) + ")");
      check(asked.length === 1, "the chunk was asked for once (" + asked.length + ")");
      if (how === "stall") check(took >= TIMEOUT - 500 && took < TIMEOUT + 4000, "the load gave up after the loader's " + TIMEOUT + " ms (" + took + " ms)");
      const again = await loaded(page);
      check(again.ok === false && again.why === why && asked.length === 1, "a later load() shares the answer and asks for nothing (" + JSON.stringify(again) + ", asked " + asked.length + ")");
      check(errors.length === 0, "no page errors when the chunk " + how + "s: " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- 5: the tiers and their budgets */
    {
      const { context, page } = await openMap(browser, {});
      const i = await info(page);
      check(i.tier === "low" && i.reason === "software" && !i.ambient, "SwiftShader, a software renderer, gets the low tier by itself (" + JSON.stringify({ tier: i.tier, reason: i.reason }) + ")");
      await context.close();
    }
    {
      const { context, page } = await openMap(browser, {}, { hardware: true });
      const i = await info(page);
      check(i.tier === "medium" && i.reason === "default", "a hardware renderer with a fine pointer gets medium (" + JSON.stringify({ tier: i.tier, reason: i.reason }) + ")");
      await context.close();
    }
    const measured = [];
    for (const [gfx, tier] of [["low", "low"], ["mid", "medium"], ["high", "high"]]) {
      /* a dense screen (three device pixels per CSS pixel), so each tier's cap on the pixel ratio shows */
      {
        const { context, page } = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) }, { scale: 3 });
        const i = await info(page);
        check(i.tier === tier && i.reason === "chosen", "Graphics quality " + gfx + " gives the " + tier + " tier (" + i.tier + ", " + i.reason + ")");
        check(i.pixelRatio === i.budget.dpr, tier + ": pixel ratio " + i.pixelRatio + " on a 3x screen, the tier's cap " + i.budget.dpr);
        await context.close();
      }
      /* at one device pixel: the draw calls and triangles over every Part, and a flight's frame times */
      const { context, page } = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) });
      await settled(page);
      const rest = await info(page);
      const times = [], calls = [rest.calls], tris = [rest.triangles], tiers = [rest.tier];
      for (const p of [1, 2, 3, 0]) {
        await page.evaluate(() => {
          var run = window.__ftRun = (window.__ftRun || 0) + 1, last = 0;
          window.__ft = [];
          (function tick(t) { if (window.__ftRun !== run) return; if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(tick); })(0);
        });
        await page.click(".map3d-part[data-p=\"" + p + "\"]");
        await wait(900);
        times.push(...await page.evaluate(() => { window.__ftRun++; return window.__ft; }));
        const j = await info(page);
        calls.push(j.calls); tris.push(j.triangles); tiers.push(j.tier);
      }
      const b = rest.budget;
      times.sort((a, c) => a - c);
      const row = { tier: rest.tier, pixelRatio: rest.pixelRatio, calls: Math.max(...calls), triangles: Math.max(...tris),
        frameMedian: +(times[Math.floor(times.length / 2)] || 0).toFixed(1), frameP90: +(times[Math.floor(times.length * 0.9)] || 0).toFixed(1), frames: times.length,
        tierAfter: tiers[tiers.length - 1] };
      measured.push(row);
      check(row.calls <= b.calls && row.calls < CALLS_BEFORE / 5, tier + ": at most " + row.calls + " draw calls a frame over every Part, within " + b.calls + " (the course map took " + CALLS_BEFORE + ")");
      check(row.triangles <= b.triangles, tier + ": " + row.triangles + " triangles, within " + b.triangles);
      await context.close();
    }
    console.log("map: budgets measured at 1280x900, one device pixel per CSS pixel, in SwiftShader (a software renderer: frame times are the gaps between animation frames over four flights, and tierAfter is the tier after them, which the watchdog lowers when they are slow):");
    measured.forEach((m) => console.log("  " + JSON.stringify(m)));
    {
      const { context, asked, world } = await newContext(browser, { seed: { "bm.prefs.v1": '{"map":"list"}' } });
      const page = await context.newPage();
      await page.goto(url("index.html"));
      await page.waitForFunction(() => window.BMMap3D && document.querySelector("li.stop"), null, { timeout: 20000 });
      await wait(1500);
      const s = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden }));
      check(!s.on && s.why === "list" && s.hidden && asked.length === 0 && world.length === 0, "with the 3D map switch off the list stands alone and neither bundle/three.js nor bundle/world.js is fetched (" + JSON.stringify({ s, three: asked.length, world: world.length }) + ")");
      await context.close();
    }

    /* -------------------------------------------- 6: the watchdog */
    {
      const { context, page } = await openMap(browser, {}, { hardware: true });
      const before = await info(page);
      await page.evaluate(() => { window.__slow = true; });
      /* idle motion runs on medium; its frames, 60 ms apart, are slow */
      let i = before;
      for (let t = 0; t < 8000 && i && i.tier === "medium"; t += 200) { await page.mouse.move(400 + (t % 400), 500); await wait(200); i = await info(page); }
      const p1 = await prefsOf(page);
      check(before.tier === "medium" && i && i.tier === "low" && p1.gfxAuto === "low", "slow frames step the world down from medium to low, and bm.prefs.v1 keeps gfxAuto \"low\" (" + JSON.stringify({ before: before.tier, after: i && i.tier, prefs: p1 }) + ")");
      await page.evaluate(() => { window.__slow = false; });
      await page.reload();
      await ready(page);
      const j = await info(page);
      check(j.tier === "low" && j.reason === "settled", "the next visit starts on the tier it settled on (" + JSON.stringify({ tier: j.tier, reason: j.reason }) + ")");
      /* low has no idle motion: flights are what it draws, and they are slow too */
      await page.evaluate(() => { window.__slow = true; });
      let on = true;
      for (let k = 0; k < 4 * Math.ceil(SAMPLES / 8) && on; k++) {
        await page.click(".map3d-part[data-p=\"" + (k % 4) + "\"]").catch(() => {});
        await wait(500);
        on = await page.evaluate(() => window.BMMap3D.on());
      }
      const s = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, list: document.querySelector("[data-course-index]").getAttribute("data-map") }));
      const p2 = await prefsOf(page);
      check(!s.on && s.why === "slow" && s.hidden && s.list === null && p2.gfxAuto === "list", "still slow on low, it gives the list back, says why, and keeps gfxAuto \"list\" (" + JSON.stringify({ s, prefs: p2 }) + ")");
      await page.evaluate(() => { window.__slow = false; });
      await page.reload();
      await page.waitForFunction(() => window.BMMap3D && document.querySelector("li.stop"), null, { timeout: 20000 });
      await wait(1000);
      const t = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), sw: window.BMGame.map3dOn(window.BMGame.prefs()) }));
      check(!t.on && t.why === "slow" && t.sw === false, "and the next visit keeps the list, with the 3D map switch showing off (" + JSON.stringify(t) + ")");
      await page.evaluate(() => window.BMGame.setPref("map3d", true));
      await page.waitForFunction(() => window.BMMap3D.on(), null, { timeout: 20000 }).catch(() => {});
      const u = await page.evaluate(() => ({ on: window.BMMap3D.on(), prefs: JSON.parse(localStorage.getItem("bm.prefs.v1")) }));
      check(u.on && !("gfxAuto" in u.prefs), "switching the 3D map on again starts afresh: the world returns and gfxAuto is gone (" + JSON.stringify(u) + ")");
      await context.close();
    }
    {
      /* a quality the learner chose is stepped down for the visit, but nothing is kept */
      const { context, page } = await openMap(browser, { "bm.prefs.v1": '{"gfx":"high"}' }, { hardware: true });
      await page.evaluate(() => { window.__slow = true; });
      let i = await info(page);
      for (let t = 0; t < 8000 && i && i.tier === "high"; t += 200) { await page.mouse.move(400 + (t % 400), 500); await wait(200); i = await info(page); }
      const p = await prefsOf(page);
      check(i && i.tier === "medium" && p.gfx === "high" && !("gfxAuto" in p), "on High chosen by the learner, slow frames step down to medium for the visit and keep nothing (" + JSON.stringify({ tier: i && i.tier, prefs: p }) + ")");
      await context.close();
    }

    /* -------------------------------------------- 7: the keyboard */
    {
      const { context, page } = await openMap(browser, {});
      const canvas = await page.evaluate(() => { var c = document.querySelector("[data-map3d] canvas"); return { hidden: c.getAttribute("aria-hidden"), tab: c.tabIndex, focusable: c.hasAttribute("tabindex") }; });
      check(canvas.hidden === "true" && !canvas.focusable && canvas.tab < 0, "the canvas is aria-hidden and out of the tab order (" + JSON.stringify(canvas) + ")");
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.keyboard.press("Tab");
      let reached = "";
      for (let k = 0; k < 30 && !reached; k++) {
        reached = await page.evaluate(() => { var a = document.activeElement; return a && a.classList.contains("map3d-part") ? a.getAttribute("data-p") : ""; });
        if (!reached) await page.keyboard.press("Tab");
      }
      check(reached === "0", "Tab reaches the first Part button (" + reached + ")");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await wait(1200);
      const on = await page.evaluate(() => document.querySelector(".map3d-part[data-on]") && document.querySelector(".map3d-part[data-on]").getAttribute("data-p"));
      check(on === "1", "Enter on the second Part button flies there and marks it (" + on + ")");
      await page.focus('li.stop[data-chapter="ch09"] .stop-link');
      await wait(1200);
      const h = await page.evaluate(() => ({ hot: window.BMMap3D.info().hot, mark: !!document.querySelector('li.stop[data-chapter="ch09"][data-map-hot]') }));
      check(h.hot === "ch09" && h.mark, "focusing a chapter in the list flies to its island and marks the list item (" + JSON.stringify(h) + ")");
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " map: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
