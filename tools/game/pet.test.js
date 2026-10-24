#!/usr/bin/env node
/* Headless Chromium checks of Mochi's pool shell (src/ui/pet/pool.ts, opened by src/ui/companion.ts) on the
   built site (dist/, which must be current):
     node tools/game/pet.test.js
   Chapter page parts/1-algebra/01-numbers.html; pages open with ?3d=off (no WebGL). The cases that need a 3D stage (the
   sidebar hand-off, clips, the look, the inline canvas count) live in game/pet3d.test.js.
   1. open: the click opens dialog.pet-dialog[open], the title has focus, body has data-pet, four needs and
      "You have 0 facets."; bundle/pet.js is fetched only after the click
   2. Escape closes it: the dialog and data-pet are gone, focus is back on .companion-pic
   3. the Close button does the same
   4. (the stage hand-off is pet3d.test.js case 1) with ?3d=off the dialog opens, the sidebar stays 2D and so does the porthole
   5. hidden: Study mode opens nothing; config pet "off" makes the picture a plain image with no dialog
   6. a seeded bm.pet.v1 tummy of 1 heart reads "Tummy: 1 of 5 hearts" with one filled mark
   7. feed: Tummy 3 -> 4, the line, gift and care.feed.pellet written, Feed disabled and a second click changes nothing
   8. play cap: three plays raise Play by three and care.play is 3; the fourth is disabled with the cap line
   9. clean: seeded 2 hearts shows Clean; a click gives 5 of 5 and hides it
  10. pet: a click on the porthole writes nothing and the line reads "Mochi nuzzles your hand."
  11. acts earn nothing (the facets line stays) and the pet bus events are "gift" then "care"
  12. reduced motion: acts still write and the line changes, and the 2D porthole carries no data-clip (the clips are pet3d.test.js case 2)
  Play needs a toy: cases 8, 11 and 12 seed one, and a click without one only says so (aria-disabled, nothing written).
  13. shop tab: seventeen items with prices; Buy on toy:ball writes one buy: id worth 25, "You have 75 facets.", the
      toy shows Owned, Play is enabled
  14. refusals: at 10 facets Buy on toy:boat is disabled; at a negative balance every Buy is disabled and the line
      says the facets are catching up
  15. snack: Feed on snack:berry-bite at Tummy 2 writes a feed: id worth 12, Tummy is 5 of 5, care.feed has it
      once, a second Feed is disabled
  16. decor: Buy decor:castle, Place it (a span.companion-decor[data-decor] with the castle cell), Remove hides it,
      wear.decor and wear.at follow
  17. two devices: a merged record with two ball buys shows one Owned, two spends, and the balance down by both
  18. config shop "off": no Shop tab and no shop panel (Pool and Growth remain), the Pool tab still works
  19. keyboard: Enter on the porthole pets Mochi; Feed's click moves focus to the line
  20. growth: two days of all four acts with XP (8 points) stamp grew.fry on opening, the porthole carries
      data-pet-stage="fry", the line is "Mochi grew into a fry!", run.seen.grew.fry is 1, and a reload shows the
      idle line with grew.fry unchanged
  21. T7: the same care on days without XP stamps nothing and the stage stays hatchling
  22. (the look is pet3d.test.js case 3)
  23. growth tab: "Mochi is a fry.", "16 more good-day points to Juvenile.", the path marks fry as the current step
      and hatchling and fry as reached, 28 calendar days with the two seeded days at 4 and the rest at 0
  24. shop "off": the strip shows Pool and Growth; shop "on" shows Pool, Shop, Growth in that order
  25. keyboard: ArrowLeft from Pool lands on Growth, End then Home return; panels are tabpanels labelled by their tab
  26. T7 in the calendar: a day with care but no XP shows 0 points
  27. X-7 minors: a Place that changes nothing writes nothing and says nothing; a snack that does not fit is disabled with
      the room in its row, and the cheapest snack that fits stays enabled
  28. inline (X-9): progress.html has section#mochi[data-pet] with .pet-pool, h2.pet-title, four needs, the care row
      and the tabs, no dialog and no Close button; bundle/pet.js was fetched
  29. redraw: a level or sync event rebuilds the panel once; one .pet-pool before and after (the canvas count is pet3d.test.js case 4)
  30. Study mode and config pet "off": no #mochi on load or after a redraw, no pet chunk
  31. popover: the level badge's popover holds span.pop-mochi naming mochi-pink-poses.webp at the companion's mood;
      absent with pet "off"
  32. a Feed click in the inline pool writes bm.pet.v1 as the dialog does, and the line changes
  33. two pools (the page-level hooks are a set): both facets lines repaint after one write
  34. accessories (X-7b-b): the shop lists six accessory rows; Buy on acc:flower (35) writes owned and a buy: spend of 35, the
      row shows Owned, the line is "Mochi has a new flower!", and a second Buy is not offered
  35. wardrobe: with acc:flower and acc:bell owned the tab lists Head (Nothing, Flower), Back (Nothing) and Tail (Nothing, Bell);
      Flower writes wear.head with a stamp, moves aria-checked, sets data-pet-worn and says "Mochi is wearing the flower.";
      Nothing clears it and says "Mochi took it off."; the 2D page requests no /models/mochi/acc/ file
  36. wardrobe with nothing owned: the empty line and no fieldset
  37. wardrobe after a stale event: a click writes nothing and the line says the facets are catching up
  38. wardrobe keys (X-7b-b minors): ArrowRight from Nothing checks the next chip, moves focus and writes; the roving tabindex is 0 on
      the checked chip and -1 elsewhere; a repeat event and a Ctrl chord write nothing; a click on the chip already checked, and on
      Nothing over a stale unowned id, writes nothing and says nothing; a rebuild keeps focus on the same chip
  39. the Wardrobe tab with the shop off: present with an accessory owned, absent with none
  40. a quota-refused wear (BMStore.write returns false): no line, nothing stored, the chips repainted from the record
  41. learning fill, Play (X-10): a recorded Arena run raises needs.play.n by 1 and care[today].runs to 1, a second to 2, no toy
      needed, and care[today].play stays absent; after two runs three Play clicks are all accepted and the fourth says the cap line
      (runs never count against the button)
  42. learning fill, Spark (X-10): a first-try correct answer on a placed, due section earns the review id and fills Spark; a second
      identical attempt fills it again (Spark 2 hearts up, care.spark 2)
  43. low pose (X-10): Tummy at 1 heart reads "sleepy" at mount with "Mochi could use a snack." said once; a reload says nothing and
      the pose stays; with the pool off the mood is "idle"
  44. bus reaction (X-10): a pet earn change turns the companion happy briefly with no line
  45. no page errors in any case
  The footer counts the blocks that run: every number above except 22 (which lives in pet3d.test.js), plus 19b, 41b and
  the two unnumbered blocks inside 5 and 14; 47 in all. */
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
const seed_calm = () => ({ "bm.prefs.v1": '{"calm":true}' });
const SEEN = JSON.stringify({ seen: { companion: 1 } });

async function open(seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const requests = [], errors = [];
  context.on("request", (r) => requests.push(r.url()));
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) && !THREE_CHUNK.test(r.request().url()) ? r.continue() : r.abort());
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
  await page.goto(server.url + (opts.path || CHAPTER) + "?3d=off", { waitUntil: "load" });
  if (!opts.path) check(await until(page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000), "the companion mounts");
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

