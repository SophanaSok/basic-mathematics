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
   j. a load with #ch03 in Map: that island is selected (BMMap3D.info().hot) and its card is marked
   k. the same in List: the card is focused and inside the viewport
   l. focusing a card in Map writes the hash through replaceState (history.length unchanged)
   m. Map -> List keeps the hash and the marked card; List -> Map frames the island again
   n. a chapter page's "All chapters" and "Course contents" links carry #<chapter>; following one marks the card
   o. a reload keeps the selection
   p. a load with an unknown hash marks nothing and throws nothing
   z1. selecting ch03 by focusing its card shows the panel: "Chapter 3" in the title, the Open link equal to the
      card's, the state text matching the card's meta
   z2. a chapter that requires another shows "Builds on" links to the named chapters' links
   z3. hovering another island with the mouse replaces the panel's title, leaving restores it
   z4. Where I am selects the current chapter and sets the hash to it
   z5. ?3d=off: no panel, List checked, the .hub-mode-why line reads the reason
   z6. a forced failure (world.js blocked) announces into #bm-live, focuses the selected card, and the line reads
   z7. 360x740: the panel is below the stage, its buttons at least 44 px tall and not overlapping
   z8. axe finds no violation with the panel open
   z9. no page errors
   i/q. no page errors */
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
    if (o.blockWorld && WORLD_CHUNK.test(u)) return r.abort();
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

    /* -------------------------------------------- j, l, m, o, p: the shared selection */
    const marked = (page) => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("li.stop[data-selected]"), (li) => li.getAttribute("data-chapter")));
    const hotOf = (page) => page.evaluate(() => (window.BMMap3D.info() || {}).hot);
    {
      const { context, page, errors } = await open(browser);
      await page.goto(server.url + "index.html#ch03");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await worldUp(page);
      check((await hotOf(page)) === "ch03", "j: a load with #ch03 selects that island (" + (await hotOf(page)) + ")");
      check((await marked(page)).join() === "ch03", "j: and marks its card (" + (await marked(page)) + ")");
      /* o: a reload keeps it */
      await page.reload();
      await worldUp(page);
      check((await hotOf(page)) === "ch03" && (await marked(page)).join() === "ch03", "o: a reload keeps the selection");
      /* l: focus writes the hash through replaceState */
      const len = await page.evaluate(() => history.length);
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch05"] .stop-link').focus());
      await page.waitForFunction(() => location.hash === "#ch05", null, { timeout: 5000 });
      check((await page.evaluate(() => history.length)) === len, "l: focusing a card adds no history entry");
      check((await marked(page)).join() === "ch05" && (await hotOf(page)) === "ch05", "l: the mark and the island follow the focus");
      /* m: Map -> List -> Map */
      await radio(page, "list").click();
      await page.waitForFunction(() => !window.BMMap3D.on(), null, { timeout: 10000 });
      check((await page.evaluate(() => location.hash)) === "#ch05" && (await marked(page)).join() === "ch05", "m: Map -> List keeps the hash and the marked card");
      await radio(page, "map").click();
      await worldUp(page);
      check((await hotOf(page)) === "ch05", "m: List -> Map frames the island again (" + (await hotOf(page)) + ")");
      check(errors.length === 0, "q: no page errors (selection in Map): " + errors.join("; "));
      await context.close();
    }
    {
      const { context, page, errors } = await open(browser, { viewport: { width: 1280, height: 600 } });
      await context.addInitScript(() => { try { localStorage.setItem("bm.prefs.v1", '{"map":"list"}'); } catch (e) { /* fine */ } });
      await page.goto(server.url + "index.html#ch07");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await wait(1500);
      const k = await page.evaluate(() => {
        const li = document.querySelector('li.stop[data-chapter="ch07"]'), r = li.getBoundingClientRect();
        return { on: window.BMMap3D.on(), focused: document.activeElement === li.querySelector(".stop-link"), marked: li.hasAttribute("data-selected"), top: r.top, bottom: r.bottom, vh: window.innerHeight };
      });
      check(!k.on && k.marked && k.focused && k.top >= 0 && k.bottom <= k.vh, "k: in List the card is marked, focused and in the viewport (" + JSON.stringify(k) + ")");
      /* p: an unknown hash, on a load (a hash changed in place to one that names no chapter keeps the mark) */
      await page.goto(server.url + "index.html#nope");
      await page.reload();
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await wait(500);
      check((await marked(page)).length === 0 && (await page.evaluate(() => window.BMHubSelect.current())) === null, "p: an unknown hash marks nothing");
      check(errors.length === 0, "q: no page errors (selection in List): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- z: the selection panel, Where I am, failure */
    {
      const { context, page, errors } = await open(browser);
      await page.goto(server.url + "index.html");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await worldUp(page);
      const panelOf = (pg) => pg.evaluate(() => {
        const el = document.querySelector("[data-map3d-panel]");
        const t = el && el.querySelector(".map3d-panel-title");
        const open = el && el.querySelector("[data-map3d-open]");
        return { hidden: !el || el.hidden, title: t ? t.textContent : "", text: el ? el.textContent : "", open: open ? open.href : null,
          heads: el ? el.querySelectorAll("h1,h2,h3,h4,h5,h6").length : -1,
          builds: el ? Array.prototype.map.call(el.querySelectorAll(".map3d-panel-builds a"), (a) => a.href) : [] };
      });
      const cardOf = (pg, id) => pg.evaluate((cid) => {
        const a = document.querySelector('li.stop[data-chapter="' + cid + '"] .stop-link');
        return { href: a.href, meta: a.querySelector(".meta").textContent };
      }, id);
      check((await panelOf(page)).hidden, "z1: no panel before anything is selected");
      /* z1 */
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch03"] .stop-link').focus());
      await page.waitForFunction(() => !document.querySelector("[data-map3d-panel]").hidden, null, { timeout: 5000 });
      let pn = await panelOf(page), card = await cardOf(page, "ch03");
      check(/Chapter 3/.test(pn.title), "z1: the title names Chapter 3 (" + pn.title + ")");
      check(pn.open === card.href, "z1: the Open link is the card's (" + pn.open + " vs " + card.href + ")");
      const ex = /(\d+) \/ (\d+) exercises/.exec(card.meta), sec = /(\d+) sections/.exec(card.meta);
      check(ex ? pn.text.indexOf(ex[1] + " of " + ex[2] + " exercises") > -1 : !!sec && pn.text.indexOf(sec[1] + " sections") > -1,
        "z1: the state matches the card's meta (" + card.meta + " / " + pn.text + ")");
      check(pn.heads === 0, "z1: no heading in the panel");
      /* z2 */
      const wantB = await page.evaluate(() => ["ch01", "ch02"].map((id) => document.querySelector('li.stop[data-chapter="' + id + '"] .stop-link').href));
      check(pn.builds.join() === wantB.join(), "z2: Builds on names ch01 and ch02 by the cards' links (" + pn.builds + ")");
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch06"] .stop-link').focus());
      await page.waitForFunction(() => /Chapter 6/.test(document.querySelector(".map3d-panel-title").textContent), null, { timeout: 5000 });
      pn = await panelOf(page);
      const want5 = await cardOf(page, "ch05");
      check(pn.builds.join() === want5.href, "z2: ch06 builds on ch05 (" + pn.builds + ")");
      /* z3: the pointer */
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch03"] .stop-link').focus());
      await page.waitForFunction(() => /Chapter 3/.test(document.querySelector(".map3d-panel-title").textContent), null, { timeout: 5000 });
      await page.evaluate(() => document.querySelector("[data-map3d] .map3d-stage").scrollIntoView({ block: "center" }));
      await wait(1200);
      let pos = null;
      for (const id of ["ch04", "ch05", "ch02"]) {
        pos = await page.evaluate((cid) => window.BMMap3D.where(cid), id);
        const inside = pos && await page.evaluate((q) => { const r = document.querySelector(".map3d-canvas").getBoundingClientRect(); return q.x > r.left && q.x < r.right && q.y > r.top && q.y < r.bottom; }, pos);
        if (!inside) { pos = null; continue; }
        await page.mouse.move(pos.x - 40, pos.y - 40);
        await page.mouse.move(pos.x, pos.y, { steps: 4 });
        try {
          await page.waitForFunction((n) => !/Chapter 3/.test(document.querySelector(".map3d-panel-title").textContent) && document.querySelector(".map3d-panel-title").textContent.length > 0, id, { timeout: 2500 });
          break;
        } catch (e) { pos = null; }
      }
      pn = await panelOf(page);
      check(pos && !/Chapter 3/.test(pn.title), "z3: hovering another island replaces the title (" + pn.title + ")");
      const cv = await page.evaluate(() => { const r = document.querySelector(".map3d-canvas").getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; });
      await page.mouse.move(cv.x, cv.y, { steps: 6 });
      await page.mouse.move(cv.x + 1, cv.y + 1);
      await page.waitForFunction(() => /Chapter 3/.test(document.querySelector(".map3d-panel-title").textContent), null, { timeout: 4000 }).catch(() => {});
      pn = await panelOf(page);
      check(/Chapter 3/.test(pn.title), "z3: leaving restores the selection's title (" + pn.title + ")");
      /* z4: Where I am */
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch05"] .stop-link').focus());
      await page.waitForFunction(() => location.hash === "#ch05");
      const curId = await page.evaluate(() => window.BMMap3D.info().current);
      check(await page.locator("[data-map3d-recenter]").isEnabled(), "z4: Where I am is enabled when there is a current chapter");
      await page.locator("[data-map3d-recenter]").click();
      await page.waitForFunction((id) => location.hash === "#" + id, curId, { timeout: 5000 }).catch(() => {});
      check((await page.evaluate(() => location.hash)) === "#" + curId && (await hotOf(page)) === curId, "z4: Where I am selects the current chapter " + curId + " (" + (await page.evaluate(() => location.hash)) + ")");
      /* z8: axe with the panel open */
      const axeSrc = require("../lib/pw").resolvePlaywright().axeSource;
      await page.evaluate(axeSrc);
      const ax = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"] });
        return res.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target.join(" ")) }));
      });
      check(!(await panelOf(page)).hidden && ax.length === 0, "z8: axe finds no violation with the panel open (" + JSON.stringify(ax) + ")");
      check(errors.length === 0, "z9: no page errors (panel): " + errors.join("; "));
      await context.close();
    }
    /* z5: the device cannot draw it */
    {
      const { context, page, errors } = await open(browser);
      await go(page, "?3d=off");
      await page.waitForSelector(".hub-mode-why", { timeout: 5000 });
      const d = await page.evaluate(() => ({ why: document.querySelector(".hub-mode-why").textContent, role: document.querySelector(".hub-mode-why").getAttribute("role"),
        panel: document.querySelectorAll("[data-map3d-panel]").length, checked: window.BMHubMode.mode() }));
      check(d.panel === 0 && d.checked === "list" && d.role === "status" && /cannot draw the map/.test(d.why), "z5: ?3d=off shows no panel, List, and the reason line (" + JSON.stringify(d) + ")");
      check(errors.length === 0, "z9: no page errors (3d=off): " + errors.join("; "));
      await context.close();
    }
    /* z6: a failure to fetch the world */
    {
      const { context, page, errors } = await open(browser, { blockWorld: true });
      await page.goto(server.url + "index.html#ch03");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await page.waitForSelector(".hub-mode-why", { timeout: 15000 });
      await page.waitForFunction(() => /could not start/.test((document.getElementById("bm-live") || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
      const f = await page.evaluate(() => ({
        live: (document.getElementById("bm-live") || {}).textContent || "", why: document.querySelector(".hub-mode-why").textContent,
        focused: document.activeElement === document.querySelector('li.stop[data-chapter="ch03"] .stop-link'), reason: window.BMMap3D.why(), mode: window.BMHubMode.mode()
      }));
      check(/could not start/.test(f.live), "z6: the failure is announced in #bm-live (" + f.live + ")");
      check(f.focused, "z6: the selected card is focused (" + JSON.stringify(f) + ")");
      check(/could not start/.test(f.why) && f.mode === "list", "z6: the control shows List with the reason line (" + f.why + ")");
      check(errors.length === 0, "z9: no page errors (failure): " + errors.join("; "));
      await context.close();
    }
    /* z7: a phone */
    {
      const { context, page, errors } = await open(browser, { viewport: { width: 360, height: 740 } });
      await page.goto(server.url + "index.html#ch03");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      await worldUp(page);
      await page.waitForFunction(() => !document.querySelector("[data-map3d-panel]").hidden, null, { timeout: 5000 });
      const g = await page.evaluate(() => {
        const st = document.querySelector(".map3d-stage").getBoundingClientRect(), pn = document.querySelector("[data-map3d-panel]").getBoundingClientRect();
        const btns = Array.prototype.map.call(document.querySelectorAll("[data-map3d-recenter], [data-map3d-panel] a.btn"), (b) => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height }; });
        let overlap = false;
        for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
          const a = btns[i], c = btns[j];
          if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) overlap = true;
        }
        return { below: pn.top >= st.bottom - 0.5, minH: Math.min.apply(null, btns.map((x) => x.h)), n: btns.length, overlap, inside: pn.right <= window.innerWidth + 0.5 };
      });
      check(g.below && g.minH >= 44 && g.n >= 2 && !g.overlap && g.inside, "z7: at 360x740 the panel is below the stage, buttons >= 44 px, not overlapping (" + JSON.stringify(g) + ")");
      check(errors.length === 0, "z9: no page errors (phone): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- n: the return links */
    {
      const { context, page, errors } = await open(browser);
      await context.addInitScript(() => { try { localStorage.setItem("bm.prefs.v1", '{"map":"list"}'); } catch (e) { /* fine */ } });
      await page.goto(server.url + "index.html");
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted, null, { timeout: 15000 });
      const href = await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch01"] .stop-link').getAttribute("href"));
      await page.goto(server.url + href);
      await page.waitForSelector("[data-sidebar] a", { timeout: 15000 });
      const links = await page.evaluate(() => ({
        side: Array.prototype.map.call(document.querySelectorAll("[data-sidebar] a"), (a) => a.getAttribute("href")).filter((h) => /index\.html/.test(h)),
        nav: Array.prototype.map.call(document.querySelectorAll("[data-chapter-nav] a"), (a) => a.getAttribute("href")).filter((h) => /index\.html/.test(h))
      }));
      check(links.side.length === 1 && /index\.html#ch01$/.test(links.side[0]), "n: the sidebar's All chapters link ends with index.html#ch01 (" + JSON.stringify(links.side) + ")");
      check(links.nav.length >= 1 && links.nav.every((h) => /index\.html#ch01$/.test(h)), "n: the chapter nav's Course contents link carries it (" + JSON.stringify(links.nav) + ")");
      await page.locator('[data-sidebar] a', { hasText: "All chapters" }).click();
      await page.waitForFunction(() => window.BMHubSelect, null, { timeout: 15000 });
      await wait(1000);
      check((await marked(page)).join() === "ch01", "n: following it lands with the card marked (" + (await marked(page)) + ")");
      check(errors.length === 0, "q: no page errors (return links): " + errors.join("; "));
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
