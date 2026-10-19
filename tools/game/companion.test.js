#!/usr/bin/env node
/* Headless Chromium checks of the companion (src/ui/companion.ts, src/learn/mood.ts) on the
   built site (dist/, which must be current):
     node tools/game/companion.test.js
   Chapter page parts/1-algebra/01-numbers.html; 2D only, no WebGL.
   1. first visit: the intro line, seen.companion is 1, the live region says it, a reload is silent
   2. mounted in the sidebar with form-1-poses.webp, rest pose, "Pip"; no GLB, model script or Three.js
   3. a correct first-try answer: delighted pose; "First try." at once, then it settles to rest
   4. a wrong answer: curious, no line; a second: "Let's look again." at once
   5. a section due on load: waiting pose, "I'd like to look at" with a link to the section
   6. activity only 4+ days ago: sleepy pose, "Good to see you."
   7. Study mode hides it; turning it off shows it
   8. the companion preference off hides it; on shows it
   9. at 360 px: fixed, steps aside while an exercise field has focus, clear of the field otherwise
   10. reduced motion: is-evolving without an animation, "Pip became Sprig!", the second sheet
   11. the quiet window: "Chapter done!" waits in the pending slot, then shows
   12. no page errors in any case */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const CHAPTER = "parts/1-algebra/01-numbers.html";
const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const INTRO = "This is Pip, your form. It keeps you company while you work.";
let server, browser, fails = 0, passes = 0, cases = 0;
function check(cond, what) {
  if (cond) passes++;
  else { fails++; console.error("FAIL " + what); }
}
function eq(a, b, what) { check(JSON.stringify(a) === JSON.stringify(b), what + " — got " + JSON.stringify(a) + ", want " + JSON.stringify(b)); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* a local YYYY-MM-DD, n days back, as BMSite.dayKey() builds it */
function dayAgo(n) {
  const d = new Date(), t = (x) => (x < 10 ? "0" : "") + x;
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + t(d.getMonth() + 1) + "-" + t(d.getDate());
}
const TODAY = dayAgo(0);
const activity = (days, goal) => JSON.stringify({ days, goal: goal || 30 });
const SEEN = JSON.stringify({ seen: { companion: 1 } });
function seeds(extra, o) {
  o = o || {};
  const s = {
    "bm.lesson.v1": '{"mode":"page"}',
    "bm.activity.v1": activity({ [TODAY]: 12 })
  };
  if (!o.intro) s["bm.run.v1"] = SEEN;
  return Object.assign(s, extra || {});
}

async function open(seed, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 900 }, reducedMotion: opts.reducedMotion || "no-preference" });
  const requests = [], errors = [];
  context.on("request", (r) => requests.push(r.url()));
  await context.route(/^(https?|wss?):/, (r) => server.owns(r.request().url()) && !THREE_CHUNK.test(r.request().url()) ? r.continue() : r.abort());
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    if (!("bm.guide.v1" in s)) localStorage.setItem("bm.guide.v1", '{"v":1,"seen":1}');
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push("console: " + m.text());
  });
  await page.goto(server.url + (opts.path || CHAPTER), { waitUntil: "load" });
  await page.waitForFunction(() => window.BMCompanion && window.BMCompanion.state().mounted || (document.readyState === "complete" && window.BMCompanion), null, { timeout: 10000 }).catch(() => {});
  await wait(150);
  return { context, page, requests, errors };
}
const st = (page) => page.evaluate(() => window.BMCompanion.state());
const fig = (page) => page.evaluate(() => {
  const f = document.querySelector("figure[data-companion]");
  if (!f) return null;
  const pic = f.querySelector(".companion-pic"), line = f.querySelector(".companion-line");
  return {
    inSidebar: !!f.closest("aside[data-sidebar]"), mood: f.getAttribute("data-mood"), pose: f.getAttribute("data-pose"),
    line: line ? line.textContent : "", links: line ? Array.from(line.querySelectorAll("a")).map((a) => a.getAttribute("href")) : [],
    name: f.querySelector(".companion-name").textContent, label: pic.getAttribute("aria-label"),
    image: pic.style.backgroundImage, pos: getComputedStyle(pic).backgroundPosition,
    anim: getComputedStyle(pic).animationName, evolving: f.classList.contains("is-evolving"),
    position: getComputedStyle(f).position, hidden: f.hasAttribute("data-hidden"), display: getComputedStyle(f).display
  };
});
/* polls a condition in the page up to ms; true when it held */
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 6000, polling: 50 }).then(() => true, () => false);
const lineIs = (page, text, ms) => until(page, (t) => window.BMCompanion.state().line === t, text, ms);
const runOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.run.v1") || "null"));
async function done(c, what) {
  eq(c.errors, [], what + ": no page errors");
  await c.context.close();
}

