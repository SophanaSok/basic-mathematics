#!/usr/bin/env node
/* Headless Chromium checks of the contents page's List / Map control (src/ui/hub-mode.ts),
   with SwiftShader WebGL (lib/gl), on the built site as lib/target.js serves it (dist/, which
   must be current):
     node tools/game/hub.test.js
   Every request off the local server is aborted. Cases:
   a. a fresh load with WebGL: List is checked, prefs.map is unset, no 3D chunk is fetched, the one-time note shows, Dismiss hides it and
      writes run.seen.hubHint, a reload shows no note
   a2. at 400 px wide the note sits below the control (at the viewport's foot) and nothing covers the Map radio
   a3. with the note shown, choosing Map removes it, writes run.seen.hubHint and leaves the focus on the Map radio; a reload shows no note
   b. choosing List tears the world down without a reload (BMMap3D.on() false, [data-map3d]
      hidden, html[data-world] gone), prefs.map is "list"; a reload keeps List and fetches
      neither bundle/three.js nor bundle/world.js
   c. choosing Map (from the fresh List) boots the world (BMMap3D.on() within 20 s), prefs.map is "3d"
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
   q. no page errors
   r. typing "linear" hides every card but Chapter 2's and the status reads the counts
   s. typing a section title opens that card's Sections and shows only that row
   t. clearing restores every card, row and the open state
   u. Enter on "quadratic" focuses Chapter 4's card (or sets the selection when BMHubSelect exists)
   v. Escape clears the field
   w. in Map view the map still shows the current island while cards are hidden
   x. axe finds no violation on the field
   y. at 360x740 the field is full width and usable
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
   k1. Tab from the last Part button lands on the course map's stage, named for the current chapter, which is selected
   k2. ArrowRight/ArrowLeft/End/Home move the selection, the hash and the panel's title follow
   k3. Enter opens the selected chapter's page
   k4. Escape moves the focus to the checked List/Map radio
   k5. with the stage focused j moves no cursor and g h goes nowhere
   k6. under reduced motion a step is a cut
   k7. the ? sheet lists the Course map group on the contents page
   k8. axe passes with the stage focusable
   k9. no page errors */
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
  await context.addInitScript((map) => {
    try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}'); if (map) localStorage.setItem("bm.prefs.v1", '{"map":"3d"}'); sessionStorage.setItem("__seeded", "1"); } } catch (e) { /* fine */ }
  }, o.fresh ? false : true);
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
      const { context, page, errors, chunks } = await open(browser, { fresh: true });
      await go(page);
      await wait(1500);
      const g = await page.evaluate(() => {
        const grp = document.querySelector("[data-hub-mode] [role=radiogroup]");
        const rs = Array.prototype.map.call(grp.querySelectorAll("[role=radio]"), (b) => b.textContent);
        return { label: grp.getAttribute("aria-label"), rs };
      });
      check(g.label === "Show the course as" && g.rs.join() === "List,Map", "a: a radiogroup 'Show the course as' with List and Map (" + JSON.stringify(g) + ")");
      check((await checked(page)).join() === "List", "a: a fresh load with WebGL shows List checked");
      check(chunks.length === 0 && !(await page.evaluate(() => window.BMMap3D.on())), "a: a fresh load fetches no 3D chunk (" + chunks.join() + ")");
      check(await page.locator("[data-hub-note]").count() === 1, "a: the note shows the first time");
      await page.locator("[data-hub-note] button", { hasText: "Dismiss" }).click();
      check(await page.locator("[data-hub-note]").count() === 0, "a: Dismiss hides the note");
      check(await page.evaluate(() => !!JSON.parse(localStorage.getItem("bm.run.v1") || "{}").seen.hubHint), "a: Dismiss writes seen.hubHint");
      check((await prefsOf(page)).map === undefined, "a: the preference was not written by the note");
      await page.reload();
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted);
      check(await page.locator("[data-hub-note]").count() === 0, "a: a reload shows no note");

      /* c: Map */
      await radio(page, "map").click();
      await worldUp(page);
      check((await prefsOf(page)).map === "3d" && (await checked(page)).join() === "Map", "c: choosing Map boots the world and prefs.map is 3d");

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
      await radio(page, "map").click();
      await worldUp(page);

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

    /* -------------------------------------------- a2, a3: the note never covers the control and a choice dismisses it */
    {
      const { context, page, errors } = await open(browser, { fresh: true, viewport: { width: 400, height: 800 } });
      await go(page);
      await page.locator("[data-hub-note]").waitFor();
      const g = await page.evaluate(() => {
        const note = document.querySelector("[data-hub-note]").getBoundingClientRect();
        const grp = document.querySelector("[data-hub-mode] [role=radiogroup]").getBoundingClientRect();
        const m = document.querySelector('[data-mode="map"]');
        const r = m.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { noteTop: note.top, groupBottom: grp.bottom, covered: !(top === m || m.contains(top)) };
      });
      check(g.noteTop >= g.groupBottom - 1, "a2: at 400 px the note sits below the control (" + JSON.stringify(g) + ")");
      check(!g.covered, "a2: nothing covers the Map radio while the note shows");
      await radio(page, "map").click();
      check(await page.locator("[data-hub-note]").count() === 0, "a3: choosing Map removes the note");
      check(await page.evaluate(() => !!JSON.parse(localStorage.getItem("bm.run.v1") || "{}").seen.hubHint), "a3: choosing Map writes seen.hubHint");
      check(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-mode") === "map"), "a3: the focus is on the Map radio");
      await page.reload();
      await page.waitForFunction(() => window.BMHubMode && window.BMHubMode.state().mounted);
      check(await page.locator("[data-hub-note]").count() === 0, "a3: a reload shows no note");
      check(errors.length === 0, "i: no page errors (a2, a3): " + errors.join("; "));
      await context.close();
    }

    /* -------------------------------------------- d: the device cannot draw the map */
    for (const [label, o, search] of [["?3d=off", { fresh: true }, "?3d=off"], ["no WebGL", { noGl: true, fresh: true }, ""]]) {
      const { context, page, errors } = await open(browser, o);
      await go(page, search);
      await wait(2300);
      const d = await page.evaluate(() => {
        const m = document.querySelector('[data-mode="map"]');
        return { disabled: m.getAttribute("aria-disabled"), title: m.title, checked: Array.prototype.filter.call(document.querySelectorAll("[data-hub-mode] [role=radio]"), (b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent), why: window.BMMap3D.why() };
      });
      check(d.disabled === "true" && /cannot draw the map/.test(d.title) && d.checked.join() === "List", label + ": Map is aria-disabled with a title and List reads checked (" + JSON.stringify(d) + ")");
      /* the sheet's map switch is disabled with its reason */
      await page.evaluate(() => { const m = document.querySelector(".topbar .hud-menu"); if (m) m.click(); });
      const sw = await page.evaluate(() => {
        const i = document.querySelector('input[data-pref="map3d"]'), n = document.getElementById("pref-map3d-note");
        return { disabled: i.disabled, note: n && n.textContent };
      });
      check(sw.disabled && sw.note === "This device cannot draw the map.", label + ": the sheet's map switch is disabled with 'This device cannot draw the map.' (" + JSON.stringify(sw) + ")");
      await page.evaluate(() => { const m = document.querySelector(".topbar .hud-menu"); if (m) m.click(); });   /* closed again: the next click must not be the outside click that closes it */
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
      const prompt = await page.evaluate(() => { const e = document.querySelector(".map3d-panel-empty"); return e && getComputedStyle(e).display !== "none" && /Select a chapter/.test(e.textContent); });
      check(prompt, "z1: the prompt shows in the column before a selection (1280)");
      /* z1 */
      await page.evaluate(() => document.querySelector('li.stop[data-chapter="ch03"] .stop-link').focus());
      await page.waitForFunction(() => !document.querySelector("[data-map3d-panel]").hidden, null, { timeout: 5000 });
      let pn = await panelOf(page), card = await cardOf(page, "ch03");
      check(/Chapter 3/.test(pn.title), "z1: the title names Chapter 3 (" + pn.title + ")");
      check(await page.evaluate(() => getComputedStyle(document.querySelector(".map3d-panel-empty")).display === "none"), "z1: the panel replaces the prompt after a selection");
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

      /* t2: a card closed by hand during a query stays closed when the query clears */
      await page.evaluate(() => { document.querySelector('li.stop[data-chapter="ch04"] details.stop-sections').open = true; });
      await wait(100);
      await page.fill("#hub-q", sec.title);
      await page.waitForFunction(() => document.querySelector('li.stop[data-chapter="ch04"]:not([hidden]) li.stop-row[hidden]'), null, { timeout: 3000 });
      await wait(150);
      await page.evaluate(() => { document.querySelector('li.stop[data-chapter="ch04"] details.stop-sections').open = false; });
      await wait(150);
      await page.fill("#hub-q", "");
      await page.waitForFunction(() => !document.querySelector("li.stop[hidden], li.stop-row[hidden]"), null, { timeout: 3000 });
      check(await page.evaluate(() => !document.querySelector('li.stop[data-chapter="ch04"] details.stop-sections').open), "t: a card closed by hand during a query stays closed after it clears");
      await page.evaluate(() => { document.querySelector('li.stop[data-chapter="ch04"] details.stop-sections').open = false; });
      await wait(100);

      /* u: Enter */
      await page.fill("#hub-q", "quadratic");
      await page.press("#hub-q", "Enter");
      const u = await page.evaluate(() => ({ ch: document.activeElement && document.activeElement.closest("li.stop") && document.activeElement.closest("li.stop").getAttribute("data-chapter"), sel: !!window.BMHubSelect }));
      check(u.sel || u.ch === "ch04", "u: Enter on 'quadratic' focuses Chapter 4's card (" + JSON.stringify(u) + ")");
      check(page.url().indexOf("?") < 0, "u: Enter does not submit the form");

      /* Enter on a query with no kept hit does nothing */
      await page.fill("#hub-q", "fns");
      await page.waitForFunction(() => document.querySelector("[data-hub-count]").textContent === "No match", null, { timeout: 3000 });
      const before = await page.evaluate(() => ({ hash: location.hash, active: document.activeElement && document.activeElement.id }));
      await page.press("#hub-q", "Enter");
      const after = await page.evaluate(() => ({ hash: location.hash, active: document.activeElement && document.activeElement.id }));
      check(before.hash === after.hash && after.active === "hub-q" && before.active === after.active, "u: Enter on 'fns' (no match) changes neither the hash nor the focus (" + JSON.stringify([before, after]) + ")");

      /* v: Escape */
      await page.focus("#hub-q");
      await page.press("#hub-q", "Escape");
      check((await page.inputValue("#hub-q")) === "" && !(await page.evaluate(() => document.querySelector("li.stop[hidden]"))), "v: Escape clears the field and the filter");

      /* w: Map view with cards hidden */
      await page.fill("#hub-q", "linear");
      await page.waitForFunction(() => document.querySelectorAll("li.stop[hidden]").length > 0, null, { timeout: 3000 });
      const w = await page.evaluate(() => ({ on: window.BMMap3D.on(), here: document.querySelector('li.stop[data-state="current"]') && document.querySelector('li.stop[data-state="current"]').getAttribute("data-chapter"), mapShown: !document.querySelector("[data-map3d]").hidden }));
      check(w.on && w.mapShown && w.here === curBefore && (await cur()) === curBefore, "w: in Map view the map still runs and the current island is the same while cards are hidden (" + JSON.stringify(w) + ")");

      check(await page.evaluate(() => { const c = document.querySelector("[data-hub-count]"); return c.textContent.length > 0 && c.getBoundingClientRect().height > 0; }), "w: the count line is visible after typing in Map view");

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
    /* -------------------------------------------- k: keyboard travel on the map */
    {
      const { context, page, errors } = await open(browser);
      await context.addInitScript(() => { try { localStorage.setItem("bm.prefs.v1", JSON.stringify({ map: "3d", motion: "full" })); } catch (e) { /* fine */ } });
      await go(page);
      await worldUp(page);
      await page.waitForFunction(() => window.BMMap3D.info() && document.querySelector(".map3d-part:not([disabled])"), null, { timeout: 15000 });
      const st = () => page.evaluate(() => {
        const s = document.querySelector("[data-map3d-stage]"), i = window.BMMap3D.info();
        const sel = document.querySelector("li.stop[data-selected]");
        return { focus: document.activeElement === s, label: s.getAttribute("aria-label"), hot: i.hot, cur: i.current, flying: i.flying,
          hash: location.hash, title: document.querySelector(".map3d-panel-title").textContent, sel: sel ? sel.getAttribute("data-chapter") : null,
          role: s.getAttribute("role"), described: s.getAttribute("aria-describedby") };
      });
      const parts = await page.locator(".map3d-part").count();
      await page.locator(".map3d-part").nth(parts - 1).focus();
      await page.keyboard.press("Tab");
      const k1 = await st();
      check(k1.focus && k1.hot !== null && k1.hot === k1.cur && /^Course map: /.test(k1.label) && k1.sel === k1.cur, "k1: Tab from the last Part button lands on the stage, naming and selecting the current chapter (" + JSON.stringify(k1) + ")");
      check(k1.role === "group" && await page.evaluate(() => /Arrow keys/.test(document.getElementById("map3d-keys").textContent)), "k1: role group, described by the key hint");
      await page.keyboard.press("Tab");
      check(await page.evaluate(() => document.activeElement.hasAttribute("data-map3d-recenter")), "k1: the next Tab reaches Where I am");
      await page.keyboard.press("Shift+Tab");
      const ids = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("li.stop[data-chapter]"), (l) => l.getAttribute("data-chapter")));
      await page.keyboard.press("ArrowRight");
      const a = await st();
      const ni = Math.min(ids.indexOf(k1.hot) + 1, ids.length - 1);
      check(a.hot === ids[ni] && a.hash === "#" + ids[ni] && a.title !== k1.title && a.focus, "k2: ArrowRight selects the next chapter, the hash and the panel follow (" + JSON.stringify(a) + ")");
      await page.keyboard.press("ArrowLeft");
      const b = await st();
      check(b.hot === k1.hot && b.hash === "#" + k1.hot && b.title === k1.title, "k2: ArrowLeft goes back (" + JSON.stringify(b) + ")");
      await page.keyboard.press("End");
      const e1 = await st();
      await page.keyboard.press("ArrowRight");
      const e2 = await st();
      check(e1.hot !== k1.hot && e1.hot === e2.hot && e1.hash === "#" + e1.hot, "k2: End selects the last island, and ArrowRight stays there (" + e1.hot + ")");
      await page.keyboard.press("Home");
      const h = await st();
      await page.keyboard.press("ArrowLeft");
      const h2 = await st();
      check(h.hot !== e1.hot && h.hot === h2.hot && h.hash === "#" + h.hot, "k2: Home selects the first island, and ArrowLeft stays there (" + h.hot + ")");
      const ring = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-map3d-stage]"), "::after").boxShadow);
      check((await ring()) !== "none", "k1: the focus ring overlay is drawn while the stage is focused");
      await page.keyboard.press("?");
      check(await page.evaluate(() => document.getElementById("keys-sheet").open), "k7: ? on the focused stage opens the sheet");
      await page.keyboard.press("Escape");
      await page.locator("[data-map3d-stage]").focus();
      await page.keyboard.press("j");
      const kb = await page.evaluate(() => ({ c: !!window.BMKeys.cursor(), m: document.querySelectorAll("[data-keys-cursor]").length, onStage: document.activeElement.hasAttribute("data-map3d-stage") }));
      check(!kb.c && kb.m === 0 && kb.onStage, "k5: j moves no cursor with the stage focused (" + JSON.stringify(kb) + ")");
      await page.keyboard.press("g"); await page.keyboard.press("h");
      await wait(300);
      check(/index\.html$|\/$/.test(new URL(page.url()).pathname), "k5: g h does not navigate");
      /* k8: axe with the stage focusable */
      await page.evaluate(require("../lib/pw").resolvePlaywright().axeSource);
      const ax = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ["violations"] });
        return res.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.target.join(" ")).join(", "));
      });
      check(ax.length === 0, "k8: axe finds no violation with the stage focusable (" + JSON.stringify(ax) + ")");
      /* k7: the sheet */
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      check((await ring()) === "none", "k1: the ring is gone when the stage is not focused");
      await page.keyboard.press("?");
      const groups = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll("#keys-sheet h3"), (x) => x.textContent));
      check(groups.indexOf("Course map") > -1, "k7: the ? sheet lists the Course map group (" + groups.join() + ")");
      await page.keyboard.press("Escape");
      /* k4, k3: the stage still holds the selection made above, so the first Escape clears it and
         the next leaves (map.test.js 7b has the full sequence) */
      await page.locator("[data-map3d-stage]").focus();
      check((await st()).hot !== null, "k4: the stage still holds a selection");
      await page.keyboard.press("Escape");
      check((await st()).hot === null && (await st()).focus, "k4: Escape clears the selection first and the focus stays");
      await page.keyboard.press("Escape");
      check(await page.evaluate(() => document.activeElement.getAttribute("role") === "radio" && document.activeElement.getAttribute("aria-checked") === "true"), "k4: Escape with nothing selected moves the focus to the checked radio");
      await page.locator("[data-map3d-stage]").focus();
      await page.keyboard.press("ArrowRight");
      const want = (await st()).hot;
      const file = await page.evaluate((id) => new URL(document.querySelector('li.stop[data-chapter="' + id + '"] .stop-link').href).pathname, want);
      await Promise.all([page.waitForURL((u) => u.pathname === file, { timeout: 10000 }), page.keyboard.press("Enter")]);
      check(new URL(page.url()).pathname === file, "k3: Enter opens the selected chapter's page (" + file + ")");
      check(errors.length === 0, "k9: no page errors (keys): " + errors.join("; "));
      await context.close();
    }
    {
      const { context, page, errors } = await open(browser);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await go(page);
      await worldUp(page);
      await page.waitForFunction(() => window.BMMap3D.info(), null, { timeout: 15000 });
      await page.locator("[data-map3d-stage]").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      check(await page.evaluate(() => window.BMMap3D.info().flying === false), "k6: under reduced motion a step is a cut");
      check(errors.length === 0, "k9: no page errors (reduced): " + errors.join("; "));
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
