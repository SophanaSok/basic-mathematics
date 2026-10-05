#!/usr/bin/env node
/* Headless Chromium checks of the 3D course map (assets/map3d.js) and the Three.js
   loader (assets/three-loader.js), with SwiftShader WebGL, on the built site as
   lib/target.js serves it (dist/, which must be current):
     node tools/game/map.test.js
   Three.js is the site's own chunk, bundle/three.js, which the loader imports on
   demand; every request off the local server is aborted, so nothing here depends on a
   CDN or a download.

   1. the "you are here" bob ends: an idle page asks for no frames; never bobs when calm
      or under reduced motion
   2. a frame held while the tab is hidden, or a long task, does not tear the map down
   3. an island acts like its list link: Ctrl+click and middle click open a new tab, a press
      (either button) on empty ground dragged onto an island and released opens nothing
   4. the loader: the page asks for the Three.js chunk once and only after the map has
      asked for it; when that request fails, load() says false with the reason "cdn" and
      the list stands alone; when it stalls past the loader's timeout, the reason is
      "timeout"; neither case leaves a THREE behind, and nothing is on window.THREE */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
/* the loader's own: var TIMEOUT in assets/three-loader.js, read so a changed value shows here */
const LOADER = require("fs").readFileSync(require("path").join(site.ROOT, "assets/three-loader.js"), "utf8");
const TIMEOUT = +LOADER.match(/var TIMEOUT = (\d+);/)[1];

let server;
const url = (p) => server.url + p;
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* counts requestAnimationFrame calls; with __hide set, callbacks are held (as Chrome holds
   them for a hidden tab) and run on return with the current timestamp */
const RAF_GATE = "(" + function () {
  window.__raf = 0; window.__hide = false; window.__held = [];
  var orig = window.requestAnimationFrame.bind(window);
  window.__release = function () { var h = window.__held; window.__held = []; h.forEach(function (cb) { orig(cb); }); };
  window.requestAnimationFrame = function (cb) {
    window.__raf++;
    return orig(function (t) { if (window.__hide) window.__held.push(cb); else cb(t); });
  };
  Object.defineProperty(document, "hidden", { configurable: true, get: function () { return window.__hide; } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__hide ? "hidden" : "visible"; } });
} + ")()";

/* a context that reaches the local server and nothing else; `three` says what to do
   with the request for bundle/three.js: "serve" (the default), "abort", or "stall"
   (hold it open, never answered, until the context closes) */
async function newContext(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: opts.reducedMotion || "no-preference" }, opts.context || {}));
  const asked = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (THREE_CHUNK.test(u)) {
      asked.push(u);
      if (opts.three === "abort") return r.abort("failed");
      if (opts.three === "stall") return;         /* never answered */
    }
    return r.continue();
  });
  await context.addInitScript(RAF_GATE);
  await context.addInitScript((seed) => {
    try { Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); }); } catch (e) { /* fine */ }
  }, opts.seed || {});
  return { context, asked };
}

async function openMap(browser, seed, opts) {
  opts = opts || {};
  const { context, asked } = await newContext(browser, { seed, reducedMotion: opts.reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(url("index.html"));
  await page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on() &&
    document.querySelector(".map3d-stage[data-state=ready]"), null, { timeout: 20000 });
  await page.evaluate(() => { var c = document.querySelector("[data-map3d] canvas"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 20); });
  return { context, page, errors, asked };
}
const mapState = (page) => page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), bob: !!(window.BMMap3D.info() && window.BMMap3D.info().bobbing), raf: window.__raf, held: window.__held.length }));

/* rAF calls over `ms` of doing nothing, and whether the marker bobbed meanwhile */
async function idle(page, ms) {
  const a = await mapState(page);
  let bob = false;
  for (let t = 0; t < ms; t += 250) { await wait(250); bob = bob || (await mapState(page)).bob; }
  return { frames: (await mapState(page)).raf - a.raf, bob };
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

/* what the loader and the map say once the load has settled, and what is on window */
const loaded = (page) => page.evaluate(() => window.BM3D.load().then(function (ok) {
  return { ok: ok, why: window.BM3D.why, three: !!(window.BM3D.THREE && window.BM3D.THREE.WebGLRenderer), onWindow: "THREE" in window,
    map: window.BMMap3D.on(), mapWhy: window.BMMap3D.why(), hidden: document.querySelector("[data-map3d]").hidden, list: document.querySelector("[data-course-index]").getAttribute("data-map") };
}));

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("map: " + server.where);
  const browser = await chromium.launch({ args: ARGS });
  try {
    /* -------------------------------------------- 1: the bob ends */
    {
      const { context, page, errors, asked } = await openMap(browser);
      let bobbed = false;
      for (let t = 0; t < 4000 && !(bobbed && !(await mapState(page)).bob); t += 100) {
        bobbed = bobbed || (await mapState(page)).bob;
        await wait(100);
      }
      check(bobbed, "the marker bobs once after the map appears");
      const r = await idle(page, 1500);
      check(r.frames === 0 && !r.bob, "then the idle map asks for no frames (" + JSON.stringify(r) + ")");
      await page.click(".map3d-part[data-p=\"1\"]");
      await wait(300);
      const f = await idle(page, 4500);
      check(f.frames > 0 && f.bob, "flying to a Part bobs the marker again once the camera settles");
      const g = await idle(page, 1500);
      check(g.frames === 0 && !g.bob, "and stops again (" + JSON.stringify(g) + ")");
      check(errors.length === 0, "no errors on the map page: " + errors.join("; "));
      const l = await loaded(page);
      check(asked.length === 1 && l.ok && l.three && !l.onWindow, "the page asked for bundle/three.js once, the loader holds the namespace on BM3D.THREE and nothing is on window.THREE (" + JSON.stringify({ asked, l }) + ")");
      await context.close();
    }
    for (const how of ["calm", "reduced motion"]) {
      const { context, page } = await openMap(browser, how === "calm" ? { "bm.prefs.v1": '{"calm":true}' } : {}, how === "calm" ? {} : { reducedMotion: "reduce" });
      await wait(800);
      const r = await idle(page, 2500);
      check(!r.bob && r.frames === 0, "no bob and no frames with " + how + " (" + JSON.stringify(r) + ")");
      await context.close();
    }

    /* -------------------------------------------- 2: a pause is not a slow frame */
    {
      const { context, page } = await openMap(browser);
      await page.click(".map3d-part[data-p=\"2\"]");
      await page.evaluate(() => { window.__hide = true; document.dispatchEvent(new Event("visibilitychange")); });
      await wait(3000);
      const held = (await mapState(page)).held;
      await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event("visibilitychange")); window.__release(); });
      await wait(2500);
      const s = await mapState(page);
      check(held > 0 && s.on && !s.why, "a frame held in a hidden tab keeps the map (held " + held + ", " + JSON.stringify(s) + ")");
      await context.close();
    }
    {
      const { context, page } = await openMap(browser);
      await page.click(".map3d-part[data-p=\"2\"]");
      await page.evaluate(() => { var t = Date.now(); while (Date.now() - t < 2500) { /* a long task */ } });
      await wait(3000);
      const s = await mapState(page);
      check(s.on && !s.why, "a 2.5 s long task keeps the map (" + JSON.stringify(s) + ")");
      await context.close();
    }

    /* -------------------------------------------- 3: an island is a link */
    {
      let { context, page } = await openMap(browser);
      await wait(3000);
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
  } finally {
    await browser.close();
    await server.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " map: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
