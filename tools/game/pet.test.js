#!/usr/bin/env node
/* Headless Chromium checks of Mochi's pool shell (src/ui/pet/pool.ts, opened by src/ui/companion.ts) on the
   built site (dist/, which must be current):
     node tools/game/pet.test.js
   Chapter page parts/1-algebra/01-numbers.html; pages open with ?3d=off (no WebGL) except case 4.
   1. open: the click opens dialog.pet-dialog[open], the title has focus, body has data-pet, four needs and
      "You have 0 facets."; bundle/pet.js is fetched only after the click
   2. Escape closes it: the dialog and data-pet are gone, focus is back on .companion-pic
   3. the Close button does the same
   4. with 3D on, the sidebar stage is dropped while the dialog is open (mode 2d, no data-3d) and comes back after
   5. hidden: Study mode opens nothing; config pet "off" makes the picture a plain image with no dialog
   6. a seeded bm.pet.v1 tummy of 1 heart reads "Tummy: 1 of 5 hearts" with one filled mark
   7. no page errors in any case */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const CHAPTER = "parts/1-algebra/01-numbers.html";
const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const PET_CHUNK = /\/bundle\/pet\.js(?:[?#]|$)/;
let server, browser, fails = 0, passes = 0, cases = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 6000, polling: 50 }).then(() => true, () => false);
const SEEN = JSON.stringify({ seen: { companion: 1 } });

