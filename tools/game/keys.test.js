#!/usr/bin/env node
/* Headless Chromium checks of the keyboard layer on chapter pages (src/ui/keys.ts, the DOM
   half of src/ui/keymap.ts), on the built site as lib/target.js serves it (dist/, which must
   be current; --root=<dir> names a build elsewhere):
     node tools/game/keys.test.js
   Every request off that server is aborted, as in browser.test.js.

   1. the cursor: j, k, G and g g move the focus between the visible cards (it carries
      data-keys-cursor) and say where it is in #bm-live; ArrowDown moves it from a card;
      Escape drops it; ArrowDown on the bare page still scrolls the page
   2. a text card: Enter goes into its box, typing reaches the box, Escape comes back to the
      card, c checks it, Escape leaves
   3. a choice card: the right option's digit picks it, Enter checks it right
   4. h opens a clue, s shows the solution and s again hides it
   5. n from the page goes to the first unsolved card; from a solved card n and N skip the
      solved ones
   6. in steps mode j lands only on cards in the steps shown, and Enter on the page shows
      the next step; Enter on a sidebar link the reader tabbed to follows the link
   7. } and { move between section headings, ] follows the next-chapter link
   8. ? opens the cheat sheet, a modal with a heading per group and a key for every key; j
      does nothing while it is open; Escape closes it and gives the focus back
   9. Ctrl, Alt and Meta with j do nothing; with the settings sheet open j does nothing and
      Escape still closes the sheet
  10. the first Tab on a chapter shows one toast pointing at "?", never again on this device,
      and no toast without a Tab
  11. no page errors and no Content-Security-Policy violations anywhere; 1 and 8 in both themes */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const CH = "parts/1-algebra/02-linear-equations.html";
const PAGE = { "bm.lesson.v1": '{"mode":"page"}' };
const STEPS = { "bm.lesson.v1": '{"mode":"steps"}' };
let server;
const url = (p) => server.url + p;
let fails = 0, passes = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) {
  check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;

async function open(browser, page0, seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, reducedMotion: opts.reducedMotion || "reduce" });
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) && !THREE_CHUNK.test(r.request().url()) ? r.continue() : r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return; /* a request the route aborted */
    errors.push("console: " + m.text());
  });
  await page.goto(url(page0));
  await page.evaluate((seed) => {
    localStorage.clear();
    Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); });
  }, seed || {});
  await page.goto(url(page0));
  await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys && window.BMKeys.kind === "chapter");
  return { context, page, errors };
}

/* where the focus is: its index among BMKeys.items() (-1 off them), whether it is the page,
   and how many elements carry the cursor */
const where = (page) => page.evaluate(() => {
  var a = document.activeElement;
  return {
    i: window.BMKeys.items().indexOf(a), body: a === document.body,
    cursor: a && a.hasAttribute("data-keys-cursor"), marked: document.querySelectorAll("[data-keys-cursor]").length
  };
});
const count = (page) => page.evaluate(() => window.BMKeys.items().length);
const keys = async (page, list) => { for (const k of list) await page.keyboard.press(k); };

