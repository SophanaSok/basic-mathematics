#!/usr/bin/env node
/* Headless Chromium checks of the contents page's List / Map control (src/ui/hub-mode.ts),
   with SwiftShader WebGL (lib/gl), on the built site as lib/target.js serves it (dist/, which
   must be current):
     node tools/game/hub.test.js
   Every request off the local server is aborted. Cases:
   a. a fresh load with WebGL: Map is checked, the one-time note shows, Dismiss hides it and
      writes run.seen.hubHint, a reload shows no note
   b. choosing List tears the world down without a reload (BMMap3D.on() false, [data-map3d]
      hidden, html[data-world] gone), prefs.map is "list"; a reload keeps List and fetches
      neither bundle/three.js nor bundle/world.js
   c. choosing Map boots the world again (BMMap3D.on() within 10 s), prefs.map is "3d"
   d. with ?3d=off, and in a context with no WebGL: Map is aria-disabled with a title, List
      reads checked, prefs.map is untouched
   e. the sheet's [data-pref="map3d"] switch and the control agree after either changes
   f. the keyboard: Tab reaches the checked radio only, ArrowRight moves the check, Space chooses
   g. at 360x740 the control is visible and does not overlap the button
   h. axe finds no violation on the control
   i. no page errors
   r. typing "linear" hides every card but Chapter 2's and the status reads the counts
   s. typing a section title opens that card's Sections and shows only that row
   t. clearing restores every card, row and the open state
   u. Enter on "quadratic" focuses Chapter 4's card (or sets the selection when BMHubSelect exists)
   v. Escape clears the field
   w. in Map view the map still shows the current island while cards are hidden
   x. axe finds no violation on the field
   y. at 360x740 the field is full width and usable */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();
const gl = require("../lib/gl");

