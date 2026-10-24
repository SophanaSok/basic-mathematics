#!/usr/bin/env node
/* Headless Chromium checks of Mochi's pool where it draws a 3D stage (src/ui/pet/pool.ts, src/ui/companion.ts),
   with SwiftShader WebGL on the built site (dist/, which must be current), launched as game/mochi.test.js is:
     node tools/game/pet3d.test.js
   The 2D cases of the pool are in game/pet.test.js; these never skip, a stage that does not start fails.
   Chapter page parts/1-algebra/01-numbers.html; every selector is the one pet.test.js uses.
   1. T11: with 3D on the sidebar has data-3d; the click drops it (mode 2d, no data-3d) and the porthole gains
      data-3d; Close brings the sidebar stage back
   2. reduced motion: with the pool's stage up an act writes and plays no clip (data-clip never appears); with
      motion allowed the same act plays "excited"
   3. growth look: data-pet-scale is "0.8" at hatchling and "0.875" at fry
   4. progress.html inline: the porthole has data-3d, exactly one canvas on the page, and a level redraw leaves
      exactly one (dispose, then mount again)
   5. memory: ten open/close rounds on a chapter page leave at most one stage and Mochi canvas, and the JS heap
      (performance.memory, where there is one) grows by under 50 MB; the figure is logged
   6. no page errors in any case */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();
const gl = require("../lib/gl");

const CHAPTER = "parts/1-algebra/01-numbers.html";
let server, browser, fails = 0, passes = 0, cases = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000, polling: 50 }).then(() => true, () => false);
const SEEN = JSON.stringify({ seen: { companion: 1 } });
const TOY = { "toy:ball": "2025-01-01" };
const seedPet = (o) => ({ "bm.pet.v1": JSON.stringify(o) });
const SIDE = () => document.querySelector("figure[data-companion]").hasAttribute("data-3d");
const PORTHOLE = () => document.querySelector(".pet-porthole").hasAttribute("data-3d");

