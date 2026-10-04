#!/usr/bin/env node
/* Headless Chromium checks of the 3D course map (assets/map3d.js) and the Three.js
   loader (assets/three-loader.js), over file:// URLs with SwiftShader WebGL.
     BM_PLAYWRIGHT_FROM=~/dev/json-data-drift-analyzer/ node tools/game/map.test.js
   The pinned three.min.js is served from .cache/ (fetched once from jsDelivr and
   checked against the loader's integrity hash); every other request is aborted.
   Without it, the checks are skipped with a note.

   1. the "you are here" bob ends: an idle page asks for no frames; never bobs when calm
      or under reduced motion
   2. a frame held while the tab is hidden, or a long task, does not tear the map down
   3. an island acts like its list link: Ctrl+click opens a new tab, a press on empty
      ground dragged onto an island and released opens nothing
   4. after a timeout, the late copy of three.min.js does not replace window.THREE or
      bring it back after the load said no */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "../..");
const FROM = process.env.BM_PLAYWRIGHT_FROM || path.join(process.env.HOME || "", "dev/json-data-drift-analyzer/");
const { chromium } = createRequire(FROM.endsWith("/") ? FROM : FROM + "/")("playwright");

const LOADER = fs.readFileSync(path.join(ROOT, "assets/three-loader.js"), "utf8");
const JSD = LOADER.match(/"(https:\/\/cdn\.jsdelivr\.net\/[^"]+)"/)[1];
const SRI = LOADER.match(/var SRI = "sha512-([^"]+)"/)[1];
const CACHE = path.join(ROOT, ".cache", "three-0.160.1.min.js");
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];

const url = (p) => "file://" + path.join(ROOT, p);
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sri = (buf) => crypto.createHash("sha512").update(buf).digest("base64");

function fetchBody(u) {
  return new Promise((resolve, reject) => {
    https.get(u, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error("HTTP " + res.statusCode)); return; }
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => resolve(Buffer.concat(parts)));
    }).on("error", reject);
  });
}
async function three() {
  try {
    const b = fs.readFileSync(CACHE);
    if (sri(b) === SRI) return b;
  } catch (e) { /* not cached yet */ }
  try {
    const b = await fetchBody(JSD);
    if (sri(b) !== SRI) return null;
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, b);
    return b;
  } catch (e) {
    return null;
  }
}
const js = (body) => ({ status: 200, headers: { "content-type": "application/javascript", "access-control-allow-origin": "*" }, body });

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

async function openMap(browser, body, seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: opts.reducedMotion || "no-preference" });
  await context.route(/^(https?|wss?):/, (r) => /^https:\/\/cdnjs\.cloudflare\.com\/.*three\.min\.js$/.test(r.request().url()) ? r.fulfill(js(body)) : r.abort());
  await context.addInitScript(RAF_GATE);
  await context.addInitScript((seed) => {
    try { Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); }); } catch (e) { /* fine */ }
  }, seed || {});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(url("index.html"));
  await page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on() &&
    document.querySelector(".map3d-stage[data-state=ready]"), null, { timeout: 20000 });
  await page.evaluate(() => { var c = document.querySelector("[data-map3d] canvas"); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 20); });
  return { context, page, errors };
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

async function run() {
  const body = await three();
  if (!body) {
    console.log("SKIP map: three.min.js 0.160.1 is not in .cache/ and could not be fetched from " + JSD);
    return;
  }
  const browser = await chromium.launch({ args: ARGS });
  try {
    /* -------------------------------------------- 1: the bob ends */
    {
      const { context, page, errors } = await openMap(browser, body);
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
      await context.close();
    }
    for (const how of ["calm", "reduced motion"]) {
      const { context, page } = await openMap(browser, body, how === "calm" ? { "bm.prefs.v1": '{"calm":true}' } : {}, how === "calm" ? {} : { reducedMotion: "reduce" });
      await wait(800);
      const r = await idle(page, 2500);
      check(!r.bob && r.frames === 0, "no bob and no frames with " + how + " (" + JSON.stringify(r) + ")");
      await context.close();
    }

    /* -------------------------------------------- 2: a pause is not a slow frame */
    {
      const { context, page } = await openMap(browser, body);
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
      const { context, page } = await openMap(browser, body);
      await page.click(".map3d-part[data-p=\"2\"]");
      await page.evaluate(() => { var t = Date.now(); while (Date.now() - t < 2500) { /* a long task */ } });
      await wait(3000);
      const s = await mapState(page);
      check(s.on && !s.why, "a 2.5 s long task keeps the map (" + JSON.stringify(s) + ")");
      await context.close();
    }

    /* -------------------------------------------- 3: an island is a link */
    {
      let { context, page } = await openMap(browser, body);
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

        await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => null), page.mouse.click(pt.x, pt.y)]);
        check(/\/parts\/.+\.html/.test(page.url()), "a plain click on the same island opens its chapter (" + page.url() + ")");
      }
      await context.close();
    }

    /* -------------------------------------------- 4: a late copy of Three.js */
    for (const second of ["ok", "fails"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const warns = [];
      page.on("console", (m) => { if (/deprecated/.test(m.text())) warns.push(m.text()); });
      await page.route("https://cdnjs.cloudflare.com/**", async (r) => { await wait(1500); await r.fulfill(js(body)).catch(() => {}); });
      await page.route("https://cdn.jsdelivr.net/**", (r) => second === "ok" ? r.fulfill(js(body)) : r.abort());
      await page.setContent("<!doctype html><title>loader</title>");
      const src = LOADER.replace("var TIMEOUT = 8000;", "var TIMEOUT = 600;");
      check(src !== LOADER, "the loader's timeout can be shortened for the check");
      await page.addScriptTag({ content: src });
      const r = await page.evaluate(() => window.BM3D.load().then(function (ok) {
        window.__first = window.THREE;
        return { ok: ok, why: window.BM3D.why };
      }));
      await wait(2500);
      const after = await page.evaluate(() => ({ same: window.THREE === window.__first, three: !!window.THREE }));
      const ran = warns.length;
      if (second === "ok") {
        check(r.ok && after.same && ran === 2, "late copy after a timeout leaves the copy in use (" + JSON.stringify({ r, after, ran }) + ")");
      } else {
        check(!r.ok && r.why === "cdn" && !after.three && ran === 1, "late copy after the load said no leaves no THREE behind (" + JSON.stringify({ r, after, ran }) + ")");
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " map: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