/* the cursor onto the first visible card matching sel, by j presses from the page */
async function goTo(page, sel) {
  const i = await page.evaluate((sel) => window.BMKeys.items().findIndex((el) => el.matches(sel)), sel);
  if (i < 0) throw new Error("no visible card " + sel);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  for (let k = 0; k <= i; k++) await page.keyboard.press("j");
  const at = await where(page);
  if (at.i !== i) throw new Error("goTo " + sel + ": at " + at.i + ", want " + i);
  return i;
}
const toastsMatching = (page) => page.evaluate(() =>
  Array.prototype.filter.call(document.querySelectorAll(".toast"), (t) => /keyboard shortcuts/.test(t.textContent)).length);

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  console.log("keys: " + server.where);
  const browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });   /* off the machine's GPU: lib/gl.js */
  try {
    for (const theme of ["light", "dark"]) {
      /* ------------------------------------------------------- 1: the cursor */
      const { context, page, errors } = await open(browser, CH, Object.assign({ "bm.theme": JSON.stringify(theme) }, PAGE));
      const n = await count(page);
      check(n > 10, theme + ": the chapter has its cards as items (" + n + ")");
      const live = (re, ms) => page.waitForFunction((re) => new RegExp(re).test(document.getElementById("bm-live").textContent), re, { timeout: ms }).then(() => true, () => false);
      const seen = [];
      for (const k of ["j", "j", "k", "k", "G"]) {
        await page.keyboard.press(k);
        seen.push((await where(page)).i);
        /* the first move is said at once; game.js then holds the region for 4 s */
        if (seen.length === 1) check(await live("^Exercise 1 of " + n, 1500), theme + ": within 1.5 s #bm-live says Exercise 1 of " + n);
      }
      eq(seen, [0, 1, 0, 0, n - 1], theme + ": j, j, k, k, G move the cursor, clamped, to the last card");
      await keys(page, ["g", "g"]);
      const top = await where(page);
      eq([top.i, top.cursor, top.marked], [0, true, 1], theme + ": g g goes to the first card, which alone carries the cursor");
      /* the moves pressed in a burst are said once, the last of them, when the region is free */
      await page.evaluate(() => { document.getElementById("bm-live").textContent = ""; });
      check(await live("^Exercise 1 of " + n, 5000), theme + ": a burst of moves is said once, where it ended");
      await page.keyboard.press("ArrowDown");
      eq((await where(page)).i, 1, theme + ": ArrowDown on a card goes to the next card");
      await page.keyboard.press("Escape");
      const out = await where(page);
      eq([out.body, out.marked], [true, 0], theme + ": Escape drops the cursor and leaves the focus on the page");
      const y0 = await page.evaluate(() => window.scrollY);
      await page.keyboard.press("ArrowDown");
      await wait(300);
      const y1 = await page.evaluate(() => window.scrollY);
      check(y1 > y0, theme + ": ArrowDown on the page scrolls it (" + y0 + " → " + y1 + ")");
      check((await where(page)).body, theme + ": and the focus stays on the page");

      /* ------------------------------------------------- 8: the cheat sheet */
      await page.keyboard.press("j");
      const before = await where(page);
      await page.keyboard.press("?");
      const sheet = await page.evaluate(() => {
        var d = document.getElementById("keys-sheet");
        var groups = window.BMKeys.sheet;
        var want = [];
        groups.forEach((g) => g.rows.forEach((r) => r.keys.forEach((k) => want.push(k))));
        var have = Array.prototype.map.call(d.querySelectorAll("kbd"), (k) => k.textContent);
        return {
          open: d.open, modal: d.matches(":modal"), focusIn: d.contains(document.activeElement),
          h3: Array.prototype.map.call(d.querySelectorAll("h3"), (h) => h.textContent),
          groups: groups.map((g) => g.group), missing: want.filter((k) => have.indexOf(k) < 0),
          title: d.querySelector("h2#keys-sheet-title").textContent, label: d.getAttribute("aria-labelledby")
        };
      });
      eq([sheet.open, sheet.modal, sheet.focusIn], [true, true, true], theme + ": ? opens the cheat sheet, modal, with the focus in it");
      eq(sheet.h3, sheet.groups, theme + ": a heading per group");
      eq(sheet.missing, [], theme + ": a kbd for every key");
      eq([sheet.title, sheet.label], ["Keyboard shortcuts", "keys-sheet-title"], theme + ": named by its heading");
      await page.keyboard.press("j");
      eq(await page.evaluate(() => [document.getElementById("keys-sheet").open, document.getElementById("keys-sheet").contains(document.activeElement), !!window.BMKeys.cursor()]),
        [true, true, false], theme + ": j while it is open does nothing");
      await page.keyboard.press("Escape");
      await wait(100);
      const back = await where(page);
      eq([await page.evaluate(() => document.getElementById("keys-sheet").open), back.i, back.cursor], [false, before.i, true], theme + ": Escape closes it and the cursor is back on the card");
      await page.keyboard.press("?");
      await page.click("#keys-sheet [data-keys-close]");
      await wait(100);
      eq([await page.evaluate(() => document.getElementById("keys-sheet").open), (await where(page)).i], [false, before.i], theme + ": its Close button closes it too");
      eq(errors, [], theme + ": no errors (cursor, cheat sheet)");
      await context.close();
    }

    /* -------------------------------------------------------- 2: a text card */
    {
      const { context, page, errors } = await open(browser, CH, PAGE);
      const T = '#practice .ex[data-kind="text"]';
      await goTo(page, T);
      await page.keyboard.press("Enter");
      eq(await page.evaluate((T) => document.activeElement === document.querySelector(T + " .ex-form input[type=text]"), T), true, "Enter on a text card focuses its box");
      await page.keyboard.type("12");
      eq(await page.$eval(T + " .ex-form input[type=text]", (i) => i.value), "12", "typing in the box reaches it (j, k, c … not swallowed)");
      await page.keyboard.type("jkcnhs?");
      eq(await page.$eval(T + " .ex-form input[type=text]", (i) => i.value), "12jkcnhs?", "the layer's letters type too");
      await page.$eval(T + " .ex-form input[type=text]", (i) => { i.value = "12"; });
      await page.keyboard.press("Escape");
      eq(await page.evaluate((T) => { var a = document.activeElement; return [a === document.querySelector(T), a.hasAttribute("data-keys-cursor")]; }, T), [true, true], "Escape goes back to the card");
      await page.keyboard.press("c");
      await wait(200);
      const st = await page.evaluate((T) => { var ex = document.querySelector(T); return [ex.getAttribute("data-state"), ex.querySelector(".ex-feedback").textContent.trim().length > 0]; }, T);
      check(/^(wrong|correct)$/.test(st[0]) && st[1], "c checks the card: a state and a verdict (" + st[0] + ")");
      await page.keyboard.press("Escape");
      eq((await where(page)).body, true, "Escape on the card leaves to the page");

      /* -------------------------------------------------- 3: a choice card */
      const C = '#practice .ex[data-kind="choice"]';
      if (await page.$(C) === null) { check(false, "the chapter has a practice choice card"); }
      else {
        const ans = parseInt((await page.$eval(C, (e) => e.getAttribute("data-answer"))).split("|")[0], 10);
        await goTo(page, C);
        await page.keyboard.press(String(ans));
        eq(await page.$eval(C, (e, ans) => e.querySelectorAll(".choices input")[ans - 1].checked, ans), true, "the digit picks that option");
        eq((await where(page)).cursor, true, "and the cursor stays on the card");
        await page.keyboard.press("Enter");
        await wait(200);
        eq(await page.$eval(C, (e) => e.getAttribute("data-state")), "correct", "Enter on an answered card checks it");
      }

      /* ----------------------------------------------- 4: clue and solution */
      const H = '#practice .ex[data-hint]:not([data-state])';
      await goTo(page, H);
      const hk = await page.evaluate(() => document.activeElement.getAttribute("data-key"));
      await page.keyboard.press("h");
      await wait(150);
      eq(await page.evaluate((k) => { var c = document.querySelector('#practice .ex[data-key="' + k + '"] .ex-clue'); return !!c && !c.closest("[hidden]") && c.getClientRects().length > 0; }, hk), true, "h opens a clue on the card");
      const S = '#practice .ex[data-key="' + hk + '"]';
      /* the ladder focuses the new clue; the layer still counts that as the card */
      eq(await page.evaluate(() => !!document.activeElement.closest(".ex-ladder")), true, "the new clue has the focus");
      eq(await page.evaluate(() => window.BMKeys.at()), "card", "focus in a clue counts as the card");
      await page.keyboard.press("j");
      eq(await page.evaluate((k) => { var a = document.activeElement, c = document.querySelector('#practice .ex[data-key="' + k + '"]'); return a.matches(".ex") && !!(c.compareDocumentPosition(a) & 4); }, hk), true, "j from a clue moves to the next card");
      await goTo(page, S);
      await page.keyboard.press("h");
      await wait(150);
      await page.keyboard.press("Escape");
      eq(await page.evaluate((k) => document.activeElement.getAttribute("data-key"), hk), hk, "Escape from a clue returns to its card");
      await page.keyboard.press("s");
      eq(await page.$eval(S + " .ex-solution", (e) => e.getAttribute("data-show")), "true", "s shows the solution");
      await page.keyboard.press("s");
      eq(await page.$eval(S + " .ex-solution", (e) => e.getAttribute("data-show")), null, "s again hides it");
      /* a mouse click on a card's padding must not arm h: the lent tabindex goes with the cursor */
      await page.keyboard.press("Escape");
      eq(await page.$eval(S, (e) => e.hasAttribute("tabindex")), false, "the card gives its tabindex back when the cursor leaves");
      const P = '#practice .ex[data-hint]:not([data-state]):not([data-key="' + hk + '"])';
      if (await page.$(P)) {
        const open = (e) => Array.prototype.filter.call(e.querySelectorAll(".ex-clue"), (c) => !c.closest("[hidden]") && c.getClientRects().length > 0).length;
        const was = await page.$eval(P, open);
        const box = await page.$eval(P, (e) => { e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; });
        await page.mouse.click(box.x, box.y);
        await page.keyboard.press("h");
        await wait(150);
        eq(await page.$eval(P, open), was, "h after a click on a card's padding opens nothing");
      }
      eq(errors, [], "no errors (text, choice, clue, solution)");
      await context.close();
    }

    /* ----------------------------------------------------------- 5: unsolved */
    {
      const { context, page, errors } = await open(browser, CH, PAGE);
      await page.keyboard.press("n");
      const first = await page.evaluate(() => window.BMKeys.items().filter((e) => e.getAttribute("data-state") !== "correct")[0] === document.activeElement);
      check(first, "n from the page goes to the first unsolved card");
      const T = '#practice .ex[data-kind="text"]:not([data-state])';
      const t = await goTo(page, T);
      const key = await page.evaluate(() => (document.activeElement.getAttribute("data-answer") || "").split("|")[0]);
      await page.keyboard.press("i");
      await page.keyboard.type(key);
      await page.keyboard.press("Enter");
      await wait(200);
      await page.keyboard.press("Escape");
      const solved = await page.evaluate(() => [document.activeElement.getAttribute("data-state"), window.BMKeys.items().indexOf(document.activeElement)]);
      eq(solved, ["correct", t], "the text card is solved and the cursor is back on it");
      const want = await page.evaluate((t) => {
        var list = window.BMKeys.items();
        var after = -1, beforeIt = -1;
        for (var i = t + 1; i < list.length; i++) if (list[i].getAttribute("data-state") !== "correct") { after = i; break; }
        for (var j = after - 1; j >= 0; j--) if (list[j].getAttribute("data-state") !== "correct") { beforeIt = j; break; }
        return [after, beforeIt];
      }, t);
      await page.keyboard.press("n");
      eq((await where(page)).i, want[0], "n from the solved card goes to the next unsolved one");
      await page.keyboard.press("N");
      eq((await where(page)).i, want[1], "N goes back to the unsolved one before, past the solved card");
      check(want[1] !== t, "(which is not the solved card)");
      eq(errors, [], "no errors (unsolved)");
      await context.close();
    }

    /* ---------------------------------------------------------- 6: steps mode */
    {
      const { context, page, errors } = await open(browser, CH, STEPS);
      const all = await page.evaluate(() => document.querySelectorAll(".ex").length);
      const s0 = await page.evaluate(() => window.BMLesson.shown());
      await page.keyboard.press("Enter");
      await wait(200);
      eq(await page.evaluate(() => window.BMLesson.shown()), s0 + 1, "Enter on the page shows the next step");
      /* on until a step with a card is shown */
      for (let k = 0; k < 30 && !(await count(page)); k++) {
        await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
        await page.keyboard.press("Enter");
        await wait(50);
      }
      const n = await count(page);
      check(n > 0 && n < all, "steps mode: only the cards of the steps shown are items (" + n + " of " + all + ")");
      let ok = true;
      for (let k = 0; k < n + 1; k++) {
        await page.keyboard.press("j");
        if (!(await page.evaluate(() => document.activeElement.matches(".ex") && !document.activeElement.closest("[hidden]")))) ok = false;
      }
      check(ok, "steps mode: j lands only on cards that are not hidden");
      await page.keyboard.press("Escape");

      /* a link the reader tabbed to keeps its Enter */
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      const href = await page.$eval('aside[data-sidebar] a[href^="#"]', (a) => a.href);
      let reached = false;
      for (let k = 0; k < 80 && !reached; k++) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(() => document.activeElement === document.querySelector('aside[data-sidebar] a[href^="#"]'));
      }
      check(reached, "Tab reaches the first sidebar link");
      const s1 = await page.evaluate(() => window.BMLesson.shown());
      await page.keyboard.press("Enter");
      await wait(300);
      eq(page.url(), href, "Enter on the sidebar link follows it");
      check(await page.evaluate((s1) => window.BMLesson.shown() >= s1, s1), "(and no Continue in its place)");
      eq(errors, [], "no errors (steps)");
      await context.close();
    }

    /* ----------------------------------------------- 7: sections and chapters */
    {
      const { context, page, errors } = await open(browser, CH, PAGE);
      const heads = await page.$$eval("main h2[id]", (l) => l.map((h) => h.id));
      const at = () => page.evaluate(() => { var a = document.activeElement; return a.matches("h2[id]") && a.hasAttribute("data-keys-cursor") ? a.id : null; });
      await page.keyboard.press("}");
      eq(await at(), heads[0], "} goes to the first section heading");
      await page.keyboard.press("}");
      eq(await at(), heads[1], "} again to the second");
      await page.keyboard.press("{");
      eq(await at(), heads[0], "{ back to the first");
      const next = await page.$eval("[data-chapter-nav] a.next", (a) => a.href);
      await Promise.all([page.waitForNavigation(), page.keyboard.press("]")]);
      eq(page.url(), next, "] follows the next-chapter link");
      eq(errors, [], "no errors (sections, chapters)");
      await context.close();
    }

    /* ------------------------------------------- 9: modifiers and the settings */
    {
      const { context, page, errors } = await open(browser, CH, PAGE);
      for (const k of ["Control+j", "Alt+j", "Meta+j"]) {
        await page.keyboard.press(k);
        eq(await page.evaluate(() => [!!window.BMKeys.cursor(), document.querySelectorAll("[data-keys-cursor]").length]), [false, 0], k + " does nothing");
      }
      await page.click(".hud-menu");
      eq(await page.evaluate(() => document.getElementById("hud-sheet").open), true, "the settings sheet is open");
      await page.keyboard.press("j");
      eq(await page.evaluate(() => [!!window.BMKeys.cursor(), document.getElementById("hud-sheet").open]), [false, true], "j with the settings sheet open does nothing and leaves it open");
      await page.keyboard.press("Escape");
      eq(await page.evaluate(() => document.getElementById("hud-sheet").open), false, "Escape closes the settings sheet");
      eq(errors, [], "no errors (modifiers, settings)");
      await context.close();
    }

    /* ---------------------------------------------------------------- 10: the tip */
    {
      const { context, page, errors } = await open(browser, CH, PAGE);
      await page.keyboard.press("Tab");
      const shown = await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll(".toast"), (t) => /keyboard shortcuts/.test(t.textContent)), null, { timeout: 4000 }).then(() => true, () => false);
      check(shown, "the first Tab shows the keyboard tip");
      await page.keyboard.press("Tab");
      await wait(300);
      eq(await toastsMatching(page), 1, "one tip toast, not one per Tab");
      eq(await page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1") || "{}").keysTip), 1, "it is remembered in the run store");
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys);
      await page.keyboard.press("Tab");
      await wait(1500);
      eq(await toastsMatching(page), 0, "after a reload, Tab shows no tip");
      eq(errors, [], "no errors (tip)");
      await context.close();

      const b = await open(browser, CH, PAGE);
      await b.page.keyboard.press("j");
      await wait(1500);
      eq(await toastsMatching(b.page), 0, "no tip without a Tab");
      eq(b.errors, [], "no errors (no tip)");
      await b.context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " keys: " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