/* one practice exercise answered through the real controls, as browser.test.js does */
async function answer(page, sel, right) {
  await page.evaluate(({ sel, right }) => {
    const ex = document.querySelector(sel);
    const kind = ex.getAttribute("data-kind"), key = (ex.getAttribute("data-answer") || "").split("|")[0];
    if (kind === "choice") {
      const labels = ex.querySelectorAll(".choice input");
      labels[right ? parseInt(key, 10) - 1 : (parseInt(key, 10) % labels.length)].click();
    } else if (kind === "multi") {
      const want = key.split(",").map((s) => parseInt(s, 10) - 1);
      Array.prototype.forEach.call(ex.querySelectorAll(".choice input"), (inp, j) => { inp.checked = right ? want.indexOf(j) > -1 : want.indexOf(j) < 0; });
    } else if (kind === "blank") {
      Array.prototype.forEach.call(ex.querySelectorAll("input.blank"), (b) => { b.value = right ? (b.getAttribute("data-answer") || "").split("|")[0] : "987654"; });
    } else {
      ex.querySelector(".ex-form input").value = right ? key : "987654";
    }
  }, { sel, right });
  await page.click(sel + " .ex-form .btn:not(.ghost)");
}
const E1 = '#practice .ex[data-key="e1"]';

async function run() {
  server = await target.start(site.parseArgs(process.argv.slice(2)));
  browser = await chromium.launch({ env: require("../lib/gl").env(chromium) });
  try {
    /* 1 */
    cases++;
    {
      const c = await open(seeds({}, { intro: true }));
      eq((await st(c.page)).line, INTRO, "intro: the line shows on a first visit");
      eq((await runOf(c.page)).seen.companion, 1, "intro: seen.companion becomes 1");
      check(await until(c.page, (t) => (document.querySelector("#bm-live") || {}).textContent.indexOf(t) > -1, INTRO, 6000), "intro: the live region carries the line");
      await c.page.reload({ waitUntil: "load" });
      await wait(400);
      const s = await st(c.page);
      eq([s.mounted, s.line], [true, ""], "intro: after a reload no intro, no line");
      await done(c, "intro");
    }
    /* 2 */
    cases++;
    {
      const c = await open(seeds());
      const f = await fig(c.page);
      check(f && f.inSidebar, "mounted: figure[data-companion] is in aside[data-sidebar]");
      check(f && /form-1-poses\.webp/.test(f.image) && /form-1-poses\.webp"?\)$/.test(f.image), "mounted: the sheet is form-1-poses.webp: " + (f && f.image));
      eq([f.pose, f.name], ["rest", "Pip"], "mounted: rest pose, named Pip");
      const reqs = c.requests;
      check(reqs.some((u) => /\/models\/forms\/form-1-poses\.webp(?:[?#]|$)/.test(u)), "mounted: the sheet was requested");
      eq(reqs.filter((u) => /\.glb(?:[?#]|$)|-color\.webp|-surface\.webp|\/bundle\/(?:three|form-model|three-model)\.js/.test(u)), [], "mounted: no GLB, textures or model script requested");
      await done(c, "mounted");
    }
    /* 3 */
    cases++;
    {
      const c = await open(seeds());
      await answer(c.page, E1, true);
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-pose") === "delighted", null, 3000), "first try: delighted pose");
      check(await lineIs(c.page, "First try.", 3000), "first try: the line shows at once");
      eq((await st(c.page)).key, "first-try", "first try: key");
      await wait(4000);   /* the solved, xp and combo events that follow leave the caption up for its hold */
      eq((await st(c.page)).line, "First try.", "first try: the caption stays 4 s after it shows");
      check(await until(c.page, () => window.BMCompanion.state().line === "" && document.querySelector("figure[data-companion]").getAttribute("data-pose") === "rest", null, 8000), "first try: the line clears and the pose settles to rest within 8 s");
      await done(c, "first try");
    }
    /* 4 */
    cases++;
    {
      const c = await open(seeds());
      await answer(c.page, E1, false);
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-pose") === "curious", null, 3000), "wrong: curious pose");
      await wait(4300);   /* past the quiet window after the first verdict */
      eq((await st(c.page)).line, "", "wrong: no line after one miss");
      /* a different wrong value: the engine does not count the same one twice */
      await c.page.fill(E1 + " .ex-form input", "-8");
      await c.page.click(E1 + " .ex-form .btn:not(.ghost)");
      const ok4 = await lineIs(c.page, "Let's look again.", 3000); check(ok4, "wrong twice: the line shows at once ");
      await done(c, "wrong");
    }
    /* 5 */
    cases++;
    {
      const c = await open(seeds({
        "bm.attempts.v1": JSON.stringify({ ch02: { e1: { tries: 1, solved: 1, first: 1, section: "one-unknown" }, e2: { tries: 1, solved: 2, first: 1, section: "one-unknown" } } })
      }));
      await c.page.evaluate((day) => {
        window.BMEvents.fromRun({ day, mode: "standard", answers: [{ section: "ch02#one-unknown", g: "g0", first: true, retry: false, hf: false }] });
      }, dayAgo(4));
      await c.page.reload({ waitUntil: "load" });
      await wait(500);
      const f = await fig(c.page);
      eq(f && f.pose, "waiting", "due: waiting pose");
      check(f && f.line.indexOf("I'd like to look at") === 0, "due: the line starts with the invitation: " + (f && f.line));
      check(f && f.links.some((h) => /#one-unknown$/.test(h)), "due: the line links to the section: " + (f && JSON.stringify(f.links)));
      await done(c, "due");
    }
    /* 6 */
    cases++;
    {
      const c = await open(seeds({ "bm.activity.v1": activity({ [dayAgo(5)]: 12 }) }));
      const f = await fig(c.page);
      eq([f.pose, f.line], ["sleepy", "Good to see you."], "sleepy: pose and line on load");
      await done(c, "sleepy");
    }
    /* 7 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"calm":true}' }));
      eq(await fig(c.page), null, "study mode: no companion");
      await c.page.evaluate(() => window.BMGame.setPref("calm", false));
      check(await until(c.page, () => !!document.querySelector("figure[data-companion]"), null, 3000), "study mode: off brings it back");
      await done(c, "study mode");
    }
    /* 8 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"companion":false}' }));
      eq(await fig(c.page), null, "preference off: no companion");
      await c.page.evaluate(() => window.BMGame.setPref("companion", true));
      check(await until(c.page, () => !!document.querySelector("figure[data-companion]"), null, 3000), "preference on: it appears");
      await done(c, "preference");
    }
    /* 9 */
    cases++;
    {
      const c = await open(seeds(), { width: 360, height: 740 });
      const f = await fig(c.page);
      eq(f && f.position, "fixed", "phone: fixed");
      const input = c.page.locator(".ex-form input").first();
      await input.scrollIntoViewIfNeeded();
      const rect = (sel) => c.page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const before = await fig(c.page);
      check(!before.hidden, "phone: shown before focus");
      check(!hit(await rect("figure[data-companion]"), await rect(".ex-form input")), "phone: clear of the field while shown");
      await input.focus();
      check(await until(c.page, () => document.querySelector("figure[data-companion]").hasAttribute("data-hidden"), null, 2000), "phone: focus sets data-hidden");
      eq((await fig(c.page)).display, "none", "phone: hidden is display none");
      await c.page.evaluate(() => document.activeElement.blur());
      check(await until(c.page, () => !document.querySelector("figure[data-companion]").hasAttribute("data-hidden"), null, 2000), "phone: blur shows it again");
      check(!hit(await rect("figure[data-companion]"), await rect(".ex-form input")), "phone: clear of the field after blur");
      await done(c, "phone");
    }
    /* 10 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"motion":"reduce"}' }), { reducedMotion: "reduce" });
      await c.page.evaluate((a) => {
        localStorage.setItem("bm.activity.v1", a);
        window.BMStore.emit({ type: "form", highest: 2, worn: 2, fresh: [2] });
      }, activity({ [TODAY]: 80 }));
      check(await until(c.page, () => document.querySelector("figure[data-companion]").classList.contains("is-evolving"), null, 1000), "evolve: is-evolving is added");
      const f = await fig(c.page);
      eq(f.anim, "none", "evolve: no animation under reduced motion");
      check(/form-2-poses\.webp/.test(f.image), "evolve: the second sheet: " + f.image);
      check(await lineIs(c.page, "Pip became Sprig!", 4000), "evolve: the line names the change");
      await done(c, "evolve");
    }
    /* 11 */
    cases++;
    {
      const c = await open(seeds());
      await c.page.evaluate(() => {
        window.BMStore.emit({ type: "attempt", correct: true, tryNo: 1, key: "e1", chapter: "ch01", hintLevel: 0, solutionOpen: false });
        window.BMStore.emit({ type: "chapterDone", fresh: true });
      });
      await wait(3000);
      const s = await st(c.page);
      check(s.line === "" || s.line === "First try.", "quiet: no chapter line within 3 s: " + s.line);
      check(s.line !== "Chapter done!", "quiet: Chapter done! has not shown");
      check(await lineIs(c.page, "Chapter done!", 9000), "quiet: Chapter done! shows after the window");
      await done(c, "quiet");
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " companion: " + cases + " cases, " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
