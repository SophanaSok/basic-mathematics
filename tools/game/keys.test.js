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
      card, c checks it, Escape leaves; on an order card i focuses a move button and Escape
      comes back to the card
   3. a choice card: the right option's digit picks it, Enter checks it right
   4. h opens a clue, s shows the solution and s again hides it
   5. n from the page goes to the first unsolved card; from a solved card n and N skip the
      solved ones
   6. in steps mode j lands only on cards in the steps shown, and Enter on the page shows
      the next step; Enter on a sidebar link the reader tabbed to follows the link
   7. } and { move between section headings, ] follows the next-chapter link; in steps mode,
      with the chapter links in a step not shown yet, ] and [ still follow them
   8. ? opens the cheat sheet, a modal with a heading per group and a key for every key, the
      focus on its title and scrolled to the top; j
      does nothing while it is open; Escape closes it and gives the focus back
   9. Ctrl, Alt and Meta with j do nothing; with the settings sheet open j does nothing and
      Escape still closes the sheet
  10. the first Tab on a chapter shows one toast pointing at "?", never again on this device,
      and no toast without a Tab
  11. no page errors and no Content-Security-Policy violations anywhere; 1 and 8 in both themes
  12. home: j, j, G, k move over the stops and the next-step card, Escape drops it, g a goes to
      the Arena; no keyboard tip on Tab (the tip is chapter-only)
  13. Arena lobby: j lands on a mode tile, 1 starts a run; during the run j, ? do nothing, Escape
      pauses and resumes, and after Back to the lobby, g h goes home; with no deck 1 does nothing
  14. progress: j lands on an area title, ? opens a sheet without the Exercise group, Escape closes it
  15. about (a plain page): j lands on the first h2[id] (tabindex -1), } and { move between headings,
      g p goes to the progress page
  16. account: j walks the buttons and inputs (the email box is the third), typing goes in, Escape blurs it
  17. diagnostic: no items (j does nothing), ? opens the sheet, Escape closes it
  18. no page errors on any of those pages in both themes
  19. the Keyboard shortcuts switch: off, j and ? do nothing and the settings sheet shows it
      unchecked; on, j moves again; the choice survives a reload
  20. the go-to palette: / opens #keys-palette, modal, the box focused, 12 options and the first
      selected; ArrowDown, ArrowDown, ArrowUp select the second, the arrows wrap, Home, End, Tab
      and Shift+Tab move it; "pract" puts the Practice heading first (aria-activedescendant
      names it) and Enter closes it on the heading, with the cursor; "exercise 3" then Enter lands on card e3; "zzzzqq" shows "Nothing matches", Enter
      does nothing, Escape closes it and gives the card back the focus; "arena" then Enter opens
      arena.html; in steps mode "exercise 3" then Enter shows the step and focuses the card; / in
      an answer box types a slash, / during an Arena run opens nothing, / in the cheat sheet
      leaves the sheet; both themes, no page errors and no CSP violations
  21. t from the page goes to the card the boss marks (.ex[data-target="true"]) with the cursor, revealing
      its lesson step in step-by-step mode; with
      the practice set all solved and no target it goes to the first unsolved card elsewhere, and
      when every card is solved nothing moves; t in an answer box types the letter; both themes */
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
  await page.waitForFunction((kind) => document.readyState === "complete" && !!window.BMKeys && window.BMKeys.kind === kind, opts.kind || "chapter");
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
          onTitle: document.activeElement === d.querySelector("#keys-sheet-title"), top: d.scrollTop,
          h3: Array.prototype.map.call(d.querySelectorAll("h3"), (h) => h.textContent),
          groups: groups.map((g) => g.group), missing: want.filter((k) => have.indexOf(k) < 0),
          title: d.querySelector("h2#keys-sheet-title").textContent, label: d.getAttribute("aria-labelledby")
        };
      });
      eq([sheet.open, sheet.modal, sheet.focusIn], [true, true, true], theme + ": ? opens the cheat sheet, modal, with the focus in it");
      eq([sheet.onTitle, sheet.top], [true, 0], theme + ": the focus starts on its title, scrolled to the top (not on Close, at the bottom)");
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

      /* an order card: i focuses a move button, which Escape leaves for the card */
      const O = '.ex[data-kind="order"]';
      if (await page.$(O) === null) check(false, "the chapter has an order card");
      else {
        await goTo(page, O);
        const ok = await page.evaluate(() => document.activeElement.id);
        await page.keyboard.press("i");
        eq(await page.evaluate(() => document.activeElement.matches(".order-move")), true, "i on an order card focuses a move button");
        await page.keyboard.press("Escape");
        eq(await page.evaluate(() => { var a = document.activeElement; return [a.id, a.matches(".ex"), a.hasAttribute("data-keys-cursor")]; }), [ok, true, true],
          "Escape from the move button comes back to the order card, with the cursor");
        await page.keyboard.press("Escape");
      }

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

    /* ------------------------------------------------- 21: t, the boss's target */
    {
      /* step-by-step mode: the target sits in a step not shown yet; t reveals it and lands */
      const { context, page, errors } = await open(browser, CH, STEPS);
      const hiddenTarget = await page.evaluate(() => { var t = document.querySelector('.ex[data-target="true"]'); return !!t && !!t.closest("[hidden]"); });
      check(hiddenTarget, "steps: the boss's target starts in a hidden step");
      await page.keyboard.press("t");
      await page.waitForFunction(() => { var a = document.activeElement; return !!a && a.matches('.ex[data-target="true"]'); }, null, { timeout: 2000 }).catch(() => {});
      eq(await page.evaluate(() => {
        var a = document.activeElement;
        return [a.matches('.ex[data-target="true"]'), a.hasAttribute("data-keys-cursor"), !a.closest("[hidden]")];
      }), [true, true, true], "steps: t reveals the step and lands on the target with the cursor");
      eq(errors, [], "no errors (t in steps mode)");
      await context.close();
    }
    for (const theme of ["light", "dark"]) {
      const TH = { "bm.theme": JSON.stringify(theme) };
      const pre = theme + ": ";
      {
        const { context, page, errors } = await open(browser, CH, Object.assign({}, TH, PAGE));
        const marked = await page.evaluate(() => document.querySelectorAll('.ex[data-target="true"]').length);
        check(marked >= 1, pre + "t: the boss marks a target (" + marked + ")");
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await page.keyboard.press("t");
        eq(await page.evaluate(() => {
          var a = document.activeElement, first = document.querySelector('.ex[data-target="true"]');
          return [a === first, a.hasAttribute("data-keys-cursor")];
        }), [true, true], pre + "t from the page lands on the target with the cursor");
        /* typing in a box keeps the letter */
        await page.keyboard.press("Escape");
        await goTo(page, '.ex[data-kind="text"]:not([data-state])');
        await page.keyboard.press("i");
        await page.keyboard.press("t");
        eq(await page.evaluate(() => [document.activeElement.tagName, document.activeElement.value]), ["INPUT", "t"], pre + "t in an answer box types the letter");
        eq(errors, [], pre + "no errors (t, target)");
        await context.close();
      }
      {
        /* the practice set all solved: no target, so the first unsolved card elsewhere */
        const solved = {};
        for (let i = 1; i <= 30; i++) solved["e" + i] = true;
        solved["s3d-planes-line"] = true;
        const seed = Object.assign({}, TH, PAGE, { "bm.progress.v1": JSON.stringify({ ch02: { solved, total: 10 } }) });
        const { context, page, errors } = await open(browser, CH, seed);
        const want = await page.evaluate(() => {
          var list = window.BMKeys.items().filter((e) => e.matches(".ex"));
          var el = list.find((e) => e.getAttribute("data-state") !== "correct");
          return { none: document.querySelectorAll('.ex[data-target="true"]').length, i: el ? window.BMKeys.items().indexOf(el) : -1 };
        });
        eq(want.none, 0, pre + "t: no target once the practice set is solved");
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await page.keyboard.press("t");
        if (want.i >= 0) eq((await where(page)).i, want.i, pre + "t falls back to the first unsolved card");
        else eq((await where(page)).body, true, pre + "t with everything solved moves nothing");
        eq(errors, [], pre + "no errors (t, fallback)");
        await context.close();
      }
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
    {
      const { context, page, errors } = await open(browser, CH, STEPS);
      const nav = await page.evaluate(() => {
        var n = document.querySelector("[data-chapter-nav]");
        return { hidden: !!n.closest("[hidden]"), next: n.querySelector("a.next").href, here: location.href };
      });
      check(nav.hidden, "steps mode: the chapter links start in a hidden step");
      await Promise.all([page.waitForNavigation(), page.keyboard.press("]")]);
      eq(page.url(), nav.next, "steps mode: ] follows the hidden next-chapter link");
      await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys && window.BMKeys.kind === "chapter");
      await Promise.all([page.waitForNavigation(), page.keyboard.press("[")]);
      eq(page.url(), nav.here, "steps mode: [ comes back");
      eq(errors, [], "no errors (steps, chapters)");
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

    /* ------------------------------------- 12 to 18: every other page kind, both themes */
    const SOLID = async (page) => {
      await page.evaluate(() => {
        var all = {}, t = Date.now() - 864e5 * 2;
        window.BMGen.list().forEach((s) => {
          var ch = s.section.split("#")[0], sec = s.section.split("#")[1], recs = all[ch] = all[ch] || {};
          recs["z" + sec + "1"] = { tries: 1, first: 1, solved: t, section: sec };
          recs["z" + sec + "2"] = { tries: 1, first: 1, solved: t + 1, section: sec };
        });
        localStorage.setItem("bm.attempts.v1", JSON.stringify(all));
      });
    };
    const act = (page) => page.evaluate(() => {
      var a = document.activeElement;
      return { body: a === document.body, cursor: !!a && a.hasAttribute("data-keys-cursor"), marked: document.querySelectorAll("[data-keys-cursor]").length,
        tag: a && a.tagName, cls: a && a.className, id: a && a.id };
    });
    const sheetOpen = (page) => page.evaluate(() => { var d = document.getElementById("keys-sheet"); return !!d && d.open; });
    const WEAK = { "bm.attempts.v1": JSON.stringify({ ch05: { x1: { section: "parallels", solved: Date.now() - 864e5, first: false, tries: 3 } } }) };
    for (const theme of ["light", "dark"]) {
      const TH = { "bm.theme": JSON.stringify(theme) };
      const pre = theme + ": ";

      /* ------------------------------------------------------------ 12: home */
      {
        const { context, page, errors } = await open(browser, "index.html", TH, { kind: "home" });
        await page.keyboard.press("j");
        const first = await page.evaluate(() => [document.activeElement === document.querySelector("a.stop-link"), document.activeElement.hasAttribute("data-keys-cursor")]);
        eq(first, [true, true], pre + "home: j focuses the first stop link, with the cursor");
        await page.keyboard.press("j");
        eq(await page.evaluate(() => window.BMKeys.items().indexOf(document.activeElement)), 1, pre + "home: j again goes to the second item");
        await page.keyboard.press("G");
        const last = await page.evaluate(() => { var l = window.BMKeys.items(); return [l.indexOf(document.activeElement), l.length - 1, document.activeElement.matches("a.stop-link, a.next-step-link")]; });
        eq([last[0], last[2]], [last[1], true], pre + "home: G goes to the last item (" + last[1] + ")");
        await page.keyboard.press("k");
        eq(await page.evaluate(() => window.BMKeys.items().indexOf(document.activeElement)), last[1] - 1, pre + "home: k goes to the one before");
        await page.keyboard.press("Escape");
        const o = await act(page);
        eq([o.body, o.marked], [true, 0], pre + "home: Escape drops the cursor");
        await Promise.all([page.waitForNavigation(), keys(page, ["g", "a"])]);
        check(/arena\.html$/.test(page.url()), pre + "home: g a goes to arena.html (" + page.url() + ")");
        eq(errors, [], pre + "no errors (home)");
        await context.close();

        const t = await open(browser, "index.html", TH, { kind: "home" });
        await t.page.keyboard.press("Tab");
        await wait(1500);
        eq(await toastsMatching(t.page), 0, pre + "home: Tab shows no keyboard tip");
        await t.context.close();
      }

      /* ------------------------------------------------------ 13: Arena lobby */
      {
        const { context, page, errors } = await open(browser, "arena.html", TH, { kind: "arena" });
        await SOLID(page);
        await page.reload();
        await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys && window.BMKeys.kind === "arena");
        await page.keyboard.press("j");
        eq(await page.evaluate(() => [document.activeElement === document.querySelector(".arena-mode"), document.activeElement.hasAttribute("data-keys-cursor")]), [true, true], pre + "arena: j focuses the first mode tile");
        await page.keyboard.press("Escape");
        eq((await act(page)).body, true, pre + "arena: Escape leaves the tile");
        await page.keyboard.press("1");
        const ran = await page.waitForSelector('body[data-arena-screen="run"]', { timeout: 2000 }).then(() => true, () => false);
        check(ran, pre + "arena: 1 starts a Standard run");
        if (ran) {
          const before = await page.evaluate(() => document.activeElement && document.activeElement.id);
          await page.keyboard.press("j");
          const d = await page.evaluate(() => [document.activeElement && document.activeElement.id, document.querySelectorAll("[data-keys-cursor]").length]);
          eq(d, [before, 0], pre + "arena: during a run j moves nothing (focus on " + before + ")");
          await page.keyboard.press("?");
          eq(await sheetOpen(page), false, pre + "arena: ? opens no sheet during a run");
          await page.keyboard.press("Escape");
          check(await page.waitForSelector('[data-act="unpause"]', { state: "visible", timeout: 1500 }).then(() => true, () => false), pre + "arena: Escape pauses");
          await page.keyboard.press("Escape");
          check(await page.waitForSelector('[data-act="unpause"]', { state: "hidden", timeout: 1500 }).then(() => true, () => false), pre + "arena: Escape again resumes");
          await page.click('[data-act="pause"]');
          await page.click('[data-act="leave"]');
          await page.waitForSelector('body:not([data-arena-screen="run"])');
          await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
          await Promise.all([page.waitForNavigation(), keys(page, ["g", "h"])]);
          check(/\/(index\.html)?$/.test(page.url()), pre + "arena: g h goes home (" + page.url() + ")");
        }
        eq(errors, [], pre + "no errors (arena)");
        await context.close();

        const e = await open(browser, "arena.html", TH, { kind: "arena" });
        await e.page.keyboard.press("1");
        await wait(500);
        eq([await e.page.evaluate(() => document.body.getAttribute("data-arena-screen")), (await act(e.page)).body], ["lobby", true], pre + "arena: with no deck 1 starts nothing and the focus stays on the page");
        /* with every section new, the deck lists pick boxes (inside details, opened here): the
           cursor walks over them and does not get stuck in one */
        await e.page.evaluate(() => { document.querySelectorAll("details.arena-part").forEach((d) => { d.open = true; }); });
        await e.page.keyboard.press("G");
        eq(await e.page.evaluate(() => document.activeElement.matches("input[data-pick]")), true, pre + "arena: G lands on the last deck checkbox");
        await e.page.keyboard.press("k");
        eq(await e.page.evaluate(() => [document.activeElement.matches("input[data-pick]"), document.activeElement.hasAttribute("data-keys-cursor")]), [true, true], pre + "arena: k moves on from a checkbox");
        await e.page.keyboard.press("Escape");
        eq((await act(e.page)).body, true, pre + "arena: Escape drops the cursor from a checkbox");
        eq(e.errors, [], pre + "no errors (arena, no deck)");
        await e.context.close();
      }

      /* ---------------------------------------------------------- 14: progress */
      {
        const { context, page, errors } = await open(browser, "progress.html", Object.assign({}, TH, WEAK), { kind: "progress" });
        await page.keyboard.press("j");
        eq(await page.evaluate(() => [document.activeElement.matches("li.area a.area-title"), document.activeElement.hasAttribute("data-keys-cursor")]), [true, true], pre + "progress: j lands on an area title");
        await page.keyboard.press("?");
        eq(await sheetOpen(page), true, pre + "progress: ? opens the sheet");
        const txt = await page.evaluate(() => document.getElementById("keys-sheet").textContent);
        check(!/Check the answer/.test(txt), pre + "progress: no Exercise group in the sheet");
        await page.keyboard.press("Escape");
        await wait(100);
        eq(await sheetOpen(page), false, pre + "progress: Escape closes it");
        eq(errors, [], pre + "no errors (progress)");
        await context.close();
      }

      /* ------------------------------------------------------------ 15: about */
      {
        const { context, page, errors } = await open(browser, "about.html", TH, { kind: "page" });
        const heads = await page.$$eval("h2[id]", (l) => l.map((h) => h.id));
        const at = () => page.evaluate(() => { var a = document.activeElement; return a.matches("h2[id]") && a.hasAttribute("data-keys-cursor") ? [a.id, a.getAttribute("tabindex")] : null; });
        await page.keyboard.press("j");
        eq(await at(), [heads[0], "-1"], pre + "about: j focuses the first h2[id], tabindex -1");
        await page.keyboard.press("}");
        eq((await at() || [])[0], heads[1], pre + "about: } goes to the next heading");
        await page.keyboard.press("{");
        eq((await at() || [])[0], heads[0], pre + "about: { goes back");
        await page.keyboard.press("Escape");
        await Promise.all([page.waitForNavigation(), keys(page, ["g", "p"])]);
        check(/progress\.html$/.test(page.url()), pre + "about: g p goes to progress.html (" + page.url() + ")");
        eq(errors, [], pre + "no errors (about)");
        await context.close();
      }

      /* ---------------------------------------------------------- 16: account */
      {
        const { context, page, errors } = await open(browser, "account.html", TH, { kind: "account" });
        /* the signed-out form lists two OAuth buttons before the first input, so the email box is the third item */
        const isEmail = () => page.evaluate(() => document.activeElement === document.getElementById("acct-email"));
        await page.keyboard.press("j");
        eq(await page.evaluate(() => document.activeElement.id), "acct-oauth-google", pre + "account: j focuses the first item (the Google button)");
        await keys(page, ["j", "j"]);
        eq(await isEmail(), true, pre + "account: j j more reaches the first input");
        await page.keyboard.type("a");
        eq(await page.evaluate(() => document.activeElement.value), "a", pre + "account: typing goes into it");
        await page.keyboard.press("Escape");
        eq((await act(page)).body, true, pre + "account: Escape leaves the input");
        await keys(page, ["j", "j", "j"]);
        eq(await isEmail(), true, pre + "account: j from the page starts over, and the third item is the input again");
        eq(errors, [], pre + "no errors (account)");
        await context.close();
      }

      /* ------------------------------------------------------- 17: diagnostic */
      {
        const { context, page, errors } = await open(browser, "diagnostic.html", TH, { kind: "diagnostic" });
        await page.keyboard.press("j");
        const d = await act(page);
        eq([d.body, d.marked], [true, 0], pre + "diagnostic: j moves nothing");
        await page.keyboard.press("?");
        eq(await sheetOpen(page), true, pre + "diagnostic: ? opens the sheet");
        await page.keyboard.press("Escape");
        await wait(100);
        eq(await sheetOpen(page), false, pre + "diagnostic: Escape closes it");
        eq(errors, [], pre + "no errors (diagnostic)");
        await context.close();
      }
    }
    /* ------------------------------------------------------- 19: the switch */
    {
      const pre = "switch: ";
      const sheetOpen = (page) => page.evaluate(() => { var d = document.getElementById("keys-sheet"); return !!d && d.open; });
      const { context, page, errors } = await open(browser, CH, PAGE);
      await page.evaluate(() => window.BMGame.setPref("keys", false));
      await page.keyboard.press("j");
      const off = await where(page);
      eq([off.body, off.marked], [true, 0], pre + "switch off: j moves nothing");
      await page.keyboard.press("?");
      eq(await sheetOpen(page), false, pre + "switch off: ? opens no sheet");
      await page.click(".hud-menu");
      eq(await page.evaluate(() => { var i = document.querySelector('#hud-sheet [data-pref="keys"]'); return i ? i.checked : null; }), false, pre + "switch off: the settings sheet shows it unchecked");
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.BMGame.setPref("keys", true));
      await page.keyboard.press("j");
      eq((await where(page)).i, 0, pre + "switch on: j moves again");
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys);
      eq(await page.evaluate(() => window.BMGame.prefs().keys), true, pre + "reload: on stays on");
      await page.keyboard.press("j");
      eq((await where(page)).i, 0, pre + "reload: j moves");
      await page.evaluate(() => window.BMGame.setPref("keys", false));
      await page.reload();
      await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys);
      eq(await page.evaluate(() => window.BMGame.prefs().keys), false, pre + "reload: off stays off");
      await page.keyboard.press("j");
      eq((await where(page)).body, true, pre + "reload: j does nothing");
      eq(errors, [], pre + "no errors (switch)");
      await context.close();
    }
    /* --------------------------------------------------- 20: the go-to palette */
    {
      const pal = (page) => page.evaluate(() => {
        var d = document.getElementById("keys-palette"), input = d && d.querySelector("input");
        var opts = d ? Array.prototype.map.call(d.querySelectorAll("li[role=option]"), (li) => ({
          id: li.id, label: li.firstChild.textContent, sel: li.getAttribute("aria-selected") === "true", mark: li.hasAttribute("data-selected")
        })) : [];
        var empty = d && d.querySelector(".keys-palette-empty");
        return {
          open: !!d && d.open, modal: !!d && d.matches(":modal"), focused: !!input && document.activeElement === input,
          value: input ? input.value : null, active: input ? input.getAttribute("aria-activedescendant") : null,
          opts: opts, selected: opts.findIndex((o) => o.sel && o.mark), marks: opts.filter((o) => o.mark).length,
          empty: !!empty && !empty.hidden && empty.getClientRects().length > 0
        };
      });
      const onCard = (page, id) => page.evaluate((id) => { var a = document.activeElement; return [a.id, a.matches(".ex"), a.hasAttribute("data-keys-cursor")]; }, id);
      for (const theme of ["light", "dark"]) {
        const pre = theme + ": palette: ";
        const { context, page, errors } = await open(browser, CH, Object.assign({ "bm.theme": JSON.stringify(theme) }, PAGE));
        await page.keyboard.press("/");
        let p = await pal(page);
        eq([p.open, p.modal, p.focused, p.value], [true, true, true, ""], pre + "/ opens it, modal, with the box focused and empty");
        eq([p.opts.length, p.selected, p.marks, p.active], [12, 0, 1, "keys-palette-opt-0"], pre + "12 options, the first selected");
        await keys(page, ["ArrowDown", "ArrowDown", "ArrowUp"]);
        p = await pal(page);
        eq([p.selected, p.marks, p.active], [1, 1, "keys-palette-opt-1"], pre + "ArrowDown, ArrowDown, ArrowUp select the second");
        await keys(page, ["ArrowUp", "ArrowUp"]);
        eq((await pal(page)).selected, 11, pre + "ArrowUp from the first wraps to the last");
        await page.keyboard.press("Home");
        eq((await pal(page)).selected, 0, pre + "Home goes to the first");
        await page.keyboard.press("Tab");
        eq(await page.evaluate(() => document.activeElement.matches("#keys-palette [data-keys-close]")), true, pre + "Tab moves to the Close button");
        await page.keyboard.press("Tab");
        p = await pal(page);
        eq([p.selected, p.focused], [0, true], pre + "Tab again returns to the box with the selection kept");
        await page.keyboard.press("End");
        eq((await pal(page)).selected, 11, pre + "End goes to the last");
        await page.keyboard.type("pract");
        p = await pal(page);
        check(p.opts.length > 0 && /Practice/.test(p.opts[0].label), pre + '"pract" puts Practice first (' + (p.opts[0] && p.opts[0].label) + ")");
        eq([p.active, p.selected], [p.opts[0] && p.opts[0].id, 0], pre + "typing selects the first again and aria-activedescendant names it");
        await page.keyboard.press("Enter");
        await wait(100);
        const head = await page.evaluate(() => {
          var a = document.activeElement, sec = document.getElementById("practice");
          return [document.getElementById("keys-palette").open, a.tagName, /Practice/.test(a.textContent), !!sec && sec.contains(a), a.hasAttribute("data-keys-cursor")];
        });
        eq(head, [false, "H2", true, true, true], pre + "Enter closes it on the Practice heading, with the cursor");

        await page.keyboard.press("/");
        eq((await pal(page)).value, "", pre + "opened again, the box is empty");
        await page.keyboard.type("exercise 3");
        p = await pal(page);
        eq(p.opts[0] && p.opts[0].label, "Exercise 3", pre + '"exercise 3" puts Exercise 3 first');
        check(p.opts.some((o) => o.label === "Exercise 3"), pre + "(and it is listed)");
        await page.keyboard.press("Enter");
        await wait(100);
        eq(await onCard(page), ["e3", true, true], pre + "Enter focuses card e3, with the cursor");
        check(await page.waitForFunction(() => /^Exercise \d+ of \d+: Exercise 3/.test(document.getElementById("bm-live").textContent), null, { timeout: 5000 }).then(() => true, () => false),
          pre + "and #bm-live says where it is");

        await page.keyboard.press("/");
        await page.keyboard.type("zzzzqq");
        p = await pal(page);
        eq([p.opts.length, p.empty, p.active], [0, true, null], pre + '"zzzzqq": no options and "Nothing matches"');
        await page.keyboard.press("Enter");
        p = await pal(page);
        eq([p.open, p.focused], [true, true], pre + "Enter with nothing listed does nothing");
        await page.keyboard.press("Escape");
        await wait(150);
        eq([(await pal(page)).open].concat(await onCard(page)), [false, "e3", true, true], pre + "Escape closes it and the cursor is back on the card");

        /* in an answer box, / is typed (insert mode) */
        await goTo(page, '#practice .ex[data-kind="text"]');
        await page.keyboard.press("Enter");
        await page.keyboard.press("/");
        eq(await page.evaluate(() => { var a = document.activeElement; return [a.matches(".ex-form input[type=text]"), a.value.slice(-1), document.getElementById("keys-palette").open]; }),
          [true, "/", false], pre + "/ in an answer box types a slash and opens nothing");
        await page.evaluate(() => { document.activeElement.value = ""; });
        await keys(page, ["Escape", "Escape"]);

        await page.keyboard.press("/");
        await page.keyboard.type("arena");
        p = await pal(page);
        eq(p.opts[0] && p.opts[0].label, "Arena", pre + '"arena" puts the Arena page first');
        await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
        check(/arena\.html$/.test(page.url()), pre + "Enter opens arena.html (" + page.url() + ")");
        eq(errors, [], pre + "no errors and no CSP violations");
        await context.close();
      }

      /* steps mode: the card sits in a step not shown yet */
      {
        const { context, page, errors } = await open(browser, CH, STEPS);
        eq(await page.evaluate(() => { var e = document.getElementById("e3"); return !!e.closest("[hidden]") || !e.getClientRects().length; }), true, "palette, steps: card e3 starts hidden");
        const shown = await page.evaluate(() => window.BMLesson.shown());
        await page.keyboard.press("/");
        await page.keyboard.type("exercise 3");
        await page.keyboard.press("Enter");
        const landed = await page.waitForFunction(() => document.activeElement && document.activeElement.id === "e3", null, { timeout: 2000 }).then(() => true, () => false);
        check(landed, "palette, steps: Enter on Exercise 3 focuses the card");
        eq(await page.evaluate((s) => [window.BMLesson.shown() > s, !document.getElementById("e3").closest("[hidden]"), document.activeElement.hasAttribute("data-keys-cursor")], shown),
          [true, true, true], "palette, steps: the step is shown and the card has the cursor");

        /* the cheat sheet keeps its keys */
        await page.keyboard.press("?");
        await page.keyboard.press("/");
        eq(await page.evaluate(() => [document.getElementById("keys-sheet").open, document.getElementById("keys-palette").open, document.getElementById("keys-sheet").contains(document.activeElement)]),
          [true, false, true], "palette: / with the cheat sheet open leaves the sheet and opens no palette");
        await page.keyboard.press("Escape");
        eq(errors, [], "palette, steps: no errors");
        await context.close();
      }

      /* an Arena run keeps its keys */
      {
        const { context, page, errors } = await open(browser, "arena.html", {}, { kind: "arena" });
        await SOLID(page);
        await page.reload();
        await page.waitForFunction(() => document.readyState === "complete" && !!window.BMKeys && window.BMKeys.kind === "arena");
        await page.keyboard.press("1");
        const ran = await page.waitForSelector('body[data-arena-screen="run"]', { timeout: 2000 }).then(() => true, () => false);
        check(ran, "palette, arena: 1 starts a run");
        if (ran) {
          await page.keyboard.press("/");
          eq(await page.evaluate(() => { var d = document.getElementById("keys-palette"); return !!d && d.open; }), false, "palette, arena: / during a run opens nothing");
        }
        eq(errors, [], "palette, arena: no errors");
        await context.close();
      }
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
