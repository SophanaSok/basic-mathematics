#!/usr/bin/env node
/* Headless Chromium checks of the course world on the contents page (assets/map3d.js
   and src/world/), and of the Three.js loader (assets/three-loader.js), with SwiftShader
   WebGL, on the built site as lib/target.js serves it (dist/, which must be current):
     node tools/game/map.test.js
   Three.js and the world are the site's own chunks, bundle/three.js and bundle/world.js,
   which the page imports on demand; every request off the local server is aborted, so
   nothing here depends on a CDN or a download.

   Chromium draws WebGL on SwiftShader here, on every machine (lib/gl.js launches it so,
   and stops if it gets anything else), so these run as on a CI runner, never on this
   machine's GPU. SwiftShader is a software renderer, so the device's own tier here is
   low, which has no idle motion (src/world/tiers.ts): a check about a tier chooses it in
   the settings first (bm.prefs.v1 gfx "low", "mid", "high"), as a learner can, or gives
   the probe a renderer's name (RENDERER), and none takes the tier the machine detects.

   Nor does any depend on how fast the machine draws. Software WebGL on a slow runner
   draws frames the world's watchdog rightly calls slow, and it steps a chosen Medium down
   to Low in the middle of a check of Medium's idle motion. So the page's animation
   frames run on a clock of the check's own (RAF_GATE): steady by default, where no frame
   takes longer than the watchdog's SLOW_MS (but the pause a check makes, a long task or a
   hidden tab, passes through as it really was), and exactly 60 or 200 ms a frame in the
   checks of the watchdog itself.

   1. idle motion ends: on Medium the marker bobs (and the props move) for AMBIENT_MS
      after the world appears or the camera settles, to the end of the bob, and then an
      idle page asks for no frames; never under Study mode or reduced motion, and never
      on the low tier; a flight that lands draws at most once per display frame
   2. a frame held while the tab is hidden, or a long task, does not tear the world down
      or step it down a tier, whether Medium was chosen or is the device's own (a
      hardware renderer, stubbed), and keeps nothing in bm.prefs.v1: every other frame on
      the steady clock, the pause itself as long as it really was
   3. an island acts like its list link: Ctrl+click and middle click open a new tab, a press
      (either button) on empty ground dragged onto an island and released opens nothing
   4. the loader: the page asks for the Three.js chunk once and only after the map has
      asked for it; when that request fails, load() says false with the reason "cdn" and
      the list stands alone; when it stalls past the loader's timeout, the reason is
      "timeout"; neither case leaves a THREE behind, and nothing is on window.THREE
   5. the tiers: the device's own tier is low for a software renderer (SwiftShader, and a
      renderer's name stubbed: llvmpipe) and medium for a hardware one (stubbed); each tier
      chosen in the settings is drawn within its budget of draw calls, triangles and
      pixel ratio (TIERS, read through BMMap3D.info().budget), far below the 109 draw
      calls the course map took before the world; the frame times of a flight are
      printed for each tier; with the 3D map switch off neither chunk is fetched
   6. the watchdog, on a clock the check sets frame by frame, whatever the machine
      draws: with every frame 60 ms apart, the world steps down a tier (medium to
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
   7b. Escape on the stage clears a selection first (focus stays) and leaves the map second;
      a plate never covers its island, and one with no room above goes below it, under the
      island's lowest point; the legend's glyphs resolve to the tokens the world draws the
      marks with
   8. what is left behind: tier changes back and forth leave no GL buffer behind and the
      map switched off frees them all; in the dark theme the selection ring is each
      region's --region-ink
   9. the page around the world: with the page's module held back 1.5 s (a slow network),
      the hero does not move when the world arrives (src/boot.js keeps its place from the
      first paint), at 1280 and 360 wide; and the world starts at main's own padding, as
      the hero did
   10. the picture: the fog shows (drawn without it, the frame changes, but not the
      islands of the row in view), and the last Part's view is not half empty sky
   11. the bloom: on the high tier alone, through three passes inside POST_PIXELS (even
      on a dense screen), on the dark theme at strength 0.55 (the light theme has none and fetches nothing, owner O16; a live flip builds or drops it),
      the scene's own calls and triangles inside the high caps, its two chunks fetched
      once; medium and low never request them; the watchdog turns it off before it
      steps the tier down */
"use strict";
const fs = require("fs");
const path = require("path");
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();
const gl = require("../lib/gl");