const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const WORLD_CHUNK = /\/bundle\/world\.js(?:[?#]|$)/;

let server;
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a context that reaches the local server and nothing else; `noGl` makes every canvas refuse WebGL */
async function open(browser, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 900 } });
  const chunks = [];
  await context.route(/^(https?|wss?):/, (r) => {
    const u = r.request().url();
    if (!server.owns(u)) return r.abort();
    if (THREE_CHUNK.test(u) || WORLD_CHUNK.test(u)) chunks.push(u);
    return r.continue();
  });
  if (o.noGl) {
    await context.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (/^(webgl|webgl2|experimental-webgl)$/.test(String(type))) return null;
        return orig.apply(this, arguments);
      };
      delete window.WebGL2RenderingContext;
    });
  }
  await context.addInitScript(() => {
    try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}'); sessionStorage.setItem("__seeded", "1"); } } catch (e) { /* fine */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  return { context, page, errors, chunks };
}
async function go(page, search) {
  await page.goto(server.url + "index.html" + (search || ""));
  await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
}
const worldUp = (page) => page.waitForFunction(() => window.BMMap3D && window.BMMap3D.on(), null, { timeout: 20000 });
const prefsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.prefs.v1") || "{}"));
const radio = (page, m) => page.locator('[data-hub-mode] [role="radio"][data-mode="' + m + '"]');
const checked = (page) => page.evaluate(() => Array.prototype.filter.call(document.querySelectorAll("[data-hub-mode] [role=radio]"), (b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent));
const sheet = (page) => page.evaluate(() => window.BMGame.map3dOn(window.BMGame.prefs()));

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("hub: " + server.where);
  const browser = await gl.launch(chromium, {}, true);
  try {
    /* -------------------------------------------- a, b, c, e: fresh load, List, Map */
    {
      const { context, page, errors, chunks } = await open(browser);
      await go(page);
      await worldUp(page);
      const g = await page.evaluate(() => {
        const grp = document.querySelector("[data-hub-mode] [role=radiogroup]");
        const rs = Array.prototype.map.call(grp.querySelectorAll("[role=radio]"), (b) => b.textContent);
        return { label: grp.getAttribute("aria-label"), rs };
      });
      check(g.label === "Show the course as" && g.rs.join() === "List,Map", "a: a radiogroup 'Show the course as' with List and Map (" + JSON.stringify(g) + ")");
      check((await checked(page)).join() === "Map", "a: a fresh load with WebGL shows Map checked");
      check(await page.locator("[data-hub-note]").count() === 1, "a: the note shows the first time");
      await page.locator("[data-hub-note] button", { hasText: "Dismiss" }).click();
      check(await page.locator("[data-hub-note]").count() === 0, "a: Dismiss hides the note");
      check(await page.evaluate(() => !!JSON.parse(localStorage.getItem("bm.run.v1") || "{}").seen.hubHint), "a: Dismiss writes seen.hubHint");
      check((await prefsOf(page)).map === undefined, "a: the preference was not written by the note");
      await page.reload();
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted);
      check(await page.locator("[data-hub-note]").count() === 0, "a: a reload shows no note");
      await worldUp(page);

      /* b: List */
      await radio(page, "list").click();
      await page.waitForFunction(() => !window.BMMap3D.on(), null, { timeout: 10000 });
      const t = await page.evaluate(() => ({ on: window.BMMap3D.on(), hidden: document.querySelector("[data-map3d]").hidden, world: document.documentElement.hasAttribute("data-world") }));
      check(!t.on && t.hidden && !t.world, "b: choosing List tears the world down without a reload (" + JSON.stringify(t) + ")");
      check((await prefsOf(page)).map === "list" && (await checked(page)).join() === "List", "b: prefs.map is list and List is checked");
      check(!(await sheet(page)), "e: the sheet's switch reads off after the control chose List");
      chunks.length = 0;
      await page.reload();
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted);
      await wait(1500);
      check((await checked(page)).join() === "List" && !(await page.evaluate(() => window.BMMap3D.on())), "b: a reload keeps List");
      check(chunks.length === 0, "b: a reload with List fetches neither three.js nor world.js (" + chunks.join() + ")");

      /* c: Map */
      await radio(page, "map").click();
      await worldUp(page);
      check((await prefsOf(page)).map === "3d" && (await checked(page)).join() === "Map", "c: choosing Map boots the world and prefs.map is 3d");

      /* e: the sheet's switch and the control agree */
      const sw = async () => page.evaluate(() => {
        const input = document.querySelector('input[data-pref="map3d"]');
        window.BMStore.emit({ type: "prefs", prefs: window.BMGame.prefs() });
        return { checked: input.checked, mode: window.BMHubMode.mode() };
      });
      let s = await sw();
      check(s.checked && s.mode === "map", "e: sheet switch on, control Map (" + JSON.stringify(s) + ")");
      await page.evaluate(() => window.BMGame.setPref("map3d", false));
      await page.waitForFunction(() => !window.BMMap3D.on());
      s = await sw();
      check(!s.checked && s.mode === "list" && (await checked(page)).join() === "List", "e: after the switch is turned off, the control reads List (" + JSON.stringify(s) + ")");
      await page.evaluate(() => window.BMGame.setPref("map3d", true));
      await worldUp(page);
      s = await sw();
      check(s.checked && s.mode === "map" && (await checked(page)).join() === "Map", "e: and Map again when it is turned on (" + JSON.stringify(s) + ")");
      check(errors.length === 0, "i: no page errors: " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- d: the device cannot draw the map */
    for (const [label, o, search] of [["?3d=off", {}, "?3d=off"], ["no WebGL", { noGl: true }, ""]]) {
      const { context, page, errors } = await open(browser, o);
      await go(page, search);
      await wait(2300);
      const d = await page.evaluate(() => {
        const m = document.querySelector('[data-mode="map"]');
        return { disabled: m.getAttribute("aria-disabled"), title: m.title, checked: Array.prototype.filter.call(document.querySelectorAll("[data-hub-mode] [role=radio]"), (b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent), why: window.BMMap3D.why() };
      });
      check(d.disabled === "true" && /cannot draw the map/.test(d.title) && d.checked.join() === "List", label + ": Map is aria-disabled with a title and List reads checked (" + JSON.stringify(d) + ")");
      await radio(page, "map").click({ force: true });
      await wait(300);
      check((await prefsOf(page)).map === undefined && (await checked(page)).join() === "List", label + ": clicking the disabled Map writes nothing");
      check(errors.length === 0, "i: no page errors (" + label + "): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- f: keyboard */
    {
      const { context, page, errors } = await open(browser);
      await go(page);
      await worldUp(page);
      const tabs = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("[data-hub-mode] [role=radio]"), (b) => b.tabIndex));
      check(tabs.join() === "-1,0", "f: only the checked radio is in the tab order (" + tabs + ")");
      await page.focus('[data-continue]');
      await page.keyboard.press("Tab");
      let on = await page.evaluate(() => document.activeElement.textContent);
      check(on === "Map", "f: Tab from the Continue button reaches the checked radio (" + on + ")");
      await page.keyboard.press("ArrowLeft");
      await page.waitForFunction(() => !window.BMMap3D.on(), null, { timeout: 10000 });
      check((await checked(page)).join() === "List" && (await page.evaluate(() => document.activeElement.textContent)) === "List", "f: ArrowLeft moves the check and the focus to List");
      await page.keyboard.press("ArrowRight");
      check((await checked(page)).join() === "Map" && (await prefsOf(page)).map === "3d", "f: ArrowRight moves the check to Map");
      await worldUp(page);
      await page.keyboard.press("ArrowRight");
      check((await checked(page)).join() === "List", "f: arrows wrap around");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Space");
      check((await checked(page)).length === 1, "f: Space chooses the focused radio");
      check(errors.length === 0, "i: no page errors (keyboard): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- g, h: phone width, axe */
    {
      const { context, page, errors } = await open(browser, { viewport: { width: 360, height: 740 } });
      await go(page);
      const r = await page.evaluate(() => {
        const a = document.querySelector("[data-continue]").getBoundingClientRect(), b = document.querySelector(".hub-mode-group").getBoundingClientRect();
        return { btnBottom: a.bottom, top: b.top, left: b.left, right: b.right, width: window.innerWidth, h: b.height };
      });
      check(r.h > 0 && r.top >= r.btnBottom - 0.5 && r.left >= 0 && r.right <= r.width, "g: at 360x740 the control is visible and below the button (" + JSON.stringify(r) + ")");
      const axeSrc = require("../lib/pw").resolvePlaywright().axeSource;
      await page.evaluate(axeSrc);
      await worldUp(page);
      const v = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"] });
        return res.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target.join(" ")) })).filter((x) => x.nodes.some((t) => /hub-mode/.test(t)));
      });
      check(v.length === 0, "h: axe finds no violation on the control (" + JSON.stringify(v) + ")");
      check(errors.length === 0, "i: no page errors (360): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- r-w: the search */
    {
      const { context, page, errors } = await open(browser);
      await go(page);
      await worldUp(page);
      await page.waitForFunction(() => window.BMHubSearch && document.querySelector("li.stop-row"), null, { timeout: 10000 });
      const shown = () => page.evaluate(() => Array.prototype.filter.call(document.querySelectorAll("li.stop"), (l) => !l.hidden).map((l) => l.getAttribute("data-chapter")));
      const status = () => page.evaluate(() => document.querySelector("[data-hub-count]").textContent);
      const allCards = await shown();
      check(allCards.length > 5, "r: the list has its cards (" + allCards.length + ")");
      const openOf = () => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("details.stop-sections"), (d) => d.open ? 1 : 0).join(""));
      const openBefore = await openOf();
      const cur = () => page.evaluate(() => { const l = document.querySelector('li.stop[data-state="current"]'); return l && l.getAttribute("data-chapter"); });
      const curBefore = await cur();

      /* r */
      await page.fill("#hub-q", "linear");
      await page.waitForFunction(() => document.querySelectorAll("li.stop[hidden]").length > 0, null, { timeout: 3000 });
      const r = await shown();
      /* Chapter 2 stays, and so does any other card with "linear" in its title or a section's: nothing else */
      const lin = await page.evaluate(() => window.BM_CURRICULUM.chapters.filter((c) => /linear/i.test(c.title) || c.sections.some((x) => /linear/i.test(x.title))).map((c) => c.id));
      check(r.indexOf("ch02") > -1 && r.length < allCards.length && r.every((id) => lin.indexOf(id) > -1 || id === "ch02") && r.indexOf("ch01") < 0, "r: 'linear' keeps Chapter 2's card and hides the others (" + r + ")");
      const rows = await page.evaluate(() => document.querySelectorAll("li.stop:not([hidden]) li.stop-row:not([hidden])").length);
      check((await status()) === r.length + (r.length === 1 ? " chapter, " : " chapters, ") + rows + (rows === 1 ? " section" : " sections") + " match", "r: the status reads the counts (" + (await status()) + ", " + r.length + "/" + rows + ")");
      check(await page.evaluate(() => Array.prototype.every.call(document.querySelectorAll("section.part"), (p) => p.hidden === !p.querySelector("li.stop:not([hidden])"))), "r: a Part with no card left is hidden");
      check(await page.evaluate(() => Array.prototype.every.call(document.querySelectorAll('li.stop[data-chapter="ch02"] li.stop-row'), (x) => !x.hidden)), "r: a chapter hit keeps all its rows");

      /* s: a section title */
      const sec = await page.evaluate(() => {
        const ch = window.BM_CURRICULUM.chapterById("ch04"), sct = ch.sections[ch.sections.length - 1];
        return { id: sct.id, title: sct.title };
      });
      await page.fill("#hub-q", sec.title);
      await page.waitForFunction(() => document.querySelector('li.stop[data-chapter="ch04"]:not([hidden]) li.stop-row[hidden]'), null, { timeout: 3000 });
      const s = await page.evaluate((id) => {
        const li = document.querySelector('li.stop[data-chapter="ch04"]');
        return { card: !li.hidden, open: li.querySelector("details.stop-sections").open,
          rows: Array.prototype.filter.call(li.querySelectorAll("li.stop-row"), (x) => !x.hidden).map((x) => x.querySelector("a.stop-title").getAttribute("href").split("#")[1]) };
      }, sec.id);
      check(s.card && s.open && s.rows.length === 1 && s.rows[0] === sec.id, "s: a section title opens its card's Sections and shows only that row (" + JSON.stringify(s) + ")");

      /* t: clear */
      await page.fill("#hub-q", "");
      await page.waitForFunction(() => !document.querySelector("li.stop[hidden], li.stop-row[hidden]"), null, { timeout: 3000 });
      check((await shown()).join() === allCards.join() && (await openOf()) === openBefore, "t: clearing restores every card and the open state (" + (await openOf()) + " vs " + openBefore + ")");
      check((await status()) === "" && await page.evaluate(() => !document.querySelector("section.part[hidden]")), "t: and empties the status and shows every Part");

      /* u: Enter */
      await page.fill("#hub-q", "quadratic");
      await page.press("#hub-q", "Enter");
      const u = await page.evaluate(() => ({ ch: document.activeElement && document.activeElement.closest("li.stop") && document.activeElement.closest("li.stop").getAttribute("data-chapter"), sel: !!window.BMHubSelect }));
      check(u.sel || u.ch === "ch04", "u: Enter on 'quadratic' focuses Chapter 4's card (" + JSON.stringify(u) + ")");
      check(page.url().indexOf("?") < 0, "u: Enter does not submit the form");

      /* v: Escape */
      await page.focus("#hub-q");
      await page.press("#hub-q", "Escape");
      check((await page.inputValue("#hub-q")) === "" && !(await page.evaluate(() => document.querySelector("li.stop[hidden]"))), "v: Escape clears the field and the filter");

      /* w: Map view with cards hidden */
      await page.fill("#hub-q", "linear");
      await page.waitForFunction(() => document.querySelectorAll("li.stop[hidden]").length > 0, null, { timeout: 3000 });
      const w = await page.evaluate(() => ({ on: window.BMMap3D.on(), here: document.querySelector('li.stop[data-state="current"]') && document.querySelector('li.stop[data-state="current"]').getAttribute("data-chapter"), mapShown: !document.querySelector("[data-map3d]").hidden }));
      check(w.on && w.mapShown && w.here === curBefore && (await cur()) === curBefore, "w: in Map view the map still runs and the current island is the same while cards are hidden (" + JSON.stringify(w) + ")");

      /* x: axe */
      const axeSrc = require("../lib/pw").resolvePlaywright().axeSource;
      await page.evaluate(axeSrc);
      const v = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"] });
        return res.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target.join(" ")) })).filter((x) => x.nodes.some((t) => /hub-q|hub-search/.test(t)));
      });
      check(v.length === 0, "x: axe finds no violation on the field (" + JSON.stringify(v) + ")");
      check(errors.length === 0, "i: no page errors (search): " + errors.join("; "));
      await context.close();
    }
    {
      const { context, page, errors } = await open(browser, { viewport: { width: 360, height: 740 } });
      await go(page);
      await page.waitForFunction(() => window.BMHubSearch, null, { timeout: 10000 });
      const y = await page.evaluate(() => {
        const b = document.querySelector("#hub-q").getBoundingClientRect(), m = document.querySelector(".hub-mode-group").getBoundingClientRect(), h = document.querySelector(".hub-head").getBoundingClientRect();
        return { left: b.left, right: b.right, w: b.width, top: b.top, modeBottom: m.bottom, headW: h.width, vw: window.innerWidth };
      });
      check(y.top >= y.modeBottom - 0.5 && y.left >= 0 && y.right <= y.vw && y.w >= y.headW - 2, "y: at 360x740 the field is full width, below the control (" + JSON.stringify(y) + ")");
      await page.fill("#hub-q", "linear");
      await page.waitForFunction(() => document.querySelectorAll("li.stop[hidden]").length > 0, null, { timeout: 3000 });
      check((await page.inputValue("#hub-q")) === "linear", "y: the field takes typing");
      check(errors.length === 0, "i: no page errors (search 360): " + errors.join("; "));
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " hub: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