async function open(seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const requests = [], errors = [];
  context.on("request", (r) => requests.push(r.url()));
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) && (opts.three || !THREE_CHUNK.test(r.request().url())) ? r.continue() : r.abort());
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
  await page.goto(server.url + CHAPTER + (opts.three ? "" : "?3d=off"), { waitUntil: "load" });
  check(await until(page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000), "the companion mounts");
  return { context, page, requests, errors };
}
async function done(c, what) {
  eq(c.errors, [], what + ": no page errors");
  await c.context.close();
}
const dialogOpen = (page) => page.evaluate(() => { const d = document.querySelector("dialog.pet-dialog"); return !!d && d.open; });
const state = (page) => page.evaluate(() => ({
  dialog: !!document.querySelector("dialog.pet-dialog"), pet: document.body.hasAttribute("data-pet"),
  focusPic: document.activeElement === document.querySelector(".companion-pic")
}));

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  browser = await chromium.launch(require("../lib/gl").opts(chromium));
  try {
    /* 1: open */
    cases++;
    {
      const c = await open();
      eq(c.requests.filter((u) => PET_CHUNK.test(u)), [], "open: no pet chunk before the click");
      await c.page.click(".companion-pic");
      check(await until(c.page, () => { const d = document.querySelector("dialog.pet-dialog"); return !!d && d.open; }), "open: the click opens dialog.pet-dialog[open]");
      const d = await c.page.evaluate(() => {
        const dl = document.querySelector("dialog.pet-dialog"), t = dl.querySelector(".pet-title");
        return {
          titleFocus: document.activeElement === t, title: t.textContent, labelled: dl.getAttribute("aria-labelledby") === t.id,
          pet: document.body.hasAttribute("data-pet"), needs: Array.from(dl.querySelectorAll("li[data-need]")).map((l) => l.getAttribute("data-need")),
          facets: dl.querySelector(".pet-facets").textContent, close: !!dl.querySelector("button[data-pet-close]"),
          stage: !!dl.querySelector(".pet-porthole[data-pet-stage]"), line: dl.querySelector(".pet-line").textContent,
          hearts: Array.from(dl.querySelectorAll("li[data-need]")).map((l) => l.querySelectorAll("i[data-on]").length)
        };
      });
      check(d.titleFocus, "open: the title has focus");
      eq(d.title, "Mochi's pool", "open: the title");
      check(d.labelled, "open: aria-labelledby names the title");
      check(d.pet, "open: body has data-pet");
      eq(d.needs, ["tummy", "play", "clean", "spark"], "open: four needs");
      eq(d.hearts, [3, 3, 3, 3], "open: a missing need reads as three hearts");
      eq(d.facets, "You have 0 facets.", "open: the facets line");
      check(d.close && d.stage, "open: Close and the porthole are there");
      eq(d.line, "Mochi is glad to see you.", "open: the line");
      check(c.requests.some((u) => PET_CHUNK.test(u)), "open: the pet chunk was fetched after the click");
      await done(c, "open");
    }
    /* 2: Escape */
    cases++;
    {
      const c = await open();
      await c.page.click(".companion-pic");
      await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]"));
      await c.page.keyboard.press("Escape");
      check(await until(c.page, () => !document.querySelector("dialog.pet-dialog")), "escape: the dialog is gone");
      const s = await state(c.page);
      check(!s.pet, "escape: data-pet is gone");
      check(s.focusPic, "escape: focus is back on the picture");
      await done(c, "escape");
    }
    /* 3: Close */
    cases++;
    {
      const c = await open();
      await c.page.click(".companion-pic");
      await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]"));
      await c.page.click("[data-pet-close]");
      check(await until(c.page, () => !document.querySelector("dialog.pet-dialog")), "close: the dialog is gone");
      const s = await state(c.page);
      check(!s.pet, "close: data-pet is gone");
      check(s.focusPic, "close: focus is back on the picture");
      await c.page.click(".companion-pic");
      check(await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]")), "close: the pool opens again");
      await done(c, "close");
    }
    /* 4: the sidebar stage is dropped while the pool is open (T11) */
    cases++;
    {
      const c = await open({}, { three: true });
      const had = await until(c.page, () => document.querySelector("figure[data-companion]").hasAttribute("data-3d"), null, 12000);
      console.log("pet: sidebar 3D " + (had ? "was up" : "did not start here (2D asserts only)"));
      await c.page.click(".companion-pic");
      await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]"));
      const open_ = await c.page.evaluate(() => ({ mode: window.BMCompanion.info().mode, three: document.querySelector("figure[data-companion]").hasAttribute("data-3d") }));
      eq(open_, { mode: "2d", three: false }, "stage: the sidebar is 2D with no data-3d while the pool is open");
      await c.page.keyboard.press("Escape");
      await until(c.page, () => !document.querySelector("dialog.pet-dialog"));
      if (had) check(await until(c.page, () => document.querySelector("figure[data-companion]").hasAttribute("data-3d") && window.BMCompanion.info().mode === "3d", null, 12000), "stage: the sidebar stage is back after close");
      await done(c, "stage");
    }
    /* 5: hidden */
    cases++;
    {
      const c = await open();
      await c.page.evaluate(() => document.documentElement.setAttribute("data-calm", ""));
      const vis = await c.page.evaluate(() => getComputedStyle(document.querySelector("figure[data-companion]")).display);
      eq(vis, "none", "study mode: the figure is hidden");
      await c.page.evaluate(() => document.querySelector(".companion-pic").click());
      await new Promise((r) => setTimeout(r, 400));
      check(!(await dialogOpen(c.page)) && !(await state(c.page)).dialog, "study mode: a click opens nothing");
      eq(c.requests.filter((u) => PET_CHUNK.test(u)), [], "study mode: no pet chunk");
      await done(c, "study mode");
    }
    cases++;
    {
      const c = await open();
      await c.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { pet: "off" }); window.BMStore.emit({ type: "prefs" }); });
      check(await until(c.page, () => { const p = document.querySelector(".companion-pic"); return !!p && p.tagName === "SPAN"; }), "pet off: the picture is a span");
      const d = await c.page.evaluate(() => { const p = document.querySelector(".companion-pic"); return { role: p.getAttribute("role"), label: p.getAttribute("aria-label") }; });
      eq(d, { role: "img", label: "Mochi, your companion, idle" }, "pet off: role img and the old label");
      await c.page.click(".companion-pic", { force: true });
      await new Promise((r) => setTimeout(r, 300));
      check(!(await state(c.page)).dialog, "pet off: no dialog");
      await done(c, "pet off");
    }
    /* 6: a seeded need */
    cases++;
    {
      const c = await open({ "bm.pet.v1": JSON.stringify({ needs: { tummy: { n: 1, at: Date.now() } } }) });
      await c.page.click(".companion-pic");
      await until(c.page, () => !!document.querySelector("dialog.pet-dialog[open]"));
      const t = await c.page.evaluate(() => { const l = document.querySelector('li[data-need="tummy"]'); return { label: l.getAttribute("aria-label"), on: l.querySelectorAll("i[data-on]").length, all: l.querySelectorAll("i").length }; });
      eq(t, { label: "Tummy: 1 of 5 hearts", on: 1, all: 5 }, "seeded: the tummy row");
      await done(c, "seeded");
    }
  } finally {
    try { await browser.close(); } catch (e) { console.error("browser close: " + e.message); }
    try { await server.close(); } catch (e) { console.error("server close: " + e.message); }
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " pet: " + cases + " cases, " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