const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const WORLD_CHUNK = /\/bundle\/world\.js(?:[?#]|$)/;
/* the bloom's two chunks (src/world/post.ts, src/vendor/three-post.js) */
const POST_CHUNK = /\/bundle\/(?:three-)?post\.js(?:[?#]|$)/;
/* the constants these checks wait on, read from their files, so a changed value shows here */
const read = (f) => fs.readFileSync(path.join(site.ROOT, f), "utf8");
const TIMEOUT = +read("assets/three-loader.js").match(/var TIMEOUT = (\d+);/)[1];
const AMBIENT_MS = +read("src/world/tiers.ts").match(/export const AMBIENT_MS = (\d+);/)[1];
const BOB_MS = +read("assets/map3d.js").match(/var BOB_MS = (\d+);/)[1];
const SLOW_MS = +read("src/world/tiers.ts").match(/export const SLOW_MS = (\d+);/)[1];
/* the longest frame the steady clock shows: under SLOW_MS, so no run of frames is slow */
const STEADY_MS = SLOW_MS - 4;
/* the shortest gap the checks of a pause let through the steady clock (__passNext): under
   the 2.5 s long task and the 3 s hidden tab they make, and far over any frame */
const PAUSE_GAP = 2000;
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

/* The page's animation frames, and the clock they see. __raf counts requestAnimationFrame
   calls. Every display frame hands each of its callbacks one timestamp, as the browser
   does, so two loops running side by side show as the same timestamp twice (a per-callback
   clock gave each its own and hid them). The clock moves once per display frame:
     - steady, the default: by the real time since the last display frame, but never by
       more than STEADY_MS, under the watchdog's SLOW_MS, so the speed of the machine is
       in no check: on a 4-vCPU CI runner SwiftShader draws Medium slowly enough that the
       watchdog, as it should, steps it down to Low, and a check of Medium's idle motion
       then found Low. The one exception is the pause a check makes: __passNext = ms lets
       the next gap of at least `ms` through as it really was (once; __passed lists the
       gaps let through). The checks that a pause is not a slow frame set it to PAUSE_GAP
       as they make the pause (a 2.5 s long task, frames held 3 s in a hidden tab), and
       check that the pause was let through, so the world's watchdog sees it. It is the
       check's own number, not a threshold read from src/world/tiers.ts (PAUSE_MS), so a
       PAUSE_MS raised past the 2.5 s task fails the long-task check: the task then
       reaches the watchdog as one 2.5 s frame. Not simply "the next frame": the first
       frame after a long task can carry a timestamp from before it ended (Chromium 153
       here: a 17 ms gap, then the 2483 ms one)
     - __slow, true or a number: exactly 60 ms (or __slow ms) a frame, whatever the
       machine draws, as on a device that draws about 16 (or 1000 / __slow) frames a
       second, for the checks of the watchdog
   With __hide set, callbacks are held (as Chrome holds them for a hidden tab) and run on
   return (__release), on the same clock. __frames(ms) counts the display frames over `ms`
   and __realRaf is the browser's own requestAnimationFrame (the frame times printed in 5
   are real ones); neither is counted in __raf */
const RAF_GATE = (o) => {
  window.__raf = 0; window.__rafFrom = []; window.__hide = false; window.__held = []; window.__slow = false; window.__passNext = 0; window.__passed = [];
  var orig = window.requestAnimationFrame.bind(window), fake = 0, real = -1;
  function stamp(t) {
    if (t === real) return fake;
    if (real < 0) fake = t;
    else if (window.__slow) fake += window.__slow === true ? 60 : window.__slow;
    else if (window.__passNext && t - real >= window.__passNext) { fake += t - real; window.__passed.push(Math.round(t - real)); window.__passNext = 0; }
    else fake += Math.min(t - real, o.steady);
    real = t;
    return fake;
  }
  window.__realRaf = orig;
  window.__release = function () { var h = window.__held; window.__held = []; h.forEach(function (cb) { orig(function (t) { cb(stamp(t)); }); }); };
  window.__frames = function (ms) {
    return new Promise(function (done) {
      var n = 0, t0 = performance.now();
      (function tick() { n++; if (performance.now() - t0 < ms) orig(tick); else done(n); })();
    });
  };
  window.requestAnimationFrame = function (cb) {
    window.__raf++;
    /* who asked: three frames of the caller's stack, file:line only, so a frame counted
       where none was expected names its source in the check's message */
    window.__rafFrom.push(String(new Error().stack || "").split("\n").slice(2, 5).map(function (l) {
      var m = /([^\/\s(]+:\d+:\d+)\)?$/.exec(l.trim()); return m ? m[1] : l.trim().slice(0, 40);
    }).join(" < "));
    return orig(function (t) {
      if (window.__hide) { window.__held.push(cb); return; }
      cb(stamp(t));
    });
  };
  Object.defineProperty(document, "hidden", { configurable: true, get: function () { return window.__hide; } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__hide ? "hidden" : "visible"; } });
};

/* live WebGL buffers (made minus deleted), so a check can see what a teardown leaves */
const GL_BUFFERS = "(" + function () {
  window.__buffers = 0;
  var P = WebGL2RenderingContext.prototype, make = P.createBuffer, drop = P.deleteBuffer, live = new WeakSet();
  P.createBuffer = function () { var b = make.call(this); if (b) { live.add(b); window.__buffers++; } return b; };
  P.deleteBuffer = function (b) { if (b && live.has(b)) { live.delete(b); window.__buffers--; } return drop.call(this, b); };
} + ")()";

/* the WebGL renderer's name the page reads (UNMASKED_RENDERER_WEBGL, or RENDERER), given:
   for a check that needs the device's own tier to be medium (a hardware GPU's name) or
   wants the low tier from a software renderer's name rather than from the real one */
const RENDERER = (name) => {
  var orig = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (p) {
    if (p === 0x9246 || p === 0x1F01) return name;
    return orig.call(this, p);
  };
};
const HARDWARE = "ANGLE (Test, Test GPU Direct3D11)";

/* a context that reaches the local server and nothing else, with the clock above; `three` says what to do
   with the request for bundle/three.js: "serve" (the default), "abort", or "stall"
   (hold it open, never answered, until the context closes) */
async function newContext(browser, opts) {
  opts = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: opts.scale || 1, reducedMotion: opts.reducedMotion || "no-preference" }, opts.context || {}));
  const asked = [], world = [], post = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (WORLD_CHUNK.test(u)) world.push(u);
    if (POST_CHUNK.test(u)) post.push(u);
    if (THREE_CHUNK.test(u)) {
      asked.push(u);
      if (opts.three === "abort") return r.abort("failed");
      if (opts.three === "stall") return;         /* never answered */
    }
    return r.continue();
  });
  await context.addInitScript(RAF_GATE, { steady: STEADY_MS });
  await context.addInitScript(GL_BUFFERS);
  await context.addInitScript(PIXELS);
  if (opts.hardware || opts.renderer) await context.addInitScript(RENDERER, opts.renderer || HARDWARE);
  await context.addInitScript((seed) => {
    try { if (!sessionStorage.getItem("__seeded")) { if (!("bm.guide.v1" in seed)) localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}'); var pf = {}; try { pf = JSON.parse(seed["bm.prefs.v1"] || "{}"); } catch (e) { pf = {}; } if (!("map" in pf)) pf.map = "3d"; seed = Object.assign({}, seed, { "bm.prefs.v1": JSON.stringify(pf) }); Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); }); sessionStorage.setItem("__seeded", "1"); } } catch (e) { /* fine */ }
  }, opts.seed || {});
  return { context, asked, world, post };
}