async function open(seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const errors = [];
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) ? r.continue() : r.abort());
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}');
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ "bm.lesson.v1": '{"mode":"page"}', "bm.run.v1": SEEN }, seed || {}));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push("console: " + m.text());
  });
  await page.goto(server.url + (opts.path || CHAPTER), { waitUntil: "load" });
  if (!opts.path) check(await until(page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000), "the companion mounts");
  return { context, page, errors };
}
async function done(c, what) {
  eq(c.errors, [], what + ": no page errors");
  await c.context.close();
}
const openPool = async (page) => { await page.click(".companion-pic"); await until(page, () => !!document.querySelector("dialog.pet-dialog[open]")); };
const canvases = (page, sel) => page.evaluate((q) => document.querySelectorAll(q).length, sel || "canvas");
const STAGES = "canvas.companion-canvas";   // Mochi's canvases: the chapter page has others (s3d-canvas)

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  browser = await gl.launch(chromium, { args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] }, true);   // exact heap figures, and a collection before each, for case 5
  try {
    /* 1: T11 */
    cases++;
    {
      const c = await open();
      check(await until(c.page, SIDE), "stage: the sidebar has data-3d");
      await c.page.click(".companion-pic");
      await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]"));
      eq(await c.page.evaluate(() => ({ mode: window.BMCompanion.info().mode, three: document.querySelector("figure[data-companion]").hasAttribute("data-3d") })), { mode: "2d", three: false }, "stage: the sidebar is 2D with no data-3d while the pool is open");
      check(await until(c.page, PORTHOLE), "stage: the porthole gains data-3d");
      await c.page.keyboard.press("Escape");
      await until(c.page, () => !document.querySelector("dialog.pet-dialog"));
      check(await until(c.page, () => document.querySelector("figure[data-companion]").hasAttribute("data-3d") && window.BMCompanion.info().mode === "3d"), "stage: the sidebar stage is back after close");
      await done(c, "stage");
    }
    /* 2: reduced motion */
    cases++;
    {
      const watch = () => { window.__clip = false; new MutationObserver(() => { if (document.querySelector(".pet-porthole").hasAttribute("data-clip")) window.__clip = true; }).observe(document.querySelector(".pet-porthole"), { attributes: true }); };
      const c = await open(seedPet({ owned: TOY }), { reduced: true });
      await openPool(c.page);
      check(await until(c.page, PORTHOLE), "reduced: the pool's stage is up");
      await c.page.evaluate(watch);
      await c.page.click('button[data-act="play"]');
      check(await until(c.page, () => document.querySelector(".pet-line").textContent === "Mochi zooms around the pool."), "reduced: the line changes");
      await new Promise((r) => setTimeout(r, 1500));
      check(await c.page.evaluate(() => !window.__clip && !document.querySelector(".pet-porthole").hasAttribute("data-clip")), "reduced: no clip played");
      await done(c, "reduced");
      const k = await open(seedPet({ owned: TOY }));
      await openPool(k.page);
      check(await until(k.page, PORTHOLE), "motion: the pool's stage is up");
      await k.page.click('button[data-act="play"]');
      check(await until(k.page, () => document.querySelector(".pet-porthole").getAttribute("data-clip") === "excited", null, 4000), "motion: a clip plays when motion is allowed");
      await done(k, "motion");
    }
    /* 3: the look */
    cases++;
    {
      const D1 = "2026-10-01", D2 = "2026-10-02";
      const ACTS = { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 };
      for (const [name, pet, act, want] of [
        ["hatchling", { v: 1 }, {}, "0.8"],
        ["fry", { v: 1, care: { [D1]: ACTS, [D2]: ACTS } }, { "bm.activity.v1": JSON.stringify({ days: { [D1]: 10, [D2]: 10 } }) }, "0.875"]
      ]) {
        const c = await open(Object.assign(seedPet(pet), act));
        await openPool(c.page);
        check(await until(c.page, PORTHOLE), "look: the stage is up at " + name);
        check(await until(c.page, (v) => document.querySelector(".pet-porthole").getAttribute("data-pet-scale") === v, want, 6000), "look: scale " + want + " at " + name);
        await done(c, "look " + name);
      }
    }
    /* 4: inline */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }), { path: "progress.html" });
      check(await until(c.page, () => !!document.querySelector("#mochi .pet-pool")), "inline: the pool is there");
      check(await until(c.page, PORTHOLE), "inline: the porthole has data-3d");
      eq(await canvases(c.page), 1, "inline: exactly one canvas");
      await c.page.evaluate(() => { window.__old = document.querySelector("#mochi"); window.BMStore.emit({ type: "level" }); });
      check(await until(c.page, () => window.__old !== document.querySelector("#mochi") && !!document.querySelector("#mochi .pet-pool")), "inline: the panel is rebuilt after a level redraw");
      check(await until(c.page, PORTHOLE), "inline: the rebuilt porthole has data-3d");
      eq(await canvases(c.page), 1, "inline: exactly one canvas after the redraw");
      await done(c, "inline");
    }
    /* 5: memory */
    cases++;
    {
      const c = await open();
      check(await until(c.page, SIDE), "memory: the sidebar stage is up");
      const heap = async () => {
        for (let i = 0; i < 3; i++) { await c.page.evaluate(() => { if (window.gc) window.gc(); }); await new Promise((r) => setTimeout(r, 300)); }
        return c.page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
      };
      const before = await heap();
      let worst = 0;
      for (let i = 0; i < 10; i++) {
        await openPool(c.page);
        await until(c.page, PORTHOLE);
        worst = Math.max(worst, await canvases(c.page, STAGES));
        await c.page.keyboard.press("Escape");
        await until(c.page, () => !document.querySelector("dialog.pet-dialog"));
        await until(c.page, SIDE);
        worst = Math.max(worst, await canvases(c.page, STAGES));
      }
      check(worst <= 1, "memory: at most one Mochi canvas at any point (saw " + worst + ")");
      eq(await c.page.evaluate(() => ({ mode: window.BMCompanion.info().mode, stages: window.BMCompanion.info().stage ? 1 : 0 })), { mode: "3d", stages: 1 }, "memory: one stage after ten rounds");
      const after = await heap();
      if (before === null || after === null) console.log("pet3d: performance.memory is absent here; the memory bound is not measured");
      else {
        const mb = (after - before) / 1048576;
        console.log("pet3d: JS heap after ten open/close rounds grew " + mb.toFixed(1) + " MB (" + (before / 1048576).toFixed(1) + " -> " + (after / 1048576).toFixed(1) + ")");
        check(mb < 50, "memory: the heap grew " + mb.toFixed(1) + " MB, under 50");
      }
      await done(c, "memory");
    }
  } finally {
    try { await browser.close(); } catch (e) { console.error("browser close: " + e.message); }
    try { await server.close(); } catch (e) { console.error("server close: " + e.message); }
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " pet3d: " + cases + " cases, " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
