#!/usr/bin/env node
/* Headless Chromium checks of the companion (src/ui/companion.ts, src/learn/mood.ts) on the
   built site (dist/, which must be current):
     node tools/game/companion.test.js
   Chapter page parts/1-algebra/01-numbers.html; every page opens with ?3d=off, so the suite stays 2D
   (no WebGL) whatever the 3D path does.
   1. first visit: the intro line (Mochi), seen.companion is 1, the live region does not say it, a reload is silent
   2. mounted in the sidebar with mochi-pink-poses.webp, idle, "Mochi"; no GLB, form sheet, model script or Three.js
   3. a correct first-try answer: happy; "First try." at once, then it settles to idle
   4. a wrong answer: thinking, no line; a second: sad at once with "Let's look again.", then thinking
   5. a section due on load: thinking, "I'd like to look at" with a link to the section
   6. activity only 4+ days ago: sleepy, "Good to see you."
   7. Study mode hides it; turning it off shows it
   8. the companion preference off hides it; on shows it
   9. at 360 px: fixed, steps aside while an exercise field has focus, clear of the field otherwise
   10. reduced motion: is-evolving without an animation (a control with motion allowed animates), "Pip became Sprig!"
   11. the quiet window: "Chapter done!" waits in the pending slot, then shows
   12. no page errors in any case
   13. the kill switch (config companion "off") removes it, "on" brings it back
   14. a reset or sync event rebuilds the figure from today's state; no second intro
   15. level then chapterDone inside the quiet window: the pending slot holds the chapter line, latest wins
   16. at 360 px the due link is visible, points at the section, and the bubble clears the field
   17. print hides it; forced colors drop the picture but keep the caption
   18. the stuck nudge waits out the quiet window; a correct answer drops it
   19. arena.html: docked (fixed, 4rem, outside any sidebar) at 1280 and 360, at rest with no intro, clear of the
       Arena's inputs and buttons in the lobby and in a run; a correct answer event is happy with no line;
       the end event says "Run done."; no GLB or Three.js; the preference off removes it
   20. setMood("sleeping") puts the sheet at 100% 0 and data-mood sleeping; an unknown name is false
   21. prefs.mochi "lilac" requests the lilac sheet
   22. a fast first try (field focused, answered at once) is surprised, then happy
   23. the boss's events arrive in the answer's task
   24. under ?3d=off the mode stays "2d": no data-3d after 2 s, no mochi chunk and no GLB requested
   25. pk-words.html (longest sidebar) at 1280x900: the figure is pinned fully in view under a scrolling contents list, and stays so after the window scrolls 600 px */
"use strict";
const site = require("../lib/site");
const target = require("../lib/target");
const { chromium } = require("../lib/pw").playwright();