async function openMap(browser, seed, opts) {
  opts = opts || {};
  const { context, asked, world, post } = await newContext(browser, Object.assign({ seed }, opts));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(url("index.html"));
  await ready(page);
  return { context, page, errors, asked, world, post };
}
async function ready(page) {
  await page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on() &&
    document.querySelector(".map3d-stage[data-state=ready]"), null, { timeout: 20000 });
  await page.evaluate(() => { var c = document.querySelector("[data-map3d] canvas"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 20); });
}
const mapState = (page) => page.evaluate(() => ({ on: window.BMMap3D.on(), why: window.BMMap3D.why(), bob: !!(window.BMMap3D.info() && window.BMMap3D.info().bobbing), raf: window.__raf, from: window.__rafFrom.slice(), held: window.__held.length }));
/* BMMap3D.info(), or, when the world has gone (info() is null: the list stands alone),
   { gone: true, why } with the reason BMMap3D.why() gives, so a check that expected a
   world fails saying so rather than the script stopping on a null */
const info = (page) => page.evaluate(() => window.BMMap3D.info() || { gone: true, why: window.BMMap3D.why() });

/* rAF calls over `ms` of doing nothing, and whether the marker bobbed meanwhile */
async function idle(page, ms) {
  const a = await mapState(page);
  let bob = false;
  for (let t = 0; t < ms; t += 250) { await wait(250); bob = bob || (await mapState(page)).bob; }
  const b = await mapState(page);
  /* the frames counted in the window, each with who asked for it */
  return { frames: b.raf - a.raf, bob, from: b.from.slice(a.from.length) };
}
/* waits until the page has asked for no frame for 400 ms (up to 10 s): a flight has landed
   and its loop has stopped. The flight is FLIGHT_MS on the page's clock, which moves at most
   STEADY_MS per display frame, so it needs about 24 frames however slow the renderer; a fixed
   wait after a click put the machine's speed in the check (SwiftShader on a CI runner draws
   the low tier at about 50 ms a frame, and 24 of those is the whole wait) */
