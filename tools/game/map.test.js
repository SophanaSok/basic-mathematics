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
      on the low tier; a flight that lands draws at most once per display frame
   2. a frame held while the tab is hidden, or a long task, does not tear the world down
      or step it down a tier, whether Medium was chosen or is the device's own (a
      hardware renderer, stubbed), and keeps nothing in bm.prefs.v1
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
      visit; then, at five frames a second on low, which has no idle motion and so only
      flights to judge by, gives the list back within four flights with the reason "slow"
      and keeps that too; so does Low chosen by the learner, whose list is kept as well
   7. the keyboard: the canvas is aria-hidden and out of the tab order; Tab reaches the
      Part buttons (disabled while the chunk loads), Enter flies to a Part, and the chosen
      button keeps its colours under the pointer; at 1280x800 and 360x740, where the list
      is far below the world, Tab down to the first chapter selects its island and marks
      it, and the world is on it when the learner scrolls back up; hovering a chapter flies
      there while the stage is in view and leaves the world as it was when not; a Part
      button focused when the world goes hands the focus to the list
   8. what is left behind: tier changes back and forth leave no GL buffer behind and the
      map switched off frees them all; in the dark theme the selection ring is each
      region's --region-ink
   9. the page around the world: with the page's module held back 1.5 s (a slow network),
      the hero does not move when the world arrives (src/boot.js keeps its place from the
      first paint), at 1280 and 360 wide; and the world starts at main's own padding, as
      the hero did
   10. the picture: the fog shows (drawn without it, the frame changes, but not the
      islands of the row in view), and the last Part's view is not half empty sky */
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
   each display frame is handed a timestamp 60 ms after the last one's (or __slow ms, when
   it is a number), as on a device that draws at about 16 (or 1000 / __slow) frames a second. The fake clock moves once per display frame, not per
   callback: every callback of one frame gets the same time, as the browser gives it, so
   two loops running side by side show as the same timestamp twice (a per-callback clock
   gave each its own 60 ms and hid them). __frames(ms) counts the display frames over
   `ms` on a loop of its own, which __raf does not count */
const RAF_GATE = "(" + function () {
  window.__raf = 0; window.__hide = false; window.__held = []; window.__slow = false;
  var orig = window.requestAnimationFrame.bind(window), fake = 0, real = -1;
  window.__release = function () { var h = window.__held; window.__held = []; h.forEach(function (cb) { orig(cb); }); };
  window.__frames = function (ms) {
    return new Promise(function (done) {
      var n = 0, t0 = performance.now();
      (function tick() { n++; if (performance.now() - t0 < ms) orig(tick); else done(n); })();
    });
  };
  window.requestAnimationFrame = function (cb) {
    window.__raf++;
    return orig(function (t) {
      if (window.__hide) { window.__held.push(cb); return; }
      if (window.__slow) { if (t !== real) { real = t; fake = Math.max(fake + (window.__slow === true ? 60 : window.__slow), t); } cb(fake); return; }
      cb(t);
    });
  };
  Object.defineProperty(document, "hidden", { configurable: true, get: function () { return window.__hide; } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__hide ? "hidden" : "visible"; } });
} + ")()";

/* live WebGL buffers (made minus deleted), so a check can see what a teardown leaves */
const GL_BUFFERS = "(" + function () {
  window.__buffers = 0;
  var P = WebGL2RenderingContext.prototype, make = P.createBuffer, drop = P.deleteBuffer, live = new WeakSet();
  P.createBuffer = function () { var b = make.call(this); if (b) { live.add(b); window.__buffers++; } return b; };
  P.deleteBuffer = function (b) { if (b && live.has(b)) { live.delete(b); window.__buffers--; } return drop.call(this, b); };
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
  await context.addInitScript(GL_BUFFERS);
  await context.addInitScript(PIXELS);
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
      map: window.BMMap3D.on(), mapWhy: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, list: document.querySelector("[data-course-index]").getAttribute("data-map"),
      kept: document.documentElement.hasAttribute("data-world"), height: document.querySelector("[data-map3d]").offsetHeight };
  });
}));

const prefsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.prefs.v1") || "{}"));

/* every display frame `gap` ms after the last, then up to `most` flights to a Part, one
   at a time, until the world gives up; returns how many it took (most + 1 when it did not) */