const CHAPTER = "parts/1-algebra/01-numbers.html";
const THREE_CHUNK = /\/bundle\/three\.js(?:[?#]|$)/;
const LINES = {
  intro: "This is Mochi, your companion. It keeps you company while you work.", first: "First try.", again: "Let's look again.",
  due: "I'd like to look at", back: "Good to see you.", chapter: "Chapter done!", level: "Level 2.", evolve: "Pip became Sprig!", stuck: "There's a clue below."
};
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
  await page.goto(server.url + (opts.path || CHAPTER) + "?3d=off", { waitUntil: "load" });
  const mounted = () => window.BMCompanion && window.BMCompanion.state().mounted;
  if (!opts.absent) check(await until(page, mounted, null, 10000), "the companion mounts on " + (opts.path || CHAPTER));
  else {
    await page.waitForFunction(() => !!window.BMCompanion, null, { timeout: 10000 }).catch(() => {});
    await wait(300);
    check(await until(page, () => !window.BMCompanion.state().mounted, null, 1000), "the companion stays unmounted");
  }
  return { context, page, requests, errors };
}
const st = (page) => page.evaluate(() => window.BMCompanion.state());
const fig0 = (page) => page.evaluate(() => {
  const f = document.querySelector("figure[data-companion]");
  if (!f) return null;
  const pic = f.querySelector(".companion-pic"), line = f.querySelector(".companion-line");
  return {
    inSidebar: !!f.closest("aside[data-sidebar]"), mood: f.getAttribute("data-mood"),
    line: line ? line.textContent : "", links: line ? Array.from(line.querySelectorAll("a")).map((a) => a.getAttribute("href")) : [],
    name: f.querySelector(".companion-name").textContent, label: pic.getAttribute("aria-label"),
    image: f.querySelector(".companion-still").style.backgroundImage, pos: getComputedStyle(f.querySelector(".companion-still")).backgroundPosition,
    anim: getComputedStyle(pic).animationName, evolving: f.classList.contains("is-evolving"),
    position: getComputedStyle(f).position, hidden: f.hasAttribute("data-hidden"), display: getComputedStyle(f).display
  };
});
/* polls a condition in the page up to ms; true when it held */
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 6000, polling: 50 }).then(() => true, () => false);
/* the figure's facts; a missing figure fails a check and gives an empty object */
const fig = async (page) => { const f = await fig0(page); if (!f) check(false, "the figure is present"); return f || { image: "", line: "", links: [] }; };
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
      eq((await st(c.page)).line, LINES.intro, "intro: the line shows on a first visit");
      eq((await runOf(c.page)).seen.companion, 1, "intro: seen.companion becomes 1");
      /* the page's own first words keep the live region at load: the intro is shown, never announced */
      await wait(2500);
      check(await c.page.evaluate((t) => ((document.querySelector("#bm-live") || {}).textContent || "").indexOf(t) < 0, LINES.intro), "intro: the live region does not carry the line");
      await c.page.reload({ waitUntil: "load" });
      await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000);
      await wait(300);   /* an intro, if one were coming, would be said by now */
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
      check(f && /mochi-pink-poses\.webp"?\)$/.test(f.image), "mounted: the sheet is mochi-pink-poses.webp: " + (f && f.image));
      eq([f.mood, f.name], ["idle", "Mochi"], "mounted: idle, named Mochi");
      eq(f.label, "Mochi, your companion, idle", "mounted: the label");
      const reqs = c.requests;
      check(reqs.some((u) => /\/models\/mochi\/mochi-pink-poses\.webp(?:[?#]|$)/.test(u)), "mounted: the sheet was requested");
      eq(reqs.filter((u) => /\/models\/forms\//.test(u)), [], "mounted: nothing under /models/forms/ requested");
      eq(reqs.filter((u) => /\.glb(?:[?#]|$)|-color\.webp|-surface\.webp|\/bundle\/(?:three|three-model|form-model|mochi)\.js/.test(u)), [], "mounted: no GLB, textures or model script requested");
      await done(c, "mounted");
    }
    /* 3 */
    cases++;
    {
      const c = await open(seeds());
      await answer(c.page, E1, true);
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "happy", null, 3000), "first try: happy");
      check(await lineIs(c.page, LINES.first, 3000), "first try: the line shows at once");
      eq((await st(c.page)).key, "first-try", "first try: key");
      await wait(3000);   /* the solved, xp and combo events that follow leave the caption up for its 6 s hold */
      eq((await st(c.page)).line, LINES.first, "first try: the caption is still up 3 s after it shows");
      check(await until(c.page, () => window.BMCompanion.state().line === "" && document.querySelector("figure[data-companion]").getAttribute("data-mood") === "idle", null, 8000), "first try: the line clears and Mochi settles to idle within 8 s");
      await done(c, "first try");
    }
    /* 4 */
    cases++;
    {
      const c = await open(seeds());
      await answer(c.page, E1, false);
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "thinking", null, 3000), "wrong: thinking");
      await wait(4300);   /* past the quiet window after the first verdict */
      eq((await st(c.page)).line, "", "wrong: no line after one miss");
      /* a different wrong value: the engine does not count the same one twice */
      await c.page.fill(E1 + " .ex-form input", "-8");
      await c.page.click(E1 + " .ex-form .btn:not(.ghost)");
      const ok4 = await lineIs(c.page, LINES.again, 3000); check(ok4, "wrong twice: the line shows at once ");
      eq((await fig(c.page)).mood, "sad", "wrong twice: sad at once");
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "thinking", null, 2500), "wrong twice: thinking within 2.5 s");
      eq((await st(c.page)).line, LINES.again, "wrong twice: the line stays");
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
      await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000);
      const f = await fig(c.page);
      eq(f && f.mood, "thinking", "due: thinking");
      check(f && f.line.indexOf(LINES.due) === 0, "due: the line starts with the invitation: " + (f && f.line));
      check(f && f.links.some((h) => /#one-unknown$/.test(h)), "due: the line links to the section: " + (f && JSON.stringify(f.links)));
      await done(c, "due");
    }
    /* 6 */
    cases++;
    {
      const c = await open(seeds({ "bm.activity.v1": activity({ [dayAgo(5)]: 12 }) }));
      const f = await fig(c.page);
      eq([f.mood, f.line], ["sleepy", LINES.back], "sleepy: mood and line on load");
      await done(c, "sleepy");
    }
    /* 7 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"calm":true}' }), { absent: true });
      eq(await fig0(c.page), null, "study mode: no companion");
      await c.page.evaluate(() => window.BMGame.setPref("calm", false));
      check(await until(c.page, () => !!document.querySelector("figure[data-companion]"), null, 3000), "study mode: off brings it back");
      await done(c, "study mode");
    }
    /* 8 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"companion":false}' }), { absent: true });
      eq(await fig0(c.page), null, "preference off: no companion");
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
    /* the class lasts 900 ms: the emit and the reads are one synchronous step in the page */
    const evolveNow = (page) => page.evaluate((a) => {
      localStorage.setItem("bm.activity.v1", a);
      window.BMStore.emit({ type: "form", highest: 2, worn: 2, fresh: [2] });
      const f = document.querySelector("figure[data-companion]"), pic = f.querySelector(".companion-pic");
      return { evolving: f.classList.contains("is-evolving"), anim: getComputedStyle(pic).animationName, level: window.BMGame.info().level };
    }, activity({ [TODAY]: 80 }));
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"motion":"reduce"}' }), { reducedMotion: "reduce" });
      const r = await evolveNow(c.page);
      eq(r.evolving, true, "evolve: is-evolving is added");
      eq(r.anim, "none", "evolve: no animation under reduced motion");
      check(r.level >= 3, "evolve: the level is 3 or more: " + r.level);
      const s = await st(c.page);
      eq(s.stage, 2, "evolve: the worn stage is 2");
      check(await lineIs(c.page, LINES.evolve, 4000), "evolve: the line names the change");
      await done(c, "evolve");
    }
    {
      /* the control: the same step with motion allowed does animate */
      const c = await open(seeds());
      const r = await evolveNow(c.page);
      eq(r.evolving, true, "evolve control: is-evolving is added");
      check(r.anim !== "none", "evolve control: the flourish animates when motion is allowed: " + r.anim);
      await done(c, "evolve control");
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
      check(s.line === "" || s.line === LINES.first, "quiet: no chapter line within 3 s: " + s.line);
      check(s.line !== LINES.chapter, "quiet: Chapter done! has not shown");
      eq(s.pending, "chapter", "quiet: the chapter line waits in the pending slot");
      check(await lineIs(c.page, LINES.chapter, 9000), "quiet: Chapter done! shows after the window");
      await done(c, "quiet");
    }
    /* 13 */
    cases++;
    {
      const c = await open(seeds());
      const setCfg = (v) => c.page.evaluate((v) => { window.BM_CONFIG = Object.assign({}, window.BM_CONFIG, { companion: v }); window.BMStore.emit({ type: "prefs" }); }, v);
      await setCfg("off");
      check(await until(c.page, () => !document.querySelector("figure[data-companion]"), null, 3000), "kill switch: off removes the figure");
      await setCfg("on");
      check(await until(c.page, () => !!document.querySelector("figure[data-companion]"), null, 3000), "kill switch: on brings it back");
      await done(c, "kill switch");
    }
    /* 14 */
    cases++;
    for (const kind of ["reset", "sync"]) {
      const c = await open(seeds({}, { intro: false }));
      await c.page.evaluate(() => { window.BMCompanion.say("Hello there."); document.querySelector("figure[data-companion]").setAttribute("data-probe", "1"); });
      eq((await st(c.page)).line, "Hello there.", kind + ": a caption is showing");
      await c.page.evaluate((t) => window.BMStore.emit({ type: t }), kind);
      check(await until(c.page, () => { const f = document.querySelector("figure[data-companion]"); return !!f && !f.hasAttribute("data-probe"); }, null, 3000), kind + ": the figure is a new element");
      const s = await st(c.page);
      eq([s.mounted, s.line, s.mood], [true, "", "idle"], kind + ": empty line, mood derived again");
      await wait(300);
      eq((await st(c.page)).line, "", kind + ": no intro again");
      await done(c, kind);
    }
    /* 15 */
    cases++;
    {
      const c = await open(seeds());
      await c.page.evaluate(() => {
        window.BMStore.emit({ type: "attempt", correct: true, tryNo: 1, key: "e1", chapter: "ch01", hintLevel: 0, solutionOpen: false });
        window.BMStore.emit({ type: "level", level: 2 });
        window.BMStore.emit({ type: "chapterDone", chapter: "ch01", fresh: true });
      });
      await wait(1500);
      const s = await st(c.page);
      eq(s.pending, "chapter", "pending: the later chapter line holds the slot");
      check(s.line !== LINES.level && s.line !== LINES.chapter, "pending: neither waiting line shows inside the window: " + s.line);
      let seen = [];
      for (let t = 0; t < 12000 && seen.indexOf(LINES.chapter) < 0; t += 100) {
        const l = (await st(c.page)).line;
        if (l && seen.indexOf(l) < 0) seen.push(l);
        await wait(100);
      }
      check(seen.indexOf(LINES.chapter) > -1, "pending: Chapter done! shows after the window: " + JSON.stringify(seen));
      check(seen.indexOf(LINES.level) < 0, "pending: Level 2. never shows");
      await done(c, "pending");
    }
    /* 16 */
    cases++;
    {
      const c = await open(seeds({
        "bm.attempts.v1": JSON.stringify({ ch02: { e1: { tries: 1, solved: 1, first: 1, section: "one-unknown" }, e2: { tries: 1, solved: 2, first: 1, section: "one-unknown" } } })
      }), { width: 360, height: 740 });
      await c.page.evaluate((day) => {
        window.BMEvents.fromRun({ day, mode: "standard", answers: [{ section: "ch02#one-unknown", g: "g0", first: true, retry: false, hf: false }] });
      }, dayAgo(4));
      await c.page.reload({ waitUntil: "load" });
      await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000);
      const link = c.page.locator("figure[data-companion] .companion-line a");
      check(await link.isVisible(), "phone due: the link is visible");
      check(/#one-unknown$/.test((await link.getAttribute("href")) || ""), "phone due: the link goes to the section");
      const input = c.page.locator(".ex-form input").first();
      await input.scrollIntoViewIfNeeded();
      const box = await c.page.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        return { fig: r(document.querySelector("figure[data-companion] figcaption")), input: r(document.querySelector(".ex-form input")) };
      });
      const a = box.fig, b = box.input;
      check(!(a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b), "phone due: the bubble clears the field " + JSON.stringify(box));
      await done(c, "phone due");
    }
    /* 17 */
    cases++;
    {
      const c = await open(seeds());
      await c.page.emulateMedia({ media: "print" });
      eq((await fig(c.page)).display, "none", "print: the figure is hidden");
      await c.page.emulateMedia({ media: "screen", forcedColors: "active" });
      const d = await c.page.evaluate(() => ({
        pic: getComputedStyle(document.querySelector(".companion-pic")).display, cap: getComputedStyle(document.querySelector("figure[data-companion] figcaption")).display
      }));
      check(d.pic === "none" && d.cap !== "none", "forced colors: the picture drops, the caption stays " + JSON.stringify(d));
      await done(c, "print and forced colors");
    }
    /* 18 */
    cases++;
    {
      const c = await open(seeds());
      await answer(c.page, E1, false);
      await c.page.evaluate(() => window.BMStore.emit({ type: "stuck", chapter: "ch01", key: "e1", signal: "idle", offer: "clue" }));
      await wait(1500);
      const s = await st(c.page);
      eq(s.pending, "stuck", "stuck: the nudge waits in the pending slot inside the quiet window");
      check(await lineIs(c.page, LINES.stuck, 9000), "stuck: 'There's a clue below.' shows after the window");
      await done(c, "stuck");
    }
    {
      const c = await open(seeds());
      await answer(c.page, E1, false);
      await c.page.evaluate(() => window.BMStore.emit({ type: "stuck", chapter: "ch01", key: "e1", signal: "idle", offer: "clue" }));
      await wait(500);
      eq((await st(c.page)).pending, "stuck", "stuck then solved: the nudge is pending");
      await answer(c.page, E1, true);
      await wait(6500);
      const s = await st(c.page);
      check(s.pending !== "stuck" && s.line !== LINES.stuck, "stuck then solved: a correct answer drops the nudge: " + JSON.stringify([s.pending, s.line]));
      await done(c, "stuck then solved");
    }
    /* 19 */
    cases++;
    for (const width of [1280, 360]) {
      const c = await open(seeds({}, { intro: true }), { path: "arena.html", width, height: 800 });
      const tag = "arena " + width;
      await wait(400);
      const s = await st(c.page);
      eq([s.mood, s.line, s.pending], ["idle", "", null], tag + ": at rest on arrival, no intro, no line");
      eq(((await runOf(c.page)) || {}).seen && (await runOf(c.page)).seen.companion, undefined, tag + ": seen.companion is untouched by the Arena");
      await c.page.evaluate(() => {
        const all = JSON.parse(localStorage.getItem("bm.attempts.v1") || "{}"), t = Date.now() - 864e5 * 2;
        window.BMGen.list().forEach((s) => {
          const ch = s.section.split("#")[0], sec = s.section.split("#")[1], recs = all[ch] = all[ch] || {};
          recs["z" + sec + "1"] = { tries: 1, first: 1, solved: t, section: sec };
          recs["z" + sec + "2"] = { tries: 1, first: 1, solved: t + 1, section: sec };
        });
        localStorage.setItem("bm.attempts.v1", JSON.stringify(all));
      });
      await c.page.reload({ waitUntil: "load" });
      await until(c.page, () => window.BMCompanion && window.BMCompanion.state().mounted, null, 10000);
      await wait(400);
      const d = await c.page.evaluate(() => {
        const f = document.querySelector("figure[data-companion]"), r = f.getBoundingClientRect();
        return { position: getComputedStyle(f).position, w: r.width, side: !!f.closest("aside"), inBody: f.parentNode === document.body, name: getComputedStyle(f.querySelector(".companion-name")).display };
      });
      eq([d.position, d.w, d.side, d.inBody, d.name], ["fixed", 64, false, true, "none"], tag + ": docked, 4rem, outside a sidebar");
      const clear = (when) => c.page.evaluate(() => {
        const f = document.querySelector("figure[data-companion]");
        if (!f || f.hasAttribute("data-hidden") || getComputedStyle(f).display === "none") return [];
        const bad = [];
        Array.from(document.querySelectorAll("[data-arena] input, [data-arena] button")).forEach((e) => {
          if (e.disabled || !e.getClientRects().length) return;
          e.scrollIntoView({ block: "nearest" });
          const a = f.querySelector(".companion-pic").getBoundingClientRect(), b = e.getBoundingClientRect();
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push((e.getAttribute("data-act") || e.id || e.tagName) + " " + JSON.stringify([a.left, a.top, b.left, b.top, b.right, b.bottom]));
        });
        return bad;
      });
      eq(await clear(), [], tag + ": clear of the lobby's inputs and buttons");
      await c.page.click('[data-arena] [data-act="start"]:not([disabled])');
      await c.page.waitForSelector(".arena-run");
      await until(c.page, () => window.BMCompanion.state().mood === "thinking", null, 3000);
      eq((await st(c.page)).mood, "thinking", tag + ": a start is thinking");
      eq(await clear(), [], tag + ": clear of the run's input and buttons");
      await c.page.evaluate(() => {
        const r = window.BMArena.state(), q = r.qs[r.i];
        document.getElementById("arena-answer").value = String(window.BMGen.make(q.g, q.s).answer).split("|")[0];
      });
      await c.page.click('.arena-run [data-act="check"]');
      check(await until(c.page, () => window.BMCompanion.state().mood === "happy", null, 3000), tag + ": a correct answer is happy");
      eq((await st(c.page)).line, "", tag + ": no caption for an answer");
      eq(await clear(), [], tag + ": clear after an answer");
      await c.page.evaluate(() => window.BMStore.emit({ type: "arena", phase: "end", result: {} }));
      check(await lineIs(c.page, "Run done.", 9000), tag + ": the end says Run done.");
      eq((await st(c.page)).key, "arena-end", tag + ": key");
      eq(c.requests.filter((u) => /\.glb(?:[?#]|$)|-color\.webp|-surface\.webp|\/bundle\/(?:three|three-model|form-model|mochi)\.js/.test(u)), [], tag + ": no GLB or model script requested");
      await c.page.evaluate(() => window.BMGame.setPref("companion", false));
      check(await until(c.page, () => !document.querySelector("figure[data-companion]"), null, 3000), tag + ": the preference off removes it");
      await done(c, tag);
    }
    /* 20 */
    cases++;
    {
      const c = await open(seeds());
      eq(await c.page.evaluate(() => window.BMCompanion.setMood("nope")), false, "setMood: an unknown name is false");
      eq(await c.page.evaluate(() => window.BMCompanion.setMood("sleeping")), true, "setMood: sleeping is accepted");
      const f = await c.page.evaluate(() => {
        const fg = document.querySelector("figure[data-companion]"), pic = fg.querySelector(".companion-pic");
        return { mood: fg.getAttribute("data-mood"), pos: fg.querySelector(".companion-still").style.backgroundPosition, size: fg.querySelector(".companion-still").style.backgroundSize, label: pic.getAttribute("aria-label"), moods: window.BMCompanion.moods(), info: window.BMCompanion.info() };
      });
      eq([f.mood, f.pos.replace(/(0)(px|%)$/, "$1"), f.size], ["sleeping", "100% 0", "900% 100%"], "setMood: data-mood and the last column");
      eq(f.label, "Mochi, your companion, sleeping", "setMood: the label");
      eq(f.moods.length, 9, "setMood: nine moods");
      eq([f.info.mode, f.info.mood, f.info.variant], ["2d", "sleeping", "pink"], "info: mode, mood, variant");
      await done(c, "setMood");
    }
    /* 21 */
    cases++;
    {
      const c = await open(seeds({ "bm.prefs.v1": '{"mochi":"lilac"}' }));
      check(/mochi-lilac-poses\.webp"?\)$/.test((await fig(c.page)).image), "lilac: the figure draws the lilac sheet");
      check(c.requests.some((u) => /\/models\/mochi\/mochi-lilac-poses\.webp(?:[?#]|$)/.test(u)), "lilac: the lilac sheet was requested");
      /* the pref itself is a later card: seed the key and send the change */
      await c.page.evaluate(() => { localStorage.setItem("bm.prefs.v1", '{"mochi":"pink"}'); window.BMStore.emit({ type: "prefs" }); });
      check(await until(c.page, () => /mochi-pink-poses/.test(document.querySelector(".companion-still").style.backgroundImage), null, 3000), "lilac: changing the pref redraws the sheet");
      await done(c, "lilac");
    }
    /* 22 */
    cases++;
    {
      const c = await open(seeds());
      await c.page.focus(E1 + " .ex-form input");
      await c.page.evaluate((sel) => {
        const ex = document.querySelector(sel);
        ex.querySelector(".ex-form input").value = (ex.getAttribute("data-answer") || "").split("|")[0];
      }, E1);
      await c.page.click(E1 + " .ex-form .btn:not(.ghost)");
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "surprised", null, 3000), "fast: surprised first");
      check(await until(c.page, () => document.querySelector("figure[data-companion]").getAttribute("data-mood") === "happy", null, 3000), "fast: then happy");
      eq((await st(c.page)).line, LINES.first, "fast: the first-try line");
      await done(c, "fast");
    }
    /* 23: the boss's events arrive in the task of the answer they follow (assets/encounter.js renders on the
       attempt); a heart lost still shows, where a hint opened in that task would not cut the answer's mood */
    cases++;
    {
      const c = await open(seeds());
      const moodIs = (m, ms) => until(c.page, (x) => document.querySelector("figure[data-companion]").getAttribute("data-mood") === x, m, ms);
      await c.page.evaluate(() => {
        window.BMStore.emit({ type: "attempt", correct: false, tryNo: 1, key: "e1", chapter: "ch01", hintLevel: 0, solutionOpen: false });
        window.BMStore.emit({ type: "encounter", chapter: "ch01", set: "s1", hp: 2, total: 3, hearts: 2, medal: 0, state: "active", cue: "heart", fresh: true });
      });
      check(await moodIs("angry", 1500), "boss: a heart lost in the answer's task shows angry");
      check(await moodIs("idle", 4000), "boss: and settles to idle after its 2 s");
      await c.page.evaluate(() => {
        window.BMStore.emit({ type: "attempt", correct: true, tryNo: 2, key: "e1", chapter: "ch01", hintLevel: 0, solutionOpen: false });
        window.BMStore.emit({ type: "opened" });
      });
      await wait(400);
      eq((await st(c.page)).mood, "happy", "boss: a hint opened in the answer's task leaves happy playing");
      await done(c, "boss");
    }
    /* 24: ?3d=off keeps the 2D still: no stage, no chunk, no GLB */
    cases++;
    {
      const c = await open(seeds());
      await wait(2000);
      eq((await c.page.evaluate(() => window.BMCompanion.info().mode)), "2d", "3d off: the mode is 2d");
      check(await c.page.evaluate(() => !document.querySelector("figure[data-companion]").hasAttribute("data-3d")), "3d off: no data-3d on the figure");
      eq(c.requests.filter((u) => /\/bundle\/mochi\.js(?:[?#]|$)|\/models\/mochi\/[^/]*\.glb(?:[?#]|$)/.test(u)), [], "3d off: no mochi chunk or GLB requested");
      await done(c, "3d off");
    }
    /* 25: the contents scroll inside the sidebar, the figure stays pinned under them */
    cases++;
    {
      const c = await open(seeds(), { path: "parts/5-packs/pk-words.html" });
      const probe = () => c.page.evaluate(() => {
        const f = document.querySelector("figure[data-companion]"), a = f.closest("aside[data-sidebar]"), b = a && a.querySelector(".sidebar-body");
        const r = f.getBoundingClientRect();
        return { inAside: !!a, top: r.top, bottom: r.bottom, h: innerHeight, bodyScrolls: !!b && b.scrollHeight > b.clientHeight, asideFits: !!a && a.scrollHeight <= a.clientHeight + 1 };
      });
      let p = await probe();
      console.log("pk-words figure rect at 1280x900: top " + Math.round(p.top) + ", bottom " + Math.round(p.bottom));
      check(p.inAside, "pinned: the figure is in the aside");
      check(p.top >= 0 && p.bottom <= p.h, "pinned: the figure is fully in view with nothing scrolled: " + JSON.stringify(p));
      check(p.bodyScrolls, "pinned: the contents list scrolls inside the sidebar");
      check(p.asideFits, "pinned: the aside itself does not overflow");
      await c.page.evaluate(() => window.scrollTo(0, 600));
      await wait(300);
      p = await probe();
      check(p.top >= 0 && p.bottom <= p.h, "pinned: still fully in view after scrolling the window 600 px: " + JSON.stringify(p));
      await done(c, "pinned");
    }
  } finally {
    try { await browser.close(); } catch (e) { console.error("browser close: " + e.message); }
    try { await server.close(); } catch (e) { console.error("server close: " + e.message); }
  }
}

run().then(() => {
  console.log((fails ? "FAILED" : "ok") + " companion: " + cases + " cases, " + passes + " checks passed" + (fails ? ", " + fails + " failed" : ""));
  process.exit(fails ? 1 : 0);
}, (e) => { console.error(e); process.exit(2); });