async function landed(page) {
  let last = (await mapState(page)).raf, quiet = 0;
  for (let t = 0; t < 10000 && quiet < 400; t += 100) {
    await wait(100);
    const raf = (await mapState(page)).raf;
    if (raf === last) quiet += 100; else { quiet = 0; last = raf; }
  }
  return quiet >= 400;
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
  const browser = await gl.launch(chromium, {}, true);
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
      const d = await page.evaluate(() => { var a = (window.BMMap3D.info() || {}).frames; return window.__frames(1200).then(function (n) { return { renders: (window.BMMap3D.info() || {}).frames - a, display: n }; }); });
      check(d.renders > 0 && d.renders <= d.display + 1, "a flight that lands draws at most once per display frame, then and through the idle motion (" + JSON.stringify(d) + ")");
      const f = await idle(page, 2500);
      check(f.frames > 0 && f.bob, "flying to a Part sets it moving again once the camera settles");
      check(await settled(page), "and it comes to rest again");
      const g = await idle(page, 1500);
      check(g.frames === 0 && !g.bob, "and the page asks for no frames (" + JSON.stringify(g) + ")");
      /* a page with no game layer (BMGame absent, as in a stripped build) still refreshes: the
         marker stays, and no listener fails. The listener only
         schedules the refresh (a 0 ms timer), so BMGame stays absent until that timer has run;
         the world is at rest here, so a frame drawn proves the refresh ran. A listener's throw
         is caught and logged by the store, so the log is read; a throw from the refresh itself
         is a page error, checked below */
      const noGame = await page.evaluate(() => new Promise((done) => {
        const G = window.BMGame, err = console.error, logged = [], before = window.BMMap3D.info().frames;
        window.BMGame = undefined;
        console.error = function () { logged.push(Array.prototype.map.call(arguments, String).join(" ")); };
        try { window.BMStore.emit({ type: "sync" }); }
        catch (e) { logged.push("emit threw: " + e.message); }
        setTimeout(() => {
          window.BMGame = G; console.error = err;
          const i = window.BMMap3D.info();
          done({ logged, current: i && i.current, drew: i ? i.frames - before : null });
        }, 400);
      }));
      check(noGame.logged.length === 0 && !!noGame.current && noGame.drew > 0, "a refresh with BMGame absent runs, fails no listener and keeps the marker on the current island (" + JSON.stringify(noGame) + ")");
      check(errors.length === 0, "no errors on the map page: " + errors.join("; "));
      const l = await loaded(page);
      check(asked.length === 1 && l.ok && l.three && !l.onWindow, "the page asked for bundle/three.js once, the loader holds the namespace on BM3D.THREE and nothing is on window.THREE (" + JSON.stringify({ asked, l }) + ")");
      check(world.length === 1, "and for the world's chunk, bundle/world.js, once (" + world.length + ")");
      await context.close();
    }
    for (const how of ["Study mode", "reduced motion", "the low tier"]) {
      const seed = how === "Study mode" ? { "bm.prefs.v1": '{"calm":true,"gfx":"mid"}' } : how === "the low tier" ? { "bm.prefs.v1": '{"gfx":"low"}' } : MEDIUM;
      const { context, page } = await openMap(browser, seed, how === "reduced motion" ? { reducedMotion: "reduce" } : {});
      await wait(800);
      const r = await idle(page, 2500);
      const i = await info(page);
      check(!r.bob && r.frames === 0, "no idle motion and no frames with " + how + " (" + JSON.stringify(r) + ", tier " + i.tier + ")");
      await page.click(".map3d-part[data-p=\"2\"]");
      check(await landed(page), "the flight to a Part lands with " + how);
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
        await page.evaluate((g) => { window.__hide = true; window.__passNext = g; document.dispatchEvent(new Event("visibilitychange")); }, PAUSE_GAP);
        await wait(3000);
        const held = (await mapState(page)).held;
        await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event("visibilitychange")); window.__release(); });
        await wait(2500);
        const s = await mapState(page), i = await info(page), p = await prefsOf(page), passed = await page.evaluate(() => window.__passed);
        check(passed.length === 1, "the hidden tab's pause reached the world as it was, " + label + " (gaps let through the steady clock: " + JSON.stringify(passed) + ")");
        check(held > 0 && s.on && !s.why && i.tier === "medium" && !("gfxAuto" in p), "a frame held in a hidden tab keeps the world on its tier, " + label + ", and keeps nothing (held " + held + ", " + JSON.stringify(s) + ", tier " + i.tier + ", prefs " + JSON.stringify(p) + ")");
        await context.close();
      }
      {
        const { context, page } = await openMap(browser, seed, opts);
        await page.click(".map3d-part[data-p=\"2\"]");
        await page.evaluate((g) => { window.__passNext = g; var t = Date.now(); while (Date.now() - t < 2500) { /* a long task */ } }, PAUSE_GAP);
        await wait(3000);
        const s = await mapState(page), i = await info(page), p = await prefsOf(page), passed = await page.evaluate(() => window.__passed);
        check(passed.length === 1, "the long task's pause reached the world as it was, " + label + " (gaps let through the steady clock: " + JSON.stringify(passed) + ")");
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
    /* what the device gets by itself, from the renderer's name the page reads: this
       browser's own (SwiftShader, lib/gl.js sees to it), a software renderer's given
       (llvmpipe, Mesa's), and a hardware GPU's given */
    for (const [label, renderer, tier, why] of [["SwiftShader, this browser's own renderer", null, "low", "software"],
      ["llvmpipe, a software renderer (its name given)", "llvmpipe (LLVM 17.0.6, 256 bits)", "low", "software"],
      ["a hardware renderer (its name given) with a fine pointer", HARDWARE, "medium", "default"]]) {
      const { context, page } = await openMap(browser, {}, renderer ? { renderer } : {});
      const i = await info(page);
      const seen = await page.evaluate(() => window.BM3D.renderer);
      check(i.tier === tier && i.reason === why && i.ambient === (tier !== "low") && (renderer ? seen === renderer : /swiftshader/i.test(seen)), label + " gets the " + tier + " tier by itself (" + JSON.stringify({ renderer: seen, tier: i.tier, reason: i.reason, gone: i.gone, why: i.why }) + ")");
      await context.close();
    }
    const measured = [];
    for (const [gfx, tier] of [["low", "low"], ["mid", "medium"], ["high", "high"]]) {
      /* a dense screen (three device pixels per CSS pixel), so each tier's cap on the pixel ratio shows */
      {
        const { context, page } = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) }, { scale: 3 });
        const i = await info(page);
        check(i.tier === tier && i.reason === "chosen", "Graphics quality " + gfx + " gives the " + tier + " tier (" + i.tier + ", " + (i.gone ? "the world gone: " + i.why : i.reason) + ")");
        check(!i.gone && i.pixelRatio === i.budget.dpr, tier + ": pixel ratio " + i.pixelRatio + " on a 3x screen, the tier's cap " + (i.budget && i.budget.dpr));
        await context.close();
      }
      /* at one device pixel: the draw calls and triangles over every Part, and a flight's frame times */
      const { context, page } = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) });
      await settled(page);
      const rest = await info(page);
      if (rest.gone) {
        check(false, tier + ": the world was there to measure (it went: " + rest.why + ")");
        await context.close();
        continue;
      }
      const times = [], calls = [rest.calls], tris = [rest.triangles], tiers = [rest.tier];
      let gone = null;
      for (const p of [1, 2, 3, 0]) {
        /* the real gaps between this machine's frames, on the browser's own clock */
        await page.evaluate(() => {
          var run = window.__ftRun = (window.__ftRun || 0) + 1, last = 0;
          window.__ft = [];
          (function tick(t) { if (window.__ftRun !== run) return; if (last) window.__ft.push(t - last); last = t; window.__realRaf(tick); })(0);
        });
        await page.click(".map3d-part[data-p=\"" + p + "\"]");
        await wait(900);
        times.push(...await page.evaluate(() => { window.__ftRun++; return window.__ft; }));
        const j = await info(page);
        if (j.gone) { gone = j.why; break; }
        calls.push(j.calls); tris.push(j.triangles); tiers.push(j.tier);
      }
      check(!gone, tier + ": the world stays through four flights" + (gone ? " (it went: " + gone + ")" : ""));
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
    console.log("map: budgets measured at 1280x900, one device pixel per CSS pixel, in SwiftShader (a software renderer: frame times are this machine's real gaps between animation frames over four flights; the world's watchdog saw the steady clock, so tierAfter, the tier after them, is the tier chosen):");
    measured.forEach((m) => console.log("  " + JSON.stringify(m)));
    /* -------------------------------------------- 5b: the hub marks on the islands */
    {
      /* sections placed in box 1 forty days ago are due: an island with one gets a beacon */
      const seedDue = (page, allSections) => page.evaluate((all) => {
        var day = window.BMSite.dayKey(), old = window.BMReview.recall.addDays(day, -40), isles = Object.keys(window.BMMap3D.info().isles);
        var g = JSON.parse(localStorage.getItem("bm.game.v1") || "{}"); g.sec = g.sec || {};
        var seeds = {}, put = {}, att = JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}");
        window.BMReview.ARENA_SECTIONS.forEach(function (id) {
          var ch = id.split("#")[0];
          if (isles.indexOf(ch) < 0 || (!all && put[ch])) return;
          put[ch] = id; g.sec[id] = { n: 1, ok: 1 }; seeds[id] = { box: 1, last: old };
          /* deck() lists only sections with a solved exercise in the attempt log (Insights.sections), so
             the log seed alone is not enough: this row is what makes the section a deck row at all */
          att[ch] = att[ch] || {};
          att[ch]["x" + id] = { section: id.split("#")[1], solved: Date.now() - 40 * 864e5, first: false, tries: 3 };
        });
        localStorage.setItem("bm.game.v1", JSON.stringify(g));
        localStorage.setItem("bm.attempts.v1", JSON.stringify(att));
        window.BMEvents.seed(seeds);
        return put;
      }, allSections);
      const kindsAfter = async (page) => { await wait(400); return (await info(page)).isles || {}; };
      const hasKind = (isles, re) => Object.keys(isles).filter((id) => re.test(isles[id]));
      const { context, page } = await openMap(browser, MEDIUM);
      await settled(page);
      const first = await info(page);
      const quest = await page.evaluate(() => { const o = {}; Object.keys(window.BM_QUEST.regions).forEach((k) => { o[k] = window.BM_QUEST.regions[k].solid; }); return o; });
      const partOf = await page.evaluate(() => { const o = {}; window.BM_CURRICULUM.chapters.forEach((c) => { o[c.id] = c.part.id; }); return o; });
      const bosses = hasKind(first.isles, /boss:/);
      check(bosses.length > 0 && bosses.every((id) => first.isles[id].split(",").some((k) => k === "boss:" + quest[partOf[id]])), "an unfinished island's boss is its region's solid (" + JSON.stringify(first.isles) + ")");
      check(hasKind(first.isles, /beacon/).length === 0, "no island has a beacon before a section is due");
      await page.evaluate(() => document.documentElement.setAttribute("data-calm", ""));
      let calm = await kindsAfter(page);
      check(hasKind(calm, /boss/).length === 0, "with Study mode on no island has a boss (" + JSON.stringify(calm) + ")");
      await page.evaluate(() => document.documentElement.removeAttribute("data-calm"));
      check(hasKind(await kindsAfter(page), /boss:/).length === bosses.length, "and with it off the bosses are back");
      const put = await seedDue(page, false);
      const due = await kindsAfter(page);
      const beacons = hasKind(due, /beacon/);
      check(Object.keys(put).length > 0 && Object.keys(put).every((ch) => beacons.indexOf(ch) > -1) && beacons.length === Object.keys(put).length, "a seeded due section gives its island a beacon, and only those do (" + JSON.stringify({ put, beacons }) + ")");
      await context.close();
      /* the worst state: every island with a boss and a beacon, against each tier's caps */
      for (const [gfx, tier] of [["low", "low"], ["mid", "medium"], ["high", "high"]]) {
        const w = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) });
        await settled(w.page);
        await seedDue(w.page, true);
        await wait(500);
        const i = await info(w.page);
        const nb = hasKind(i.isles || {}, /beacon/).length;
        check(!i.gone && nb > 0 && i.calls <= i.budget.calls && i.triangles <= i.budget.triangles, tier + ": the worst state (" + nb + " beacons, " + hasKind(i.isles || {}, /boss:/).length + " bosses) is " + i.calls + " calls and " + i.triangles + " triangles, within " + (i.budget && i.budget.calls) + " and " + (i.budget && i.budget.triangles));
        console.log("map: worst state " + tier + " " + JSON.stringify({ calls: i.calls, triangles: i.triangles }));
        await w.context.close();
      }
    }

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
      for (let t = 0; t < 14000 && i && i.tier === "high"; t += 200) { await page.mouse.move(400 + (t % 400), 500); await wait(200); i = await info(page); }
      const p = await prefsOf(page);
      check(i && i.tier === "medium" && p.gfx === "high" && !("gfxAuto" in p), "on High chosen by the learner, slow frames step down to medium for the visit and keep nothing (" + JSON.stringify({ tier: i && i.tier, prefs: p }) + ")");
      await context.close();
    }

    /* -------------------------------------------- 11: the bloom (high tier only) */
    {
      /* the glow is the high tier's: the scene stays inside the high caps, the passes hold to POST_PIXELS (even on
         a dense screen), the chunks come only then, and the light theme has none (O16) */
      const POST_PIXELS = +read("src/world/post.ts").match(/export const POST_PIXELS = ([\d.e+]+);/)[1];
      const bloomed = (page) => page.waitForFunction(() => { var i = window.BMMap3D.info(); return i && i.post.on && i.frames > 1 && i.calls !== null; }, null, { timeout: 30000 }).catch(() => {});
      /* the dark theme: bloomed at 0.55 */
      {
        const theme = "dark", strength = 0.55;
        const { context, page, post } = await openMap(browser, { "bm.prefs.v1": '{"gfx":"high"}', "bm.theme": JSON.stringify(theme) }, { scale: 3 });
        await bloomed(page);
        const i = await info(page);
        check(!i.gone && i.tier === "high" && i.post.on && i.post.passes === 3 && i.post.why === "", theme + ": on the high tier the map draws through the bloom (" + JSON.stringify(i.post || i) + ")");
        check(!i.gone && i.post.pixels > 0 && i.post.pixels <= POST_PIXELS, theme + ": its render targets hold " + (i.post && i.post.pixels) + " pixels, at most " + POST_PIXELS + " (the canvas is " + (i.pixelRatio) + " device pixels per CSS pixel)");
        check(!i.gone && i.post.strength === strength, theme + ": the glow's strength is " + strength + " (" + (i.post && i.post.strength) + ")");
        check(!i.gone && i.calls <= i.budget.calls && i.triangles <= i.budget.triangles, theme + ": the scene's own draw calls and triangles stay within the high caps (" + i.calls + " of " + (i.budget && i.budget.calls) + ", " + i.triangles + " of " + (i.budget && i.budget.triangles) + ")");
        check(post.length === 2, theme + ": the bloom's two chunks were fetched, once each (" + post.length + ")");
        /* the bloom leaves what is not glowing alone: the same view drawn through it and straight to the canvas
           agrees within one level a channel at the island decks (their centres) */
        const px = await page.evaluate(() => {
          var cv = document.querySelector("[data-map3d] canvas"), r = cv.getBoundingClientRect();
          window.BMMap3D.draw(true);
          var a = window.__pixels();
          window.BMMap3D.draw(false);
          var b = window.__pixels();
          var ids = window.BM_CURRICULUM.parts[0].chapters.map(function (ch) { return ch.id; }), worst = 0, n = 0;
          ids.forEach(function (id) {
            var w = window.BMMap3D.where(id);
            if (!w || w.x < r.left + 4 || w.x > r.right - 4 || w.y < r.top + 4 || w.y > r.bottom - 4) return;
            var x = Math.round((w.x - r.left) * a.w / r.width), y = Math.round((w.y - r.top) * a.h / r.height);
            /* a 5 x 5 patch of the deck around the island's centre */
            for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
              var k = ((y + dy) * a.w + x + dx) * 4;
              for (var c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a.d[k + c] - b.d[k + c]));
              n++;
            }
          });
          window.BMMap3D.draw(true);
          return { worst: worst, n: n };
        });
        check(px.n > 0 && px.worst <= 1, theme + ": with the bloom on and forced off the island decks agree within one level a channel (" + JSON.stringify(px) + ")");
        /* a live flip to the light theme drops the bloom, and glow colours return to the tokens */
        await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); });
        await wait(500);
        const l = await info(page);
        check(!l.gone && !l.post.on && l.post.passes === 0 && l.post.pixels === 0 && l.post.strength === 0 && l.post.why === "light", "dark to light turns the bloom off (" + JSON.stringify(l.post || l) + ")");
        await page.waitForFunction(() => { var i = window.BMMap3D.info(); return i && i.frames > 1; }, null, { timeout: 10000 }).catch(() => {});
        await wait(300);
        const flipped = await page.evaluate(() => window.__pixels());
        await context.close();
        /* a page that opened on the light theme never had a bloom: its frame is what the flipped page now draws */
        {
          const c2 = await openMap(browser, { "bm.prefs.v1": '{"gfx":"high"}', "bm.theme": '"light"' }, { scale: 3 });
          await wait(1500);
          const j = await info(c2.page);
          check(!j.gone && j.tier === "high" && !j.post.on && j.post.passes === 0 && j.post.pixels === 0 && j.post.why === "light", "light: on the high tier the map is drawn without the bloom (" + JSON.stringify(j.post || j) + ")");
          check(c2.post.length === 0, "light: the bloom's chunks were never requested (" + c2.post.length + ")");
          const direct = await c2.page.evaluate(() => window.__pixels());
          let differ = 0;
          if (direct.w === flipped.w && direct.h === flipped.h) {
            for (let k = 0; k < direct.d.length; k += 4) {
              if (Math.abs(direct.d[k] - flipped.d[k]) + Math.abs(direct.d[k + 1] - flipped.d[k + 1]) + Math.abs(direct.d[k + 2] - flipped.d[k + 2]) > 6) differ++;
            }
          } else differ = -1;
          check(differ >= 0 && differ / (direct.w * direct.h) <= 0.005, "dark to light puts the glow colours back: the flipped frame matches a light page's (" + differ + " of " + direct.w * direct.h + " pixels differ)");
          /* and the live flip the other way builds it, fetching the chunks then */
          await c2.page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
          await bloomed(c2.page);
          const k = await info(c2.page);
          check(!k.gone && k.post.on && k.post.passes === 3 && k.post.strength === 0.55 && k.post.why === "" && c2.post.length === 2, "light to dark builds the bloom, fetching its two chunks then (" + JSON.stringify({ post: k.post || k, chunks: c2.post.length }) + ")");
          await c2.context.close();
        }
      }
      for (const [gfx, tier] of [["low", "low"], ["mid", "medium"]]) {
        const { context, page, post } = await openMap(browser, { "bm.prefs.v1": JSON.stringify({ gfx }) });
        await wait(1500);
        const i = await info(page);
        check(!i.gone && i.tier === tier && !i.post.on && i.post.passes === 0 && i.post.pixels === 0 && post.length === 0, tier + ": no bloom, and its chunks were never requested (" + JSON.stringify({ post: i.post, requested: post.length }) + ")");
        await context.close();
      }
      {
        /* the watchdog takes the bloom off first, and only then the tier (on the dark theme: the light one has no bloom to take) */
        const { context, page } = await openMap(browser, { "bm.prefs.v1": '{"gfx":"high"}', "bm.theme": '"dark"' }, { hardware: true });
        await bloomed(page);
        const seen = [];
        await page.evaluate(() => { window.__slow = true; });
        for (let t = 0; t < 14000; t += 200) {
          await page.mouse.move(400 + (t % 400), 500);
          await wait(200);
          const j = await info(page);
          if (j.gone) break;
          seen.push(j.tier + (j.post.on ? "+bloom" : ""));
          if (j.tier === "medium") break;
        }
        const order = seen.filter((v, k) => k === 0 || v !== seen[k - 1]);
        check(order.join(" > ") === "high+bloom > high > medium", "slow frames turn the bloom off first (high, bloom on), then the tier down (" + order.join(" > ") + ")");
        await context.close();
      }
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
        var r = document.querySelector("[data-map3d] canvas").getBoundingClientRect(), w = window.BMMap3D.where("ch01") || { x: NaN, y: NaN }, i = window.BMMap3D.info() || {};
        return { hot: i.hot, flying: i.flying, at: [Math.round(w.x - r.left), Math.round(w.y - r.top)], mark: !!document.querySelector("li.stop[data-map-hot]") };
      });
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch09"]').scrollIntoView({ block: "center" }));
      await wait(600);
      const before = await view();
      await page.hover('li.stop[data-chapter="ch09"] .stop-link');
      await wait(1200);
      const away = await view();
      check(away.hot === null && !away.flying && !away.mark && away.at.join() === before.at.join(), "hovering a chapter in the list while the stage is out of view leaves the world where it was (" + JSON.stringify({ before, away }) + ")");
      /* on a screen tall enough for both, hover flies to the island and marks the item (the
         page above the fifth chapter's card has grown: the view control, the search, the
         section lists; the height is what keeps the stage and that card on screen together) */
      await page.setViewportSize({ width: 1280, height: 4000 });
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await wait(600);
      await page.hover('li.stop[data-chapter="ch05"] .stop-link');
      await wait(1200);
      const v = await page.evaluate(() => ({ hot: (window.BMMap3D.info() || {}).hot, mark: !!document.querySelector('li.stop[data-chapter="ch05"][data-map-hot]'), y: window.scrollY }));
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
        var i = window.BMMap3D.info() || {}, st = document.querySelector(".map3d-stage").getBoundingClientRect();
        return { hot: i.hot, flying: i.flying, mark: !!document.querySelector('li.stop[data-chapter="' + i.hot + '"][data-map-hot]'), stageBelowTop: st.bottom > 0 && st.top < window.innerHeight };
      });
      check(ch === "ch01" && k.hot === "ch01" && k.mark && !k.flying, viewport.width + "x" + viewport.height + ": Tab to the first chapter selects its island and marks the list item, though the world is out of view (" + JSON.stringify({ ch, k }) + ")");
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(900);
      const back = await page.evaluate(() => {
        var r = document.querySelector("[data-map3d] canvas").getBoundingClientRect(), w = window.BMMap3D.where("ch01") || { x: NaN, y: NaN };
        var label = document.querySelector('.map3d-label[data-kind="hot"]') || document.querySelector(".map3d-label");
        return { at: [+((w.x - r.left) / r.width).toFixed(2), +((w.y - r.top) / r.height).toFixed(2)], label: label ? label.textContent : null, focus: document.activeElement && document.activeElement.className };
      });
      check(back.at[0] > 0.25 && back.at[0] < 0.75 && back.at[1] > 0.25 && back.at[1] < 0.85 && /Numbers/.test(back.label || ""), viewport.width + "x" + viewport.height + ": scrolled back up, the world is on that chapter, labelled (" + JSON.stringify(back) + ")");
      await context.close();
    }
    {
      /* the plate says what a chapter holds: facts on hover, the goal too on focus; the
         current chapter's plate stays one line; a legend sits inside the stage */
      const { context, page } = await openMap(browser, {}, { context: { viewport: { width: 1280, height: 800 } } });
      const plates = () => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll(".map3d-label"), (el) => ({
        kind: el.getAttribute("data-kind"), meta: (el.querySelector(".map3d-label-meta") || {}).textContent || null,
        goal: (el.querySelector(".map3d-label-goal") || {}).textContent || null, hidden: el.closest("[aria-hidden=true]") !== null,
        pe: getComputedStyle(el).pointerEvents, dollars: /\$/.test(el.textContent) })));
      await wait(1500);
      const pt = await islandPoint(page);
      check(!!pt, "found an island to hover for its plate");
      if (pt) {
        await page.mouse.move(pt.x - 3, pt.y);
        await page.mouse.move(pt.x, pt.y);
        await wait(900);
        const hov = (await plates()).filter((l) => l.meta);
        check(hov.length === 1 && /^\d+ exercises? · about \d+ min$/.test(hov[0].meta || "") && hov[0].goal === null && hov[0].hidden && hov[0].pe === "none",
          "hovering an island: the plate adds the facts line, not the goal (" + JSON.stringify(hov) + ")");
        await page.mouse.move(2, 2);
      }
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await wait(300);
      let tabbed = null;
      for (let k = 0; k < 40 && !tabbed; k++) {
        await page.keyboard.press("Tab");
        tabbed = await page.evaluate(() => { var li = document.activeElement && document.activeElement.closest && document.activeElement.closest("li.stop"); return li && li.getAttribute("data-chapter"); });
      }
      await wait(900);
      /* the first chapter is the current one: its plate takes the facts and the goal while it is looked at */
      const first = (await plates()).filter((l) => l.meta && l.goal);
      check(tabbed === "ch01" && first.length === 1, "Tab to the current chapter: its plate shows the facts and the goal (" + JSON.stringify(first) + ")");
      for (let k = 0; k < 12; k++) {
        await page.keyboard.press("Tab");
        const now = await page.evaluate(() => { var li = document.activeElement && document.activeElement.closest && document.activeElement.closest("li.stop"); return li && li.getAttribute("data-chapter"); });
        if (now && now !== tabbed) break;
      }
      /* the stage is drawn again once it is back on screen */
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(900);
      const foc = await plates();
      const hot = foc.filter((l) => l.kind === "hot"), cur = foc.filter((l) => l.kind === "current");
      check(hot.length === 1 && /^\d+ exercises? · about \d+ min$/.test(hot[0].meta || "") && hot[0].goal && hot[0].goal.length <= 95 && !hot[0].dollars && !/[\\^{}]/.test(hot[0].goal) && cur.every((l) => l.meta === null && l.goal === null),
        "Tab to a chapter: the plate shows the facts and a goal in plain text, and the current plate stays one line (" + JSON.stringify(foc) + ")");
      const lg = await page.evaluate(() => {
        var l = document.querySelector(".map3d-stage > .map3d-legend");
        var items = l ? Array.prototype.filter.call(l.querySelectorAll("li"), (li) => li.offsetParent !== null).length : -1;
        return { in: !!l, hidden: l && l.getAttribute("aria-hidden"), pe: l && getComputedStyle(l).pointerEvents, items, sr: !!document.querySelector(".map3d-legend-sr") };
      });
      check(lg.in && lg.hidden === "true" && lg.pe === "none" && lg.items === 4 && lg.sr, "the legend is inside the stage, aria-hidden, click-through, with four items and a screen-reader copy (" + JSON.stringify(lg) + ")");
      await context.close();
    }
    {
      /* Escape clears a selection first and leaves the map second; the plate never covers its
         island; the legend's glyphs wear the tokens the world draws the marks with */
      const { context, page } = await openMap(browser, {}, { context: { viewport: { width: 1280, height: 800 } } });
      await wait(1500);
      await page.focus(".map3d-stage");
      await page.keyboard.press("ArrowRight");
      await wait(900);
      const sel = await page.evaluate(() => ({ hot: window.BMMap3D.info().hot, panel: !document.querySelector("[data-map3d-panel]").hidden }));
      check(!!sel.hot && sel.panel, "ArrowRight on the stage selects an island and opens the panel (" + JSON.stringify(sel) + ")");
      const plate = await page.evaluate(() => {
        var el = document.querySelector('.map3d-label[data-kind="hot"]'), r = el && el.getBoundingClientRect();
        var a = window.BMMap3D.plates().filter((q) => el && q.i === +el.getAttribute("data-i"))[0];
        return r && a ? { box: [r.left, r.top, r.right, r.bottom], at: [a.x, a.y], below: a.below, shown: el.style.visibility } : null;
      });
      check(!!plate && !(plate.at[0] >= plate.box[0] && plate.at[0] <= plate.box[2] && plate.at[1] >= plate.box[1] && plate.at[1] <= plate.box[3]),
        "the selected island's plate does not cover the island (" + JSON.stringify(plate) + ")");
      /* the flip: walk the selection along the path and drag the camera until an island sits so
         close to the stage's top that its plate has no room above; that plate goes below the
         island, starting under its lowest point, so neither the body nor the marks are covered */
      for (let k = 0; k < 5; k++) { await page.keyboard.press("ArrowRight"); await wait(500); }
      const box = await page.locator("[data-map3d-stage]").boundingBox();
      let flipped = null;
      for (const dx of [-250, -250, -250, -250, -250, -250, 500, 500, 500, 500, 500, 500, 500, 500]) {
        await page.mouse.move(box.x + box.width / 2, box.y + 40);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + 40, { steps: 8 });
        await page.mouse.up();
        await wait(700);
        flipped = await page.evaluate(() => {
          var out = null;
          Array.prototype.forEach.call(document.querySelectorAll(".map3d-label[data-below]"), function (el) {
            if (out || el.style.visibility === "hidden") return;
            var r = el.getBoundingClientRect(), a = window.BMMap3D.plates().filter((q) => q.i === +el.getAttribute("data-i"))[0];
            out = { i: a.i, top: r.top, bottom: r.bottom, deck: [a.x, a.y], isleBottom: a.bottom };
          });
          return out;
        });
        if (flipped) break;
      }
      check(!!flipped, "dragging the camera puts an island near the top and its plate goes below it (data-below)");
      check(!!flipped && flipped.top >= flipped.isleBottom - 1 && flipped.top > flipped.deck[1],
        "the plate below starts under the island's lowest point (" + JSON.stringify(flipped) + ")");
      await page.keyboard.press("Escape");
      await wait(400);
      const esc1 = await page.evaluate(() => ({
        hot: window.BMMap3D.info().hot, stage: document.activeElement === document.querySelector(".map3d-stage"),
        panelHidden: document.querySelector("[data-map3d-panel]").hidden,
        empty: getComputedStyle(document.querySelector(".map3d-panel-empty")).display !== "none",
        marked: !!document.querySelector("li.stop[data-selected]"), hash: location.hash }));
      check(esc1.hot === null && esc1.stage && esc1.panelHidden && esc1.empty && !esc1.marked && !esc1.hash,
        "Escape with a selection clears it, the panel is empty again and the focus stays on the stage (" + JSON.stringify(esc1) + ")");
      await page.keyboard.press("Escape");
      const esc2 = await page.evaluate(() => ({ radio: !!document.activeElement && document.activeElement.getAttribute("aria-checked") === "true", stage: document.activeElement === document.querySelector(".map3d-stage") }));
      check(esc2.radio && !esc2.stage, "a second Escape moves the focus to the checked mode radio (" + JSON.stringify(esc2) + ")");
      const lg = await page.evaluate(() => {
        var stage = document.querySelector(".map3d-stage"), out = {};
        var want = { ring: "--ok", flag: "--ok", boss: "--part-deep", beacon: "--region-glow" };
        Object.keys(want).forEach((m) => {
          var probe = document.createElement("i");
          probe.style.cssText = "color: var(" + want[m] + ")";
          stage.appendChild(probe);
          var expect = getComputedStyle(probe).color;
          probe.remove();
          var cs = getComputedStyle(document.querySelector('.map3d-legend [data-mark="' + m + '"] i'));
          out[m] = { token: want[m], expect, got: m === "ring" ? cs.borderTopColor : cs.backgroundColor };
        });
        return out;
      });
      check(Object.keys(lg).every((m) => lg[m].got === lg[m].expect), "each legend glyph resolves to its world token (" + JSON.stringify(lg) + ")");
      await context.close();
    }
    {
      const { context, page } = await openMap(browser, { "bm.prefs.v1": '{"calm":true,"gfx":"mid"}' }, { context: { viewport: { width: 1280, height: 800 } } });
      const n = await page.evaluate(() => Array.prototype.filter.call(document.querySelectorAll(".map3d-legend li"), (li) => li.offsetParent !== null).length);
      check(n === 3, "in Study mode the legend has three items, no boss (" + n + ")");
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
          return { id: id, hot: (window.BMMap3D.info() || {}).hot, ring: (window.BMMap3D.info() || {}).ring, ink: ink };
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
      await context.addInitScript(() => { try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("bm.prefs.v1", '{"map":"3d"}'); sessionStorage.setItem("__seeded", "1"); } } catch (e) { /* fine */ } });
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
          gap: Math.round(document.querySelector(".hub-head").getBoundingClientRect().top - main.getBoundingClientRect().top - parseFloat(cs.paddingTop)),
          under: Math.round(document.querySelector(".map3d-parts").getBoundingClientRect().top - document.querySelector(".hub-head").getBoundingClientRect().bottom - parseFloat(getComputedStyle(document.querySelector(".map3d")).marginTop)),
          cta: (function (b) { return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; })(document.querySelector("a[data-continue]").getBoundingClientRect()),
          lede: (function (b) { return { top: b.top, bottom: b.bottom }; })(document.querySelector(".hub-lede").getBoundingClientRect()),
          vh: window.innerHeight, vw: window.innerWidth };
      });
      check(r.parsed && r.parsed.world === "3d" && Math.abs(r.hero - r.parsed.hero) <= 1 && r.shifts.length === 0, viewport.width + " wide, the page's module 1.5 s late: the world's place is kept from the first paint and the hero does not move when it arrives (" + JSON.stringify(r) + ")");
      check(r.gap === 0, viewport.width + " wide: the contents page's head starts at main's own padding (" + r.gap + " px more)");
      check(Math.abs(r.under) <= 1, viewport.width + " wide: the Part buttons start at the head's bottom plus the map's margin (" + r.under + " px off)");
      check(r.cta.top >= 0 && r.cta.bottom <= r.vh && r.cta.left >= 0 && r.cta.right <= r.vw, viewport.width + " wide: the primary call to action is inside the first screen, unscrolled (" + JSON.stringify(r.cta) + ")");
      check(r.lede.top >= 0 && r.lede.bottom <= r.vh, viewport.width + " wide: the head's line is inside the first screen, unscrolled (" + JSON.stringify(r.lede) + ")");
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
          var w = window.BMMap3D.where(ch.id) || { x: NaN, y: NaN }, x = Math.round((w.x - r.left) * a.w / r.width), y = Math.round((w.y - r.top) * a.h / r.height);
          return diff((y * a.w + x) * 4);
        });
        return { share: +(changed / (a.w * a.h)).toFixed(3), lit: lit > 0, row: row, fog: (window.BMMap3D.info() || {}).fog };
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