async function slowFlights(page, gap, most) {
  await page.evaluate((g) => { window.__slow = g; }, gap);
  for (let k = 1; k <= most; k++) {
    await page.click(".map3d-part[data-p=\"" + (k % 4) + "\"]", { timeout: 3000 }).catch(() => {});
    await wait(700);
    if (!(await page.evaluate(() => window.BMMap3D.on()))) return k;
  }
  return most + 1;
}

/* the canvas as drawn just now: BMMap3D.fog() draws in the same task, so the drawing
   buffer is still there to read (the canvas does not preserve it past the frame) */
const PIXELS = "(" + function () {
  window.__pixels = function () {
    var cv = document.querySelector("[data-map3d] canvas"), g = document.createElement("canvas");
    g.width = cv.width; g.height = cv.height;
    var x = g.getContext("2d");
    x.drawImage(cv, 0, 0);
    return { w: g.width, h: g.height, d: x.getImageData(0, 0, g.width, g.height).data };
  };
} + ")()";

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
      /* over the flight's landing and the idle motion after it: one draw per display frame.
         A landing that started a second loop beside the first drew twice per frame, and
         handed the watchdog each timestamp twice, halving the frame time it saw */
      const d = await page.evaluate(() => { var a = window.BMMap3D.info().frames; return window.__frames(1200).then(function (n) { return { renders: window.BMMap3D.info().frames - a, display: n }; }); });
      check(d.renders > 0 && d.renders <= d.display + 1, "a flight that lands draws at most once per display frame, then and through the idle motion (" + JSON.stringify(d) + ")");
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
    /* each on Medium chosen and on medium as the device's own tier (a hardware renderer,
       stubbed): a pause misread as slow frames would step the world down a tier, and on the
       device's own tier keep gfxAuto, so the tier and the prefs are checked, not only that
       the world is still there */
    for (const [label, seed, opts] of [["Medium chosen", MEDIUM, {}], ["medium by itself", {}, { hardware: true }]]) {
      {
        const { context, page } = await openMap(browser, seed, opts);
        await page.click(".map3d-part[data-p=\"2\"]");
        await page.evaluate(() => { window.__hide = true; document.dispatchEvent(new Event("visibilitychange")); });
        await wait(3000);
        const held = (await mapState(page)).held;
        await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event("visibilitychange")); window.__release(); });
        await wait(2500);
        const s = await mapState(page), i = await info(page), p = await prefsOf(page);
        check(held > 0 && s.on && !s.why && i.tier === "medium" && !("gfxAuto" in p), "a frame held in a hidden tab keeps the world on its tier, " + label + ", and keeps nothing (held " + held + ", " + JSON.stringify(s) + ", tier " + i.tier + ", prefs " + JSON.stringify(p) + ")");
        await context.close();
      }
      {
        const { context, page } = await openMap(browser, seed, opts);
        await page.click(".map3d-part[data-p=\"2\"]");
        await page.evaluate(() => { var t = Date.now(); while (Date.now() - t < 2500) { /* a long task */ } });
        await wait(3000);
        const s = await mapState(page), i = await info(page), p = await prefsOf(page);
        check(s.on && !s.why && i.tier === "medium" && !("gfxAuto" in p), "a 2.5 s long task keeps the world on its tier, " + label + ", and keeps nothing (" + JSON.stringify(s) + ", tier " + i.tier + ", prefs " + JSON.stringify(p) + ")");
        await context.close();
      }
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
      if (how === "stall") {
        /* while the chunk loads, the box keeps the world's place, its Part buttons shown but
           disabled (nothing wires them yet), so the keyboard cannot land on a dead button */
        const w = await page.evaluate(() => ({ hidden: document.querySelector("[data-map3d]").hidden, buttons: document.querySelectorAll(".map3d-part").length, disabled: document.querySelectorAll(".map3d-part:disabled").length }));
        check(!w.hidden && w.buttons === 4 && w.disabled === 4, "while the chunk loads the Part buttons are shown, disabled (" + JSON.stringify(w) + ")");
      }
      const t0 = Date.now();
      const l = await loaded(page);
      const took = Date.now() - t0;
      const why = how === "abort" ? "cdn" : "timeout";
      check(l.ok === false && l.why === why && !l.three && !l.onWindow, "when the request for bundle/three.js " + (how === "abort" ? "fails" : "stalls") + ", load() says false with the reason " + JSON.stringify(why) + " and holds no THREE (" + JSON.stringify(l) + ")");
      check(!l.map && l.mapWhy === why && l.hidden && l.list === null, "and the list stands alone, with the map's reason the loader's (" + JSON.stringify({ map: l.map, mapWhy: l.mapWhy, hidden: l.hidden, list: l.list }) + ")");
      check(!l.kept && l.height === 0, "and the place kept for the world from the first paint is given back (" + JSON.stringify({ kept: l.kept, height: l.height }) + ")");
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
      const s = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, kept: document.documentElement.hasAttribute("data-world"), height: document.querySelector("[data-map3d]").offsetHeight }));
      check(!s.on && s.why === "list" && s.hidden && asked.length === 0 && world.length === 0, "with the 3D map switch off the list stands alone and neither bundle/three.js nor bundle/world.js is fetched (" + JSON.stringify({ s, three: asked.length, world: world.length }) + ")");
      check(!s.kept && s.height === 0, "and no place is kept for the world, from the first paint on (" + JSON.stringify(s) + ")");
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
      /* low has no idle motion: flights are what it draws. At five frames a second a
         700 ms flight is four frames, so a watchdog that waited for SAMPLES of them would
         need about fifteen flights; it judges by time as well (src/world/tiers.ts
         WINDOW_MS), and four flights are enough */
      const flights = await slowFlights(page, 200, 4);
      const s = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, list: document.querySelector("[data-course-index]").getAttribute("data-map") }));
      const p2 = await prefsOf(page);
      check(!s.on && s.why === "slow" && s.hidden && s.list === null && p2.gfxAuto === "list", "at five frames a second on low, it gives the list back within four flights (" + flights + "), says why, and keeps gfxAuto \"list\" (" + JSON.stringify({ s, prefs: p2 }) + ")");
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
      /* Low chosen by the learner: too slow even for that, the world gives the list back
         and keeps it (gfxAuto "list"), so a device that cannot draw the low tier does not
         fetch Three.js and the world's chunk on every visit to give them up again; the
         choice of Low stays as it was, and a new choice starts afresh */
      const { context, page, asked } = await openMap(browser, { "bm.prefs.v1": '{"gfx":"low"}' });
      const i = await info(page);
      const flights = await slowFlights(page, 200, 4);
      const p = await prefsOf(page);
      check(i.tier === "low" && i.reason === "chosen" && !(await page.evaluate(() => window.BMMap3D.on())) && p.gfx === "low" && p.gfxAuto === "list",
        "on Low chosen by the learner, five frames a second give the list back within four flights (" + flights + ") and keep it, the choice untouched (" + JSON.stringify(p) + ")");
      await page.evaluate(() => { window.__slow = false; });
      const before = asked.length;
      await page.reload();
      await page.waitForFunction(() => window.BMMap3D && document.querySelector("li.stop"), null, { timeout: 20000 });
      await wait(1000);
      const t = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), sw: window.BMGame.map3dOn(window.BMGame.prefs()) }));
      check(!t.on && t.why === "slow" && !t.sw && asked.length === before, "and the next visit keeps the list, fetches no Three.js, and shows the 3D map switch off (" + JSON.stringify(t) + ", asked " + (asked.length - before) + ")");
      await page.evaluate(() => window.BMGame.setPref("gfx", "low"));
      await page.waitForFunction(() => window.BMMap3D.on(), null, { timeout: 20000 }).catch(() => {});
      check(await page.evaluate(() => window.BMMap3D.on()), "choosing a quality again starts afresh: the world returns");
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
      /* under the pointer the chosen button keeps its solid --part, which its --on-part
         text is measured against (a hover rule that outranked [data-on] once gave it the
         pale --part-soft under white text); another button still takes the hover colour */
      const look = (p) => page.evaluate((p) => { var s = getComputedStyle(document.querySelector('.map3d-part[data-p="' + p + '"]')); return s.backgroundColor + " / " + s.color; }, p);
      await page.mouse.move(0, 0);
      await wait(600);
      const restOn = await look(1), restOff = await look(2);
      await page.hover('.map3d-part[data-p="1"]');
      await wait(600);
      const hoverOn = await look(1);
      await page.hover('.map3d-part[data-p="2"]');
      await wait(600);
      const hoverOff = await look(2);
      await page.mouse.move(0, 0);
      check(hoverOn === restOn && hoverOff !== restOff, "the chosen Part button looks the same under the pointer, and another one changes (" + JSON.stringify({ restOn, hoverOn, restOff, hoverOff }) + ")");
      /* a pointer sweeping down the list is not choosing a chapter: with the stage out of
         view (at 1280x900 the world, above the hero, and the list, below it, are never on
         screen together) a hover leaves the world where it was */
      const view = () => page.evaluate(() => {
        var r = document.querySelector("[data-map3d] canvas").getBoundingClientRect(), w = window.BMMap3D.where("ch01"), i = window.BMMap3D.info();
        return { hot: i.hot, flying: i.flying, at: [Math.round(w.x - r.left), Math.round(w.y - r.top)], mark: !!document.querySelector("li.stop[data-map-hot]") };
      });
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch09"]').scrollIntoView({ block: "center" }));
      await wait(600);
      const before = await view();
      await page.hover('li.stop[data-chapter="ch09"] .stop-link');
      await wait(1200);
      const away = await view();
      check(away.hot === null && !away.flying && !away.mark && away.at.join() === before.at.join(), "hovering a chapter in the list while the stage is out of view leaves the world where it was (" + JSON.stringify({ before, away }) + ")");
      /* on a screen tall enough for both, hover flies to the island and marks the item */
      await page.setViewportSize({ width: 1280, height: 2400 });
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await wait(600);
      await page.hover('li.stop[data-chapter="ch05"] .stop-link');
      await wait(1200);
      const v = await page.evaluate(() => ({ hot: window.BMMap3D.info().hot, mark: !!document.querySelector('li.stop[data-chapter="ch05"][data-map-hot]'), y: window.scrollY }));
      check(v.hot === "ch05" && v.mark && v.y === 0, "with the stage in view, hovering a chapter flies to its island and marks the list item (" + JSON.stringify(v) + ")");
      await context.close();
    }
    /* The keyboard at ordinary sizes, where the list is far below the world: Tab from the
       top, past the Part buttons, to the first chapter. Its island is selected and the
       list item marked at once (the camera cut there, as nobody can watch it fly), and
       scrolling back up finds the world on that chapter, with its label. */
    for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
      const { context, page } = await openMap(browser, {}, { context: { viewport } });
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await wait(300);
      let ch = null;
      for (let k = 0; k < 40 && !ch; k++) {
        await page.keyboard.press("Tab");
        ch = await page.evaluate(() => { var li = document.activeElement && document.activeElement.closest && document.activeElement.closest("li.stop"); return li && li.getAttribute("data-chapter"); });
      }
      await wait(900);
      const k = await page.evaluate(() => {
        var i = window.BMMap3D.info(), st = document.querySelector(".map3d-stage").getBoundingClientRect();
        return { hot: i.hot, flying: i.flying, mark: !!document.querySelector('li.stop[data-chapter="' + i.hot + '"][data-map-hot]'), stageBelowTop: st.bottom > 0 && st.top < window.innerHeight };
      });
      check(ch === "ch01" && k.hot === "ch01" && k.mark && !k.flying, viewport.width + "x" + viewport.height + ": Tab to the first chapter selects its island and marks the list item, though the world is out of view (" + JSON.stringify({ ch, k }) + ")");
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(900);
      const back = await page.evaluate(() => {
        var r = document.querySelector("[data-map3d] canvas").getBoundingClientRect(), w = window.BMMap3D.where("ch01");
        var label = document.querySelector('.map3d-label[data-kind="hot"]') || document.querySelector(".map3d-label");
        return { at: [+((w.x - r.left) / r.width).toFixed(2), +((w.y - r.top) / r.height).toFixed(2)], label: label ? label.textContent : null, focus: document.activeElement && document.activeElement.className };
      });
      check(back.at[0] > 0.25 && back.at[0] < 0.75 && back.at[1] > 0.25 && back.at[1] < 0.85 && /Numbers/.test(back.label || ""), viewport.width + "x" + viewport.height + ": scrolled back up, the world is on that chapter, labelled (" + JSON.stringify(back) + ")");
      await context.close();
    }
    {
      /* a Part button that holds the focus when the world goes (here its context is lost)
         hands the focus to the list, not to <body> */
      const { context, page } = await openMap(browser, {});
      await page.focus('.map3d-part[data-p="2"]');
      await page.evaluate(() => { var gl = document.querySelector("[data-map3d] canvas").getContext("webgl2"); gl.getExtension("WEBGL_lose_context").loseContext(); });
      await page.waitForFunction(() => !window.BMMap3D.on(), null, { timeout: 5000 }).catch(() => {});
      const f = await page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, active: document.activeElement && (document.activeElement.className || document.activeElement.tagName) }));
      check(!f.on && f.why === "context-lost" && f.hidden && /stop-link/.test(f.active), "when the world goes with a Part button focused, the focus moves to the list (" + JSON.stringify(f) + ")");
      await context.close();
    }

    /* -------------------------------------------- 8: what is left behind, and the dark ink */
    {
      /* each tier change rebuilds the props; none, and no teardown, leaves a GL buffer behind */
      const { context, page } = await openMap(browser, MEDIUM);
      /* counted each time the world is back on Medium (the low tier draws no smoke, so it holds fewer) */
      const live = [await page.evaluate(() => window.__buffers)];
      for (const gfx of ["high", "low", "mid", "high", "low", "mid", "high", "low", "mid"]) {
        await page.evaluate((g) => window.BMGame.setPref("gfx", g), gfx);
        await wait(300);
        if (gfx === "mid") live.push(await page.evaluate(() => window.__buffers));
      }
      await page.evaluate(() => window.BMGame.setPref("map3d", false));
      await wait(300);
      const off = await page.evaluate(() => ({ on: window.BMMap3D.on(), buffers: window.__buffers }));
      check(live.every((n) => n === live[0]) && !off.on && off.buffers === 0, "changing the tier back and forth leaves no GL buffer behind, and switching the map off frees them all (live " + JSON.stringify(live) + ", then " + JSON.stringify(off) + ")");
      await context.close();
    }
    {
      /* in the dark theme the regions' grounds are near black: the selection ring is the
         region's --region-ink, which stands 3:1 off its ground (tools/contrast-pairs.json),
         never the paper ink */
      const { context, page } = await openMap(browser, { "bm.theme": '"dark"' });
      await page.evaluate(() => { window.scrollTo(0, 0); });
      const rows = [];
      for (const p of [0, 1, 2, 3]) {
        rows.push(await page.evaluate((p) => {
          var part = window.BM_CURRICULUM.parts[p], id = part.chapters[0].id;
          document.querySelector('li.stop[data-chapter="' + id + '"] .stop-link').focus();
          var ink = getComputedStyle(document.querySelector('.map3d-probe [data-part="' + part.id + '"]')).getPropertyValue("--region-ink").trim().toLowerCase();
          return { id: id, hot: window.BMMap3D.info().hot, ring: window.BMMap3D.info().ring, ink: ink };
        }, p));
      }
      check(await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark" && rows.every((r) => r.hot === r.id && r.ring === r.ink), "in the dark theme the ring around an island is its region's --region-ink (" + JSON.stringify(rows) + ")");
      await context.close();
    }

    /* -------------------------------------------- 9: the page around the world */
    for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
      /* the page's module (which draws the world) held back 1.5 s, as on a slow network:
         where the hero is once the page is parsed, and where it is once the world is drawn */
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.route(/^(https?|wss?):/, async (r) => {
        const u = r.request().url();
        if (!server.owns(u)) return r.abort();
        if (/\/bundle\/pages\/index\.js(?:[?#]|$)/.test(u)) await wait(1500);
        return r.continue();
      });
      await context.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((l) => l.getEntries().forEach((e) => e.sources.forEach((s) => { if (s.node && s.node.matches && s.node.matches("section.hero")) window.__shifts.push(Math.round(s.currentRect.y - s.previousRect.y)); }))).observe({ type: "layout-shift", buffered: true });
        document.addEventListener("readystatechange", () => {
          if (document.readyState === "interactive") window.__parsed = { hero: Math.round(document.querySelector("section.hero").getBoundingClientRect().top), world: document.documentElement.getAttribute("data-world") };
        });
      });
      const page = await context.newPage();
      await page.goto(url("index.html"));
      await page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on() && document.querySelector(".map3d-stage[data-state=ready]"), null, { timeout: 20000 });
      await wait(300);
      const r = await page.evaluate(() => {
        var main = document.querySelector("main"), cs = getComputedStyle(main);
        return { parsed: window.__parsed, hero: Math.round(document.querySelector("section.hero").getBoundingClientRect().top), shifts: window.__shifts,
          gap: Math.round(document.querySelector(".map3d-parts").getBoundingClientRect().top - main.getBoundingClientRect().top - parseFloat(cs.paddingTop)) };
      });
      check(r.parsed && r.parsed.world === "3d" && Math.abs(r.hero - r.parsed.hero) <= 1 && r.shifts.length === 0, viewport.width + " wide, the page's module 1.5 s late: the world's place is kept from the first paint and the hero does not move when it arrives (" + JSON.stringify(r) + ")");
      check(r.gap === 0, viewport.width + " wide: the world starts at main's own padding, as the hero did (" + r.gap + " px more)");
      await context.close();
    }

    /* -------------------------------------------- 10: the picture */
    for (const theme of ["light", "dark"]) {
      const { context, page } = await openMap(browser, { "bm.theme": JSON.stringify(theme), "bm.prefs.v1": '{"gfx":"mid"}' }, { reducedMotion: "reduce" });
      await page.click('.map3d-part[data-p="0"]');
      await wait(400);
      /* the fog: the frame without it differs, beyond the row in view; the islands of that row do not */
      const f = await page.evaluate(() => {
        var cv = document.querySelector("[data-map3d] canvas"), r = cv.getBoundingClientRect();
        window.BMMap3D.fog(true);
        var a = window.__pixels();
        window.BMMap3D.fog(false);
        var b = window.__pixels();
        window.BMMap3D.fog(true);
        var diff = function (k) { return Math.abs(a.d[k] - b.d[k]) + Math.abs(a.d[k + 1] - b.d[k + 1]) + Math.abs(a.d[k + 2] - b.d[k + 2]); };
        var changed = 0, lit = 0;
        for (var k = 0; k < a.d.length; k += 4) { if (diff(k) > 6) changed++; if (a.d[k] + a.d[k + 1] + a.d[k + 2] > 0) lit++; }
        var row = window.BM_CURRICULUM.parts[0].chapters.map(function (ch) {
          var w = window.BMMap3D.where(ch.id), x = Math.round((w.x - r.left) * a.w / r.width), y = Math.round((w.y - r.top) * a.h / r.height);
          return diff((y * a.w + x) * 4);
        });
        return { share: +(changed / (a.w * a.h)).toFixed(3), lit: lit > 0, row: row, fog: window.BMMap3D.info().fog };
      });
      check(f.lit && f.share >= 0.02 && f.row.every((d) => d <= 6), theme + ": the fog shows: drawn without it, " + (f.share * 100).toFixed(1) + "% of the frame changes (at least 2%), and none of the islands of the row in view (" + JSON.stringify(f) + ")");
      /* the last Part: no band of empty sky across the top (the far hills stand behind it) */
      await page.click('.map3d-part[data-p="3"]');
      await wait(400);
      const k = await page.evaluate(() => {
        window.BMMap3D.fog(true);
        var a = window.__pixels(), at = function (x, y) { var k = (y * a.w + x) * 4; return [a.d[k], a.d[k + 1], a.d[k + 2]]; };
        var sky = window.BMMap3D.info() && at(Math.round(a.w / 2), 1), rows = 0;
        for (var y = 1; y < a.h - 1; y++) {
          var all = true;
          for (var x = 1; x < a.w - 1 && all; x += 3) { var q = at(x, y); if (Math.abs(q[0] - sky[0]) + Math.abs(q[1] - sky[1]) + Math.abs(q[2] - sky[2]) > 6) all = false; }
          if (all) rows++;
        }
        return { skyRows: rows, rows: a.h };
      });
      check(k.skyRows / k.rows <= 0.05, theme + ": the last Part's view is not a band of empty sky (" + k.skyRows + " of " + k.rows + " rows all sky)");
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