const stored = (page) => page.evaluate(() => localStorage.getItem("bm.pet.v1"));
const today = (page) => page.evaluate(() => window.BMSite.dayKey(new Date()));
const openPool = async (page) => { await page.click(".companion-pic"); await until(page, () => !!document.querySelector("dialog.pet-dialog[open]")); };
const hearts = (page, need) => page.evaluate((n) => document.querySelector('li[data-need="' + n + '"]').querySelectorAll("i[data-on]").length, need);
const lineOf = (page) => page.evaluate(() => document.querySelector(".pet-line").textContent);
const TOY = { "toy:ball": "2025-01-01" };
const FIVE = { "strong:a": 1, "strong:b": 1, "strong:c": 1, "strong:d": 1, "strong:e": 1 };   // 100 facets
const seedPet = (o) => ({ "bm.pet.v1": JSON.stringify(o) });
const openShop = async (page) => { await openPool(page); await page.click('button[data-tab="shop"]'); };
const shopLine = (page) => page.evaluate(() => document.querySelector("[data-shop-line]").textContent);
const itemState = (page, id) => page.evaluate((i) => {
  const li = document.querySelector('li.pet-item[data-item="' + i + '"]');
  const vis = (e) => !!e && !e.hidden;
  const b = li.querySelector('button[data-shop="buy"], button[data-shop="feed"]');
  return { btn: vis(b) ? (b.disabled ? "disabled" : "enabled") : "hidden", owned: vis(li.querySelector(".pet-owned")) };
}, id);
const busLog = (page) => page.evaluate(() => { window.__pet = []; window.BMStore.on((c) => { if (c && c.type === "pet") window.__pet.push(c.what + ":" + c.id); }); });

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
    /* 4: ?3d=off keeps the sidebar and the porthole 2D (the hand-off is pet3d.test.js) */
    cases++;
    {
      const c = await open();
      await openPool(c.page);
      eq(await c.page.evaluate(() => ({ mode: window.BMCompanion.info().mode, side: document.querySelector("figure[data-companion]").hasAttribute("data-3d"), hole: document.querySelector(".pet-porthole").hasAttribute("data-3d") })), { mode: "2d", side: false, hole: false }, "stage: 2D everywhere with ?3d=off");
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

    /* 7: feed */
    cases++;
    {
      const c = await open({ "bm.pet.v1": JSON.stringify({ needs: { tummy: { n: 3, at: Date.now() } } }) });
      await openPool(c.page);
      await busLog(c.page);
      await c.page.click('button[data-act="feed"]');
      const day = await today(c.page);
      eq(await hearts(c.page, "tummy"), 4, "feed: the tummy row shows 4");
      eq(await lineOf(c.page), "Mochi munches happily.", "feed: the line");
      const rec = JSON.parse(await stored(c.page));
      eq([rec.gift[day], rec.care[day].feed.pellet], [1, 1], "feed: gift and pellet written");
      check(await c.page.evaluate(() => document.querySelector('button[data-act="feed"]').disabled), "feed: Feed is disabled");
      const before = await stored(c.page);
      await c.page.click('button[data-act="feed"]', { force: true }).catch(() => {});
      eq(await stored(c.page), before, "feed: a second click changes nothing");
      eq(await c.page.evaluate(() => window.__pet), ["gift:feed:" + day], "feed: one gift event");
      await done(c, "feed");
    }
    /* 8: play cap */
    cases++;
    {
      const c = await open(seedPet({ owned: TOY, needs: { play: { n: 1, at: Date.now() } } }));
      await openPool(c.page);
      for (let i = 0; i < 3; i++) await c.page.click('button[data-act="play"]');
      const day = await today(c.page);
      eq(await hearts(c.page, "play"), 4, "play: hearts rose by three");
      eq(JSON.parse(await stored(c.page)).care[day].play, 3, "play: care.play is 3");
      check(await c.page.evaluate(() => document.querySelector('button[data-act="play"]').disabled), "play: the fourth is disabled");
      eq(await lineOf(c.page), "Mochi has played enough for today. The Arena is always open.", "play: the cap line");
      check(await c.page.evaluate(() => !!document.querySelector(".pet-line a[href$='arena.html']")), "play: the cap line links to the Arena");
      await done(c, "play");
    }
    /* 9: clean */
    cases++;
    {
      const c = await open({ "bm.pet.v1": JSON.stringify({ needs: { clean: { n: 2, at: Date.now() } } }) });
      await openPool(c.page);
      check(await c.page.evaluate(() => !document.querySelector('button[data-act="clean"]').hidden), "clean: shown at 2 hearts");
      await c.page.click('button[data-act="clean"]');
      eq(await hearts(c.page, "clean"), 5, "clean: 5 of 5");
      check(await c.page.evaluate(() => document.querySelector('button[data-act="clean"]').hidden), "clean: hidden at 5");
      eq(await lineOf(c.page), "The water sparkles again.", "clean: the line");
      await done(c, "clean");
    }
    /* 10: pet */
    cases++;
    {
      const c = await open({ "bm.pet.v1": JSON.stringify({ needs: { tummy: { n: 4, at: Date.now() } } }) });
      await openPool(c.page);
      const before = await stored(c.page);
      await c.page.click(".pet-porthole");
      eq(await lineOf(c.page), "Mochi nuzzles your hand.", "pet: the line");
      eq(await stored(c.page), before, "pet: nothing written");
      await done(c, "pet");
    }
    /* 11: no earn, bus order */
    cases++;
    {
      const c = await open(seedPet({ owned: TOY }));
      await openPool(c.page);
      await busLog(c.page);
      await c.page.click('button[data-act="feed"]');
      await c.page.click('button[data-act="play"]');
      const day = await today(c.page);
      eq(await c.page.evaluate(() => window.__pet), ["gift:feed:" + day, "care:play:" + day], "bus: gift then care");
      eq(await c.page.evaluate(() => document.querySelector(".pet-facets").textContent), "You have 0 facets.", "bus: the facets are unchanged");
      eq(JSON.parse(await stored(c.page)).earned || {}, {}, "bus: nothing earned");
      await done(c, "bus");
    }
    /* 12: reduced motion */
    cases++;
    {
      const c = await open(seedPet({ owned: TOY }));
      await c.page.emulateMedia({ reducedMotion: "reduce" });
      await openPool(c.page);
      await c.page.click('button[data-act="play"]');
      const day = await today(c.page);
      eq(JSON.parse(await stored(c.page)).care[day].play, 1, "reduced: the act writes");
      eq(await lineOf(c.page), "Mochi zooms around the pool.", "reduced: the line changes");
      check(await c.page.evaluate(() => !document.querySelector(".pet-porthole").hasAttribute("data-clip")), "reduced: no clip played");
      await done(c, "reduced");
    }
    /* 13: the shop tab */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE }));
      await openShop(c.page);
      const d = await c.page.evaluate(() => ({
        tabs: Array.from(document.querySelectorAll('.pet-tabs[role="tablist"] [role="tab"]')).map((b) => b.textContent + ":" + b.getAttribute("aria-selected")),
        panels: Array.from(document.querySelectorAll(".pet-panel")).map((p) => p.getAttribute("data-panel") + ":" + p.hidden),
        groups: Array.from(document.querySelectorAll(".pet-panel[data-panel=shop] h3")).map((h) => h.textContent),
        items: Array.from(document.querySelectorAll("li.pet-item")).map((li) => li.getAttribute("data-item") + "=" + li.querySelector(".pet-item-price").textContent)
      }));
      eq(d.tabs, ["Pool:false", "Shop:true", "Wardrobe:false", "Growth:false"], "shop: the tabs");
      eq(d.panels, ["pool:true", "shop:false", "wardrobe:true", "growth:true"], "shop: the panels");
      eq(d.groups, ["Snacks", "Toys", "Decor", "Accessories"], "shop: the groups");
      eq(d.items.length, 17, "shop: seventeen items");
      eq(d.items.slice(0, 4), ["snack:kelp-chip=5 facets", "snack:shrimp-puff=8 facets", "snack:berry-bite=12 facets", "toy:ball=25 facets"], "shop: the first prices");
      eq(await itemState(c.page, "toy:ball"), { btn: "enabled", owned: false }, "shop: Buy is enabled at 100");
      check(await c.page.evaluate(() => document.querySelector('button[data-act="play"]').getAttribute("aria-disabled") === "true"), "shop: Play is unavailable without a toy");
      await busLog(c.page);
      await c.page.click('li[data-item="toy:ball"] button[data-shop="buy"]');
      const rec = JSON.parse(await stored(c.page)), day = await today(c.page);
      eq(Object.keys(rec.spent).length, 1, "shop: one spend");
      const id = Object.keys(rec.spent)[0];
      check(/^buy:\d{4}-\d{2}-\d{2}:toy:ball:[0-9a-z]{8}:1$/.test(id) && id.split(":")[1] === day, "shop: the spend id shape " + id);
      eq(rec.spent[id], 25, "shop: worth 25");
      eq(rec.owned["toy:ball"], day, "shop: owned from today");
      eq(await c.page.evaluate(() => document.querySelector(".pet-facets").textContent), "You have 75 facets.", "shop: 75 facets");
      eq(await c.page.evaluate(() => document.querySelector(".pet-panel[data-panel=shop] .pet-facets").textContent), "You have 75 facets.", "shop: the shop's own facets line");
      eq(await itemState(c.page, "toy:ball"), { btn: "hidden", owned: true }, "shop: the toy shows Owned");
      eq(await shopLine(c.page), "Mochi has a new ball!", "shop: the line");
      check(await c.page.evaluate(() => document.activeElement === document.querySelector("[data-shop-line]")), "shop: focus moved to the line");
      check(await c.page.evaluate(() => { const b = document.querySelector('button[data-act="play"]'); return !b.disabled && !b.hasAttribute("aria-disabled"); }), "shop: Play is enabled");
      eq(await c.page.evaluate(() => window.__pet), ["buy:toy:ball"], "shop: one buy event");
      await done(c, "shop");
    }
    /* 14: refusals */
    cases++;
    {
      const c = await open(seedPet({ earned: { "strong:a": 1 }, spent: { "buy:2025-01-01:toy:ring:dev00001:1": 10 } }));
      await openShop(c.page);
      eq(await shopLine(c.page), "", "refuse: at 10 facets something is still affordable, so no nudge");
      eq(await itemState(c.page, "toy:boat"), { btn: "disabled", owned: false }, "refuse: Buy on the boat is disabled at 10");
      eq(await itemState(c.page, "snack:kelp-chip"), { btn: "enabled", owned: false }, "refuse: a 5 facet snack is still open");
      const before = await stored(c.page);
      await c.page.click('li[data-item="toy:boat"] button', { force: true, timeout: 800 }).catch(() => {});
      eq(await stored(c.page), before, "refuse: a click on a disabled Buy writes nothing");
      await done(c, "refuse");
      const d = await open(seedPet({ earned: { "strong:a": 1 }, spent: { "buy:2025-01-01:toy:ring:dev00001:1": 18 } }));
      await openShop(d.page);
      eq(await shopLine(d.page), "Not enough facets yet. Learning earns them.", "refuse: at 2 facets the line points at learning");
      check((await d.page.evaluate(() => Array.from(document.querySelectorAll("li.pet-item button")).filter((b) => !b.hidden).every((b) => b.disabled))), "refuse: nothing is open at 2");
      await done(d, "refuse 2");
    }
    cases++;
    {
      const c = await open(seedPet({ earned: { "strong:a": 1 }, spent: { "buy:2025-01-01:toy:ring:dev00001:1": 50 } }));
      await openShop(c.page);
      const all = await c.page.evaluate(() => Array.from(document.querySelectorAll("li.pet-item button")).filter((b) => !b.hidden).map((b) => b.disabled));
      check(all.length === 17 && all.every((x) => x), "negative: every button is disabled");
      eq(await shopLine(c.page), "Mochi's facets are catching up after a sync.", "negative: the line");
      eq(await c.page.evaluate(() => document.querySelector(".pet-facets").textContent), "You have 0 facets.", "negative: shown as 0, never below");
      await done(c, "negative");
    }
    /* 15: a snack */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, needs: { tummy: { n: 2, at: Date.now() } } }));
      await openShop(c.page);
      await busLog(c.page);
      await c.page.click('li[data-item="snack:berry-bite"] button[data-shop="feed"]');
      const rec = JSON.parse(await stored(c.page)), day = await today(c.page);
      const id = Object.keys(rec.spent)[0];
      check(/^feed:\d{4}-\d{2}-\d{2}:snack:berry-bite:[0-9a-z]{8}:1$/.test(id), "snack: the spend id shape " + id);
      eq(rec.spent[id], 12, "snack: worth 12");
      eq(rec.care[day].feed["snack:berry-bite"], 1, "snack: care.feed counted once");
      eq(rec.owned || {}, {}, "snack: nothing owned (no bag)");
      eq(await hearts(c.page, "tummy"), 5, "snack: Tummy is 5");
      eq(await c.page.evaluate(() => document.querySelector('li[data-need="tummy"]').getAttribute("aria-label")), "Tummy: 5 of 5 hearts", "snack: 5 of 5");
      eq(await itemState(c.page, "snack:berry-bite"), { btn: "disabled", owned: false }, "snack: a second Feed is disabled");
      eq(await itemState(c.page, "snack:kelp-chip"), { btn: "disabled", owned: false }, "snack: every snack is disabled at a full Tummy");
      eq(await c.page.evaluate(() => window.__pet), ["care:snack:berry-bite"], "snack: one care event");
      await done(c, "snack");
    }
    /* 16: decor */
    cases++;
    {
      const c = await open(seedPet({ earned: Object.assign({ "strong:f": 1, "strong:g": 1 }, FIVE) }));
      await openShop(c.page);
      await c.page.click('li[data-item="decor:castle"] button[data-shop="buy"]');
      eq(await itemState(c.page, "decor:castle"), { btn: "hidden", owned: true }, "decor: bought");
      eq(await c.page.evaluate(() => document.querySelectorAll(".companion-decor[data-decor]").length), 0, "decor: not placed by buying");
      await busLog(c.page);
      await c.page.click('li[data-item="decor:castle"] button[data-shop="place"]');
      const placed = await c.page.evaluate(() => {
        const s = document.querySelector(".pet-window .companion-decor[data-decor]"), b = document.querySelector('li[data-item="decor:castle"] button[data-shop="place"]');
        return s && { id: s.getAttribute("data-decor"), pos: s.style.backgroundPosition, img: s.style.backgroundImage, left: s.style.left, bottom: s.style.bottom, shown: getComputedStyle(s).display, pressed: b.getAttribute("aria-pressed"), text: b.textContent };
      });
      check(!!placed, "decor: a layer appears in the window");
      if (placed) {
        eq([placed.id, placed.pos, placed.left, placed.bottom, placed.shown, placed.pressed, placed.text], ["decor:castle", "57.1429% 0px", "76%", "22%", "block", "true", "Remove"], "decor: the castle cell and spot");
        check(/models\/mochi\/decor\.png/.test(placed.img), "decor: image set from JS");
      }
      eq(await shopLine(c.page), "The castle is in the pool.", "decor: placed line");
      const r1 = JSON.parse(await stored(c.page));
      eq(r1.wear.decor, ["decor:castle"], "decor: wear.decor");
      await c.page.click('li[data-item="decor:castle"] button[data-shop="place"]');
      eq(await c.page.evaluate(() => document.querySelectorAll(".companion-decor[data-decor]").length), 0, "decor: Remove hides it");
      const r2 = JSON.parse(await stored(c.page));
      eq(r2.wear.decor, [], "decor: wear.decor is empty again");
      check(r2.wear.at > r1.wear.at, "decor: wear.at grows");
      eq(await shopLine(c.page), "The castle is put away.", "decor: removed line");
      eq(await c.page.evaluate(() => window.__pet), ["wear:decor:castle", "wear:decor:castle"], "decor: two wear events");
      await done(c, "decor");
    }
    /* 17: two devices, each bought toy:ball offline; this is what the merge keeps (union of spends, earlier day) */
    cases++;
    {
      const c = await open(seedPet({
        earned: FIVE, owned: { "toy:ball": "2025-03-03" },
        spent: { "buy:2025-03-04:toy:ball:aaaaaaa1:1": 25, "buy:2025-03-03:toy:ball:bbbbbbb2:1": 25 }
      }));
      await openShop(c.page);
      eq(await itemState(c.page, "toy:ball"), { btn: "hidden", owned: true }, "two devices: one Owned");
      eq(await c.page.evaluate(() => document.querySelector(".pet-facets").textContent), "You have 50 facets.", "two devices: down by both");
      eq(Object.keys(JSON.parse(await stored(c.page)).spent).length, 2, "two devices: two spends");
      eq(await itemState(c.page, "toy:ring"), { btn: "enabled", owned: false }, "two devices: 50 still buys a 40 facet toy");
      await done(c, "two devices");
    }
    /* 18: shop off */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE }));
      await c.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { shop: "off" }); });
      await openPool(c.page);
      const d = await c.page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll(".pet-tabs [data-tab]")).map((b) => b.getAttribute("data-tab")), shop: document.querySelectorAll("[data-panel=shop], li.pet-item").length, pool: !document.querySelector("[data-panel=pool]").hidden }));
      eq(d, { tabs: ["pool", "growth"], shop: 0, pool: true }, "shop off: no Shop tab, no shop panel, the pool shows");
      await c.page.click(".pet-porthole");
      eq(await lineOf(c.page), "Mochi nuzzles your hand.", "shop off: the pool still works");
      check(await c.page.evaluate(() => { const b = document.querySelector('button[data-act="play"]'); return !b.disabled && !b.hasAttribute("aria-disabled"); }), "shop off: Play is enabled without a toy");
      const h0 = await hearts(c.page, "play");
      await c.page.click('button[data-act="play"]');
      eq(await hearts(c.page, "play"), Math.min(5, h0 + 1), "shop off: Play raises Play hearts");
      eq(await lineOf(c.page), "Mochi zooms around the pool.", "shop off: the play line");
      /* another tab took today's pellet: the button still looks open, the click reads the record fresh and refuses */
      await c.page.evaluate(() => { const r = JSON.parse(localStorage.getItem("bm.pet.v1")); r.gift = Object.assign({}, r.gift, { [window.BMSite.dayKey(new Date())]: 1 }); localStorage.setItem("bm.pet.v1", JSON.stringify(r)); });
      await c.page.click('button[data-act="feed"]');
      eq(await lineOf(c.page), "Mochi has had today's pellet.", "shop off: the pellet line has no shop clause");
      await done(c, "shop off");
    }
    /* 19b: stale */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, needs: { tummy: { n: 2, at: Date.now() } } }));
      await openShop(c.page);
      await c.page.evaluate(() => window.BMStore.emit({ type: "stale" }));
      const before = await stored(c.page);
      await c.page.click('li[data-item="toy:ball"] button[data-shop="buy"]');
      await c.page.click('li[data-item="snack:berry-bite"] button[data-shop="feed"]');
      await c.page.click('[data-tab="pool"]');
      await c.page.click('button[data-act="feed"]');
      await c.page.dispatchEvent('button[data-act="play"]', "click");   // aria-disabled without a toy: only the handler's own guard
      eq(await stored(c.page), before, "stale: nothing is written, the care row included");
      await done(c, "stale");
    }
    /* 19: keyboard */
    cases++;
    {
      const c = await open(seedPet({ needs: { tummy: { n: 4, at: Date.now() } } }));
      await openPool(c.page);
      const before = await stored(c.page);
      await c.page.focus(".pet-porthole");
      await c.page.keyboard.press("Enter");
      eq(await lineOf(c.page), "Mochi nuzzles your hand.", "keys: Enter on the porthole pets Mochi");
      eq(await stored(c.page), before, "keys: nothing written");
      const a = await c.page.evaluate(() => { const p = document.querySelector(".pet-porthole"); return [p.getAttribute("role"), p.getAttribute("tabindex"), p.getAttribute("aria-label"), p.hasAttribute("data-pet-stage")]; });
      eq(a, ["button", "0", "Pet Mochi", true], "keys: the porthole is a named button");
      await c.page.click('button[data-act="feed"]');
      check(await c.page.evaluate(() => document.activeElement === document.querySelector(".pet-line")), "keys: focus moves to the line when Feed goes away");
      await done(c, "keys");
    }
    /* 20: growth */
    cases++;
    {
      const D1 = "2026-10-01", D2 = "2026-10-02";
      const ACTS = { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 };
      const care = { [D1]: ACTS, [D2]: ACTS };
      const act = { "bm.activity.v1": JSON.stringify({ days: { [D1]: 10, [D2]: 10 } }) };
      const c = await open(Object.assign(seedPet({ v: 1, care }), act));
      await busLog(c.page);
      await openPool(c.page);
      const rec = () => c.page.evaluate(() => JSON.parse(localStorage.getItem("bm.pet.v1")));
      const g1 = (await rec()).grew;
      check(g1 && typeof g1.fry === "number" && g1.fry > 0, "growth: opening stamps grew.fry");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-stage")), "fry", "growth: the porthole is at fry");
      eq(await lineOf(c.page), "Mochi grew into a fry!", "growth: the moment line");
      eq(await c.page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1")).seen.grew), { fry: 1 }, "growth: run.seen.grew.fry is 1");
      eq(await c.page.evaluate(() => window.__pet), ["grew:fry"], "growth: one grew event");
      await c.page.reload({ waitUntil: "load" });
      await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000);
      await openPool(c.page);
      eq(await lineOf(c.page), "Mochi is glad to see you.", "growth: a reload shows the idle line, not the moment");
      eq((await rec()).grew.fry, g1.fry, "growth: grew.fry is unchanged after the reload");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-stage")), "fry", "growth: still fry after the reload");
      await done(c, "growth");
    }
    /* 21: T7, care without XP */
    cases++;
    {
      const D1 = "2026-10-01", D2 = "2026-10-02";
      const ACTS = { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 };
      const c = await open(Object.assign(seedPet({ v: 1, care: { [D1]: ACTS, [D2]: ACTS } }), { "bm.activity.v1": JSON.stringify({ days: { [D1]: 0 } }) }));
      await openPool(c.page);
      const r = JSON.parse(await stored(c.page));
      check(!(r.grew && r.grew.fry), "T7: no grew.fry without XP");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-stage")), "hatchling", "T7: the stage stays hatchling");
      eq(await lineOf(c.page), "Mochi is glad to see you.", "T7: no moment");
      await done(c, "T7");
    }
    /* 23: the growth tab */
    cases++;
    {
      const days = [1, 2].map((n) => { const d = new Date(); d.setDate(d.getDate() - n); const p = (x) => (x < 10 ? "0" : "") + x; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); });
      const ACTS = { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 };
      const care = { [days[0]]: ACTS, [days[1]]: ACTS };
      const act = { "bm.activity.v1": JSON.stringify({ days: { [days[0]]: 10, [days[1]]: 10 } }) };
      const c = await open(Object.assign(seedPet({ v: 1, care }), act));
      await openPool(c.page);
      await c.page.click('button[data-tab="growth"]');
      const d = await c.page.evaluate(() => {
        const p = document.querySelector('.pet-panel[data-panel="growth"]');
        const cur = p.querySelector('.pet-path li[aria-current="step"]');
        return {
          visible: !p.hidden,
          stage: p.querySelector(".pet-growth-stage").textContent, next: p.querySelector(".pet-growth-next").textContent,
          current: cur && cur.getAttribute("data-stage"),
          reached: Array.from(p.querySelectorAll(".pet-path li[data-reached]")).map((l) => l.getAttribute("data-stage")),
          days: p.querySelectorAll("ol.pet-days li[data-day]").length,
          fours: Array.from(p.querySelectorAll('li[data-points="4"]')).map((l) => l.getAttribute("data-day")),
          zeros: p.querySelectorAll('li[data-points="0"]').length,
          label: p.querySelector('li[data-points="4"] .visually-hidden').textContent,
          zeroLabel: p.querySelector('li[data-points="0"] .visually-hidden').textContent,
          aria: p.querySelectorAll("ol.pet-days li[aria-label]").length,
          last: p.querySelector("ol.pet-days li:last-child").getAttribute("data-day"),
          hint: p.querySelector(".pet-line").textContent
        };
      });
      check(d.visible, "growth tab: the panel shows");
      eq(d.stage, "Mochi is a fry.", "growth tab: the stage line");
      eq(d.next, "16 more good-day points to Juvenile.", "growth tab: the next line");
      eq(d.current, "fry", "growth tab: fry is the current step");
      eq(d.reached, ["hatchling", "fry"], "growth tab: hatchling and fry are reached");
      eq(d.days, 28, "growth tab: 28 days");
      eq(d.fours, [days[1], days[0]], "growth tab: the two seeded days are at 4");
      eq(d.zeros, 26, "growth tab: the rest are at 0");
      eq(d.aria, 0, "growth tab: a day is read once (no aria-label beside the hidden text)");
      check(/^[A-Z][a-z]+ \d{1,2}: 4 care points$/.test(d.label), "growth tab: the day label (" + d.label + ")");
      check(/^[A-Z][a-z]+ \d{1,2}: no care points$/.test(d.zeroLabel), "growth tab: the zero label (" + d.zeroLabel + ")");
      eq(d.last, await today(c.page), "growth tab: the calendar ends today");
      eq(d.hint, "Good days help Mochi grow: learn something and care for the pool.", "growth tab: the hint");
      await done(c, "growth tab");
    }
    /* 24: the strip with the shop on and off */
    cases++;
    {
      const tabsOf = (page) => page.evaluate(() => ({ strip: !document.querySelector(".pet-tabs").hidden, tabs: Array.from(document.querySelectorAll(".pet-tabs [role=tab]")).map((b) => b.getAttribute("data-tab")) }));
      const on = await open(seedPet({ v: 1 }));
      await openPool(on.page);
      eq(await tabsOf(on.page), { strip: true, tabs: ["pool", "shop", "wardrobe", "growth"] }, "tabs: shop on shows four");
      await done(on, "tabs on");
      const off = await open(seedPet({ v: 1 }));
      await off.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { shop: "off" }); });
      await openPool(off.page);
      eq(await tabsOf(off.page), { strip: true, tabs: ["pool", "growth"] }, "tabs: shop off shows Pool and Growth");
      await done(off, "tabs off");
    }
    /* 25: tab keyboard */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }));
      await openPool(c.page);
      const focused = (page) => page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-tab"));
      await c.page.focus('button[data-tab="pool"]');
      await c.page.keyboard.press("ArrowLeft");
      eq(await focused(c.page), "growth", "tab keys: ArrowLeft from Pool lands on Growth");
      await c.page.keyboard.press("ArrowRight");
      eq(await focused(c.page), "pool", "tab keys: ArrowRight wraps to Pool");
      await c.page.keyboard.press("End");
      eq(await focused(c.page), "growth", "tab keys: End");
      await c.page.keyboard.press("Home");
      eq(await focused(c.page), "pool", "tab keys: Home");
      const d = await c.page.evaluate(() => Array.from(document.querySelectorAll(".pet-tabs [role=tab]")).map((t) => {
        const p = document.getElementById(t.getAttribute("aria-controls"));
        return [p.getAttribute("role"), p.getAttribute("aria-labelledby") === t.id, t.getAttribute("aria-selected"), t.tabIndex, p.hidden];
      }));
      eq(d, [["tabpanel", true, "true", 0, false], ["tabpanel", true, "false", -1, true], ["tabpanel", true, "false", -1, true], ["tabpanel", true, "false", -1, true]], "tab keys: roles, labels and the roving tabindex");
      await done(c, "tab keys");
    }
    /* 26: T7 in the calendar */
    cases++;
    {
      const d1 = await (async () => { const d = new Date(); d.setDate(d.getDate() - 1); const p = (x) => (x < 10 ? "0" : "") + x; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); })();
      const ACTS = { feed: { pellet: 1 }, play: 1, clean: 1, spark: 1 };
      const c = await open(Object.assign(seedPet({ v: 1, care: { [d1]: ACTS } }), { "bm.activity.v1": JSON.stringify({ days: { [d1]: 0 } }) }));
      await openPool(c.page);
      await c.page.click('button[data-tab="growth"]');
      eq(await c.page.evaluate((k) => document.querySelector('li[data-day="' + k + '"]').getAttribute("data-points"), d1), "0", "T7 calendar: care without XP is 0");
      await done(c, "T7 calendar");
    }
    /* 27: the X-7 minors */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, owned: { "decor:castle": "2025-01-01" }, needs: { tummy: { n: 4, at: Date.now() } } }));
      await openShop(c.page);
      /* the item is no longer owned in the record (another tab); the button still shows: the click changes nothing */
      await c.page.evaluate(() => { const r = JSON.parse(localStorage.getItem("bm.pet.v1")); delete r.owned; localStorage.setItem("bm.pet.v1", JSON.stringify(r)); });
      const rec0 = await stored(c.page);
      await c.page.click('li[data-item="decor:castle"] button[data-shop="place"]');
      eq(await stored(c.page), rec0, "minors: a Place that changes nothing writes nothing");
      check(!/in the pool/.test(await shopLine(c.page)), "minors: and does not claim the castle is in the pool");
      const sn = await c.page.evaluate(() => ["snack:kelp-chip", "snack:shrimp-puff", "snack:berry-bite"].map((id) => {
        const li = document.querySelector('li[data-item="' + id + '"]');
        const n = li.querySelector(".pet-item-note");
        return [id, li.querySelector("button").disabled, n.hidden ? "" : n.textContent, li.querySelector(".pet-item-price").textContent];
      }));
      eq(sn, [["snack:kelp-chip", false, "", "5 facets"], ["snack:shrimp-puff", true, "Mochi has room for 1 heart", "8 facets"], ["snack:berry-bite", true, "Mochi has room for 1 heart", "12 facets"]], "minors: snacks that do not fit are disabled with the room in the row");
      await done(c, "minors");
    }
    /* 28: inline */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }), { path: "progress.html" });
      check(await until(c.page, () => !!document.querySelector("#mochi .pet-pool")), "inline: the pool mounts in #mochi");
      const d = await c.page.evaluate(() => {
        const s = document.querySelector("section#mochi");
        return {
          pet: s.hasAttribute("data-pet"), dialog: !!document.querySelector("dialog.pet-dialog"), close: !!s.querySelector("[data-pet-close]"),
          title: s.querySelectorAll("h2.pet-title").length, h2: s.querySelectorAll("h2").length, needs: s.querySelectorAll("li[data-need]").length,
          actions: !!s.querySelector(".pet-actions"), tabs: s.querySelectorAll(".pet-tabs [role=tab]").length, pools: document.querySelectorAll(".pet-pool").length,
          focus: s.contains(document.activeElement)
        };
      });
      check(d.pet, "inline: #mochi carries data-pet");
      check(!d.dialog && !d.close && !d.focus, "inline: no dialog, no Close button, no focus move");
      eq([d.title, d.h2, d.needs, d.actions, d.pools], [1, 1, 4, true, 1], "inline: one title, four needs, the care row, one pool");
      check(d.tabs >= 2, "inline: the tabs");
      check(c.requests.some((u) => PET_CHUNK.test(u)), "inline: the pet chunk was fetched (the page carries [data-pet])");
      await done(c, "inline");
    }
    /* 29: redraw */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }), { path: "progress.html" });
      await until(c.page, () => !!document.querySelector("#mochi .pet-pool"));
      const count = (page) => page.evaluate(() => ({ pools: document.querySelectorAll(".pet-pool").length, section: !!document.querySelector("#mochi") }));
      const before = await count(c.page);
      check(before.pools === 1, "redraw: one pool before");
      for (const type of ["level", "sync", "level"]) {
        await c.page.evaluate((t) => { window.__old = document.querySelector("#mochi"); window.BMStore.emit({ type: t }); }, type);
        check(await until(c.page, () => !!document.querySelector("#mochi .pet-pool")), "redraw (" + type + "): the pool is back");
        const after = await count(c.page);
        check(after.pools === 1, "redraw (" + type + "): one pool after");
        check(await c.page.evaluate(() => window.__old !== document.querySelector("#mochi") && !window.__old.isConnected && !window.__old.querySelector(".pet-pool")), "redraw (" + type + "): the old panel is rebuilt and emptied");
      }
      /* two redraws back to back while the import is pending: still one pool */
      await c.page.evaluate(() => { window.BMStore.emit({ type: "level" }); window.BMStore.emit({ type: "sync" }); });
      await new Promise((r) => setTimeout(r, 800));
      eq(await c.page.evaluate(() => document.querySelectorAll(".pet-pool").length), 1, "redraw: back-to-back redraws leave one pool");
      await done(c, "redraw");
    }
    /* 30: hidden on the progress page */
    cases++;
    {
      const c = await open(seed_calm(), { path: "progress.html" });
      await new Promise((r) => setTimeout(r, 500));
      eq(await c.page.evaluate(() => document.querySelectorAll("#mochi").length), 0, "study mode: no #mochi on load");
      eq(c.requests.filter((u) => PET_CHUNK.test(u)), [], "study mode: no pet chunk on progress");
      await done(c, "study mode progress");
      const o = await open(seedPet({ v: 1 }), { path: "progress.html" });
      await until(o.page, () => !!document.querySelector("#mochi .pet-pool"));
      await o.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { pet: "off" }); window.BMStore.emit({ type: "level" }); });
      check(await until(o.page, () => !document.querySelector("#mochi") && !document.querySelector(".pet-pool")), "pet off: the panel and the pool are gone after a redraw");
      await done(o, "pet off progress");
    }
    /* 31: the popover's still */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }));
      await c.page.click(".topbar .hud-level");
      check(await until(c.page, () => !!document.querySelector("#hud-pop .pop-mochi")), "popover: the still is there");
      const d = await c.page.evaluate(() => {
        const s = document.querySelector("#hud-pop .pop-mochi"), r = s.getBoundingClientRect();
        const mood = window.BMCompanion.info().mood;
        return { img: s.style.backgroundImage, pos: s.style.backgroundPosition, size: s.style.backgroundSize, hidden: s.getAttribute("aria-hidden"), w: Math.round(r.width), h: Math.round(r.height), idx: window.BMCompanion.moods().indexOf(mood) };
      });
      check(/mochi-pink-poses\.webp/.test(d.img), "popover: the pink sheet (" + d.img + ")");
      eq([d.size, d.hidden, d.w, d.h], ["900% 100%", "true", 64, 64], "popover: nine boxes, aria-hidden, 4rem square");
      eq(parseFloat(d.pos), d.idx * 100 / 8, "popover: the position follows the companion's mood");
      await done(c, "popover still");
      const o = await open(seedPet({ v: 1 }));
      await o.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { pet: "off" }); });
      await o.page.click(".topbar .hud-level");
      await until(o.page, () => !!document.querySelector("#hud-pop"));
      eq(await o.page.evaluate(() => document.querySelectorAll("#hud-pop .pop-mochi").length), 0, "popover: no still with pet off");
      await done(o, "popover pet off");
    }
    /* 32: Feed inline */
    cases++;
    {
      const c = await open({ "bm.pet.v1": JSON.stringify({ needs: { tummy: { n: 3, at: Date.now() } } }) }, { path: "progress.html" });
      await until(c.page, () => !!document.querySelector("#mochi .pet-pool"));
      await busLog(c.page);
      await c.page.click('#mochi button[data-act="feed"]');
      const day = await today(c.page);
      eq(await hearts(c.page, "tummy"), 4, "inline feed: the tummy row shows 4");
      eq(await lineOf(c.page), "Mochi munches happily.", "inline feed: the line");
      const rec = JSON.parse(await stored(c.page));
      eq([rec.gift[day], rec.care[day].feed.pellet], [1, 1], "inline feed: gift and pellet written");
      eq(await c.page.evaluate(() => window.__pet), ["gift:feed:" + day], "inline feed: one gift event");
      await done(c, "inline feed");
    }
    /* 33: two pools, one set of hooks */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }), { path: "progress.html" });
      await until(c.page, () => !!document.querySelector("#mochi .pet-pool"));
      await c.page.evaluate(() => window.BMCompanion.openPool().then((M) => {
        const d = document.createElement("div"); d.id = "second"; document.body.appendChild(d);
        window.__second = M.mountPool(d, { mode: "inline" });
      }));
      const lines = () => c.page.evaluate(() => [document.querySelector("#mochi .pet-facets").textContent, document.querySelector("#second .pet-facets").textContent]);
      eq(await lines(), ["You have 0 facets.", "You have 0 facets."], "two pools: both start at 0");
      await c.page.evaluate(() => { const r = JSON.parse(localStorage.getItem("bm.pet.v1")); r.earned = { "strong:a": 1 }; window.BMStore.write(window.BMStore.keys.pet, r); window.BMStore.emit({ type: "pet", what: "sync" }); });
      check(await until(c.page, () => /You have 20 facets/.test(document.querySelector("#mochi .pet-facets").textContent) && /You have 20 facets/.test(document.querySelector("#second .pet-facets").textContent)), "two pools: both facets lines repaint (" + JSON.stringify(await lines()) + ")");
      await c.page.evaluate(() => window.__second.dispose());
      eq(await c.page.evaluate(() => [document.querySelectorAll(".pet-pool").length, document.querySelector("#second").hasAttribute("data-pet")]), [1, false], "two pools: dispose removes only its own shell and data-pet");
      await c.page.evaluate(() => { const r = JSON.parse(localStorage.getItem("bm.pet.v1")); r.earned = { "strong:a": 1, "strong:b": 1 }; window.BMStore.write(window.BMStore.keys.pet, r); window.BMStore.emit({ type: "pet", what: "sync" }); });
      check(await until(c.page, () => /You have 40 facets/.test(document.querySelector("#mochi .pet-facets").textContent)), "two pools: the first still repaints after the second is gone");
      await done(c, "two pools");
    }
    /* 34: accessories in the shop */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE }));
      await openShop(c.page);
      eq(await c.page.evaluate(() => Array.from(document.querySelectorAll('.pet-panel[data-panel=shop] li.pet-item[data-item^="acc:"]')).map((li) => li.getAttribute("data-item") + "=" + li.querySelector(".pet-item-price").textContent)),
        ["acc:party-hat=50 facets", "acc:crown=90 facets", "acc:flower=35 facets", "acc:backpack=60 facets", "acc:ribbon=30 facets", "acc:bell=45 facets"], "acc shop: six rows with prices");
      await busLog(c.page);
      await c.page.click('li[data-item="acc:flower"] button[data-shop="buy"]');
      const rec = JSON.parse(await stored(c.page)), day = await today(c.page);
      const ids = Object.keys(rec.spent);
      eq(ids.length, 1, "acc shop: one spend");
      check(/^buy:\d{4}-\d{2}-\d{2}:acc:flower:[0-9a-z]{8}:1$/.test(ids[0]) && rec.spent[ids[0]] === 35, "acc shop: a buy: spend of 35 (" + ids[0] + ")");
      eq(rec.owned["acc:flower"], day, "acc shop: owned from today");
      eq(await itemState(c.page, "acc:flower"), { btn: "hidden", owned: true }, "acc shop: the row shows Owned and no second Buy");
      eq(await shopLine(c.page), "Mochi has a new flower!", "acc shop: the line");
      eq(await c.page.evaluate(() => document.querySelectorAll('li[data-item="acc:flower"] button[data-shop="place"]').length), 0, "acc shop: no Place button");
      eq(await c.page.evaluate(() => window.__pet), ["buy:acc:flower"], "acc shop: one buy event");
      await done(c, "acc shop");
    }
    /* 35: the wardrobe */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, owned: { "acc:flower": "2025-01-01", "acc:bell": "2025-01-01" }, wear: { at: 5 } }));
      await openPool(c.page);
      await c.page.click('button[data-tab="wardrobe"]');
      const slots = () => c.page.evaluate(() => Array.from(document.querySelectorAll("fieldset.pet-slot")).map((f) => f.getAttribute("data-slot") + ":" + f.querySelector("legend").textContent + ":" +
        Array.from(f.querySelectorAll('button.pet-wear[role="radio"]')).map((b) => b.getAttribute("data-wear") + "=" + b.textContent + "/" + b.getAttribute("aria-checked")).join(",")));
      eq(await slots(), ["head:Head:none=Nothing/true,acc:flower=Flower/false", "back:Back:none=Nothing/true", "tail:Tail:none=Nothing/true,acc:bell=Bell/false"], "wardrobe: the slots and chips");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-worn")), "", "wardrobe: nothing worn at first");
      await busLog(c.page);
      await c.page.click('button.pet-wear[data-wear="acc:flower"]');
      const rec = JSON.parse(await stored(c.page));
      eq(rec.wear.head, "acc:flower", "wardrobe: wear.head is written");
      check(typeof rec.wear.at === "number" && rec.wear.at > 5, "wardrobe: wear.at is stamped later than the seeded 5");
      eq((await slots())[0], "head:Head:none=Nothing/false,acc:flower=Flower/true", "wardrobe: aria-checked moves");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-worn")), "head=acc:flower", "wardrobe: the porthole names what is worn");
      eq(await c.page.evaluate(() => document.querySelector("[data-wardrobe-line]").textContent), "Mochi is wearing the flower.", "wardrobe: the wear line");
      await c.page.click('button.pet-wear[data-wear="acc:bell"]');
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-worn")), "head=acc:flower,tail=acc:bell", "wardrobe: two slots, in slot order");
      const at1 = JSON.parse(await stored(c.page)).wear.at;
      check(at1 > rec.wear.at, "wardrobe: the second wear is stamped later than the first");
      await c.page.click('fieldset[data-slot="head"] button.pet-wear[data-wear="none"]');
      const off = JSON.parse(await stored(c.page));
      check(off.wear.head === undefined && off.wear.tail === "acc:bell" && off.wear.at > at1, "wardrobe: Nothing clears the head and keeps the tail");
      eq(await c.page.evaluate(() => document.querySelector("[data-wardrobe-line]").textContent), "Mochi took it off.", "wardrobe: the took-off line");
      eq(await c.page.evaluate(() => document.querySelector(".pet-porthole").getAttribute("data-pet-worn")), "tail=acc:bell", "wardrobe: the porthole follows");
      eq(await c.page.evaluate(() => window.__pet), ["wear:acc:flower", "wear:acc:bell", "wear:none"], "wardrobe: the bus events");
      eq(c.requests.filter((u) => /\/models\/mochi\/acc\//.test(u)), [], "wardrobe: a 2D page requests no accessory file");
      await done(c, "wardrobe");
    }
    /* 36: nothing to wear */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE }));
      await openPool(c.page);
      await c.page.click('button[data-tab="wardrobe"]');
      const d = await c.page.evaluate(() => ({ fieldsets: document.querySelectorAll(".pet-panel[data-panel=wardrobe] fieldset").length, text: document.querySelector(".pet-wardrobe-empty").textContent, shown: !document.querySelector(".pet-wardrobe-empty").hidden }));
      eq(d, { fieldsets: 0, text: "Nothing to wear yet. The shop has hats and more.", shown: true }, "wardrobe empty: the line and no fieldset");
      await done(c, "wardrobe empty");
    }
    /* 37: stale */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, owned: { "acc:flower": "2025-01-01" } }));
      await openPool(c.page);
      await c.page.click('button[data-tab="wardrobe"]');
      await c.page.evaluate(() => window.BMStore.emit({ type: "stale" }));
      const before = await stored(c.page);
      await c.page.click('button.pet-wear[data-wear="acc:flower"]');
      eq(await stored(c.page), before, "wardrobe stale: nothing is written");
      eq(await c.page.evaluate(() => document.querySelector("[data-wardrobe-line]").textContent), "Mochi's facets are catching up after a sync.", "wardrobe stale: the line");
      await done(c, "wardrobe stale");
    }
    /* 38: the wardrobe's keys and minors */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, owned: { "acc:flower": "2025-01-01" }, wear: { head: "acc:crown", at: 5 } }));
      await openPool(c.page);
      await c.page.click('button[data-tab="wardrobe"]');
      const head = (sel) => 'fieldset[data-slot="head"] ' + (sel || "");
      await busLog(c.page);
      const lineW = () => c.page.evaluate(() => document.querySelector("[data-wardrobe-line]").textContent);
      /* the stale unowned crown paints as Nothing; clicking Nothing writes and says nothing */
      const before = await stored(c.page);
      eq(await c.page.evaluate(() => document.querySelector('fieldset[data-slot="head"] button[data-wear="none"]').getAttribute("aria-checked")), "true", "keys: a stale unowned id paints as Nothing");
      await c.page.click(head('button[data-wear="none"]'));
      eq([await stored(c.page), await lineW(), await c.page.evaluate(() => window.__pet)], [before, "", []], "keys: Nothing over a stale id writes nothing and says nothing");
      /* ArrowRight from Nothing */
      await c.page.focus(head('button[data-wear="none"]'));
      await c.page.keyboard.press("ArrowRight");
      const rec = JSON.parse(await stored(c.page));
      eq(rec.wear.head, "acc:flower", "keys: ArrowRight from Nothing wears the flower");
      const chips = () => c.page.evaluate(() => ({
        focus: document.activeElement.getAttribute("data-wear"),
        tab: Array.from(document.querySelectorAll('fieldset[data-slot="head"] button.pet-wear')).map((b) => b.getAttribute("data-wear") + ":" + b.tabIndex + ":" + b.getAttribute("aria-checked"))
      }));
      eq(await chips(), { focus: "acc:flower", tab: ["none:-1:false", "acc:flower:0:true"] }, "keys: focus moves, the roving tabindex follows the checked chip");
      eq(await c.page.evaluate(() => window.__pet), ["wear:acc:flower"], "keys: one wear event");
      /* a repeat and a chord write nothing */
      const kept = await stored(c.page);
      await c.page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: true, bubbles: true, cancelable: true })));
      await c.page.keyboard.press("Control+ArrowLeft");
      await c.page.keyboard.press("Shift+ArrowLeft");
      eq([await stored(c.page), (await chips()).focus], [kept, "acc:flower"], "keys: a repeat and a chord write nothing and move nothing");
      /* clicking the checked chip: nothing */
      await c.page.click(head('button[data-wear="acc:flower"]'));
      eq([await stored(c.page), await lineW(), await c.page.evaluate(() => window.__pet.length)], [kept, "Mochi is wearing the flower.", 1], "keys: the checked chip again writes nothing and the line is unchanged");
      /* a rebuild while focus is inside keeps focus on the same chip */
      await c.page.evaluate(() => {
        const r = JSON.parse(localStorage.getItem("bm.pet.v1"));
        r.owned["acc:crown"] = "2025-01-01";
        window.BMStore.write(window.BMStore.keys.pet, r);
        window.BMStore.emit({ type: "pet", what: "sync" });
      });
      check(await until(c.page, () => document.querySelectorAll('fieldset[data-slot="head"] button.pet-wear').length === 3), "keys: the chips are rebuilt with the crown");
      eq((await chips()).focus, "acc:flower", "keys: focus is back on the same chip after the rebuild");
      await c.page.keyboard.press("ArrowLeft");
      eq(JSON.parse(await stored(c.page)).wear.head, "acc:crown", "keys: ArrowLeft moves to the previous chip in catalogue order (the crown)");
      await done(c, "wardrobe keys");
    }
    /* 39: the Wardrobe tab with the shop off */
    cases++;
    {
      const tabsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll(".pet-tabs [data-tab]")).map((b) => b.getAttribute("data-tab")));
      const c = await open(seedPet({ owned: { "acc:flower": "2025-01-01" } }));
      await c.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { shop: "off" }); });
      await openPool(c.page);
      eq(await tabsOf(c.page), ["pool", "wardrobe", "growth"], "shop off with an accessory: the Wardrobe tab is there");
      await done(c, "wardrobe shop off owned");
      const o = await open(seedPet({ v: 1 }));
      await o.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { shop: "off" }); });
      await openPool(o.page);
      eq(await tabsOf(o.page), ["pool", "growth"], "shop off with none: no Wardrobe tab");
      await done(o, "wardrobe shop off none");
    }
    /* 40: a refused wear */
    cases++;
    {
      const c = await open(seedPet({ earned: FIVE, owned: { "acc:flower": "2025-01-01" } }));
      await openPool(c.page);
      await c.page.click('button[data-tab="wardrobe"]');
      await busLog(c.page);
      await c.page.evaluate(() => { const S = window.BMStore, w = S.write; S.write = (k, v, q) => (k === S.keys.pet ? false : w.call(S, k, v, q)); });
      const before = await stored(c.page);
      await c.page.click('button.pet-wear[data-wear="acc:flower"]');
      const d = await c.page.evaluate(() => ({
        line: document.querySelector("[data-wardrobe-line]").textContent,
        chips: Array.from(document.querySelectorAll('fieldset[data-slot="head"] button.pet-wear')).map((b) => b.getAttribute("data-wear") + ":" + b.getAttribute("aria-checked")),
        events: window.__pet
      }));
      eq(d, { line: "", chips: ["none:true", "acc:flower:false"], events: [] }, "refused wear: no line, no event, the chips from the record");
      eq(await stored(c.page), before, "refused wear: nothing stored");
      await done(c, "refused wear");
    }
    /* 41: Arena fill */
    cases++;
    {
      const c = await open(seedPet({ needs: { play: { n: 2, at: Date.now() } } }));
      const day = await today(c.page);
      await busLog(c.page);
      const emit = () => c.page.evaluate((d) => window.BMStore.emit({ type: "arena", phase: "recorded", set: "ch01/practice", day: d, due: [], medal: 0 }), day);
      await emit();
      let rec = JSON.parse(await stored(c.page));
      eq([rec.needs.play.n, rec.care[day].runs, rec.care[day].play], [3, 1, undefined], "arena fill: Play rose by 1, care.runs is 1 and care.play is absent");
      await emit();
      rec = JSON.parse(await stored(c.page));
      eq([rec.needs.play.n, rec.care[day].runs, rec.care[day].play, rec.owned || {}], [4, 2, undefined, {}], "arena fill: a second run makes runs 2, play stays absent, and no toy applied");
      eq([rec.care[day].spark, rec.needs.spark], [undefined, undefined], "arena fill: Spark is untouched without a due review");
      eq(await c.page.evaluate(() => window.__pet), ["care:play", "care:play"], "arena fill: one care event per run");
      await done(c, "arena fill");
    }
    /* 41b: runs never count against the Play button */
    cases++;
    {
      const c = await open(seedPet({ owned: TOY, needs: { play: { n: 1, at: Date.now() } } }));
      const day = await today(c.page);
      const emit = () => c.page.evaluate((d) => window.BMStore.emit({ type: "arena", phase: "recorded", set: "ch01/practice", day: d, due: [], medal: 0 }), day);
      await emit(); await emit();
      await openPool(c.page);
      for (let i = 0; i < 3; i++) {
        await c.page.click('button[data-act="play"]');
        check(!(await c.page.evaluate(() => document.querySelector('button[data-act="play"]').disabled)) || i === 2, "runs and the button: click " + (i + 1) + " is accepted");
      }
      const rec = JSON.parse(await stored(c.page));
      eq([rec.care[day].runs, rec.care[day].play], [2, 3], "runs and the button: two runs and three button plays");
      check(await c.page.evaluate(() => document.querySelector('button[data-act="play"]').disabled), "runs and the button: the fourth is disabled");
      eq(await lineOf(c.page), "Mochi has played enough for today. The Arena is always open.", "runs and the button: the cap line");
      await done(c, "runs and the button");
    }
    /* 42: Spark fill */
    cases++;
    {
      const c = await open(seedPet({ needs: { spark: { n: 2, at: Date.now() } } }));
      const day = await today(c.page);
      const seeded = await c.page.evaluate(() => {
        const d = window.BMSite.dayKey(new Date(Date.now() - 10 * 86400000));
        return window.BMEvents.seed({ "ch01#numbers": { box: 0, last: d } });
      });
      eq(seeded, 1, "spark fill: the placed, due schedule is seeded");
      const attempt = () => c.page.evaluate(() => window.BMStore.emit({ type: "attempt", chapter: "ch01", key: "e1", section: "numbers", correct: true, tryNo: 1, hintLevel: 0, solutionOpen: false }));
      await attempt();
      let rec = JSON.parse(await stored(c.page));
      eq([rec.needs.spark.n, rec.care[day].spark], [3, 1], "spark fill: Spark rose by 1 and care.spark is 1");
      eq(Object.keys(rec.earned || {}), ["review:" + day + ":ch01#numbers"], "spark fill: the review id was earned too");
      await attempt();
      rec = JSON.parse(await stored(c.page));
      eq([rec.needs.spark.n, rec.care[day].spark, Object.keys(rec.earned).length], [4, 2, 1], "spark fill: a second attempt fills again, the id pays once");
      await done(c, "spark fill");
    }
    /* 43: low pose */
    cases++;
    {
      const c = await open(seedPet({ needs: { tummy: { n: 1, at: Date.now() } } }));
      const day = await today(c.page);
      const read = (page) => page.evaluate(() => ({ mood: window.BMCompanion.info().mood, line: window.BMCompanion.state().line }));
      check(await until(c.page, () => window.BMCompanion.state().line === "Mochi could use a snack."), "low pose: the snack line is said");
      eq((await read(c.page)).mood, "sleepy", "low pose: Tummy at 1 heart reads sleepy");
      eq(JSON.parse(await c.page.evaluate(() => localStorage.getItem("bm.run.v1"))).seen.lowSaid, { tummy: day }, "low pose: the day is kept in run.seen.lowSaid");
      await c.page.reload({ waitUntil: "load" });
      check(await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000), "low pose: the companion mounts again");
      await new Promise((r) => setTimeout(r, 600));
      eq(await read(c.page), { mood: "sleepy", line: "" }, "low pose: a reload keeps the pose and says nothing again today");
      await c.page.evaluate(() => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { pet: "off" }); window.BMStore.emit({ type: "prefs" }); });
      check(await until(c.page, () => window.BMCompanion.info().mood === "idle"), "low pose: with the pool off the mood is idle");
      await done(c, "low pose");
    }
    /* 44: a pet change on the bus */
    cases++;
    {
      const c = await open(seedPet({ v: 1 }));
      await c.page.evaluate(() => window.BMStore.emit({ type: "pet", what: "earn", id: "strong:x" }));
      const d = await c.page.evaluate(() => ({ mood: window.BMCompanion.info().mood, line: window.BMCompanion.state().line }));
      eq(d, { mood: "happy", line: "" }, "bus reaction: a pet earn turns the companion happy with no line");
      check(await until(c.page, () => window.BMCompanion.info().mood === "idle", null, 7000), "bus reaction: it settles back to idle");
      await done(c, "bus reaction");
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
