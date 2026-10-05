"use strict";
/* The HUD and the settings sheet (tools/lib/shell.js writes their markup into every top
   bar; src/hud/ fills the HUD before first paint; src/ui/settings.ts runs the sheet):
     - no layout shift: on the contents page, a chapter, the Arena and the progress page,
       each theme and width, with a reader's XP, streak, combo and a boss fight under way,
       every box of the HUD (the bar, the group, each slot, the account chip, the sound and
       menu buttons) and what it says are the same before the bundle runs (readyState
       "interactive"), at DOMContentLoaded and after load, fonts and all;
     - the collapse: every kind of top bar with the widest HUD, from 320 to 1280 wide, is
       never wider than the window and keeps the menu button on screen at its right end,
       and at each width the HUD's lasting parts (level, streak, combo, account chip,
       Sound, menu) are in the same place on every kind of bar, so no page moves them;
     - the sheet opens and closes by mouse and by keyboard, beside the rail and not modal
       at 1280, as a modal sheet at 360 that keeps the focus inside it; Escape, the close
       button and the scrim close it and hand the focus back to the menu button;
     - each setting is kept across a reload and does what it says: Study mode takes the
       hearts and the combo away, Sound and the volume reach the sound's gain, Reduce motion
       stops every animation and smooth scrolling, Reduce transparency makes the glass and
       the scrim solid (and either switch shows on, fixed, while the device or Study mode
       already has it on), the
       reading panel, the theme, Graphics quality Low keeps the course map a list, the 3D
       map switch;
     - each switch is named by its words and described by its line;
     - axe-core finds nothing on the open sheet, each theme and width (a failure here);
     - a chapter cached from before the HUD script (the script taken out) still runs and
       still earns XP: the bundle installs window.BMHud itself.
   Storage is seeded once per context and the page loaded again from it, so a reload
   shows what the page itself kept (lib/browser.js newPage seeds before every load). */
const drive = require("../lib/drive");
const { track, VIEWPORTS } = require("../lib/browser");

const PAGES = ["index.html", "parts/2-geometry/05-distance-and-angles.html", "arena.html", "progress.html"];
const CHAPTER = PAGES[1];

function dayKey(d) {
  const two = (n) => (n < 10 ? "0" : "") + n;
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); }

/* a reader part of the way in: level 7, a three-day streak, three pips, and a miss in
   ch05's practice set, so its boss fight (and the HUD's hearts) is under way */
const READER = {
  "bm.activity.v1": { days: { [daysAgo(0)]: 18, [daysAgo(1)]: 140, [daysAgo(2)]: 160 } },
  "bm.run.v1": { combo: { pips: 3 }, seen: { level: 7, ach: 1 } },
  "bm.attempts.v1": { ch05: { e1: { tries: 1, section: "angles" } } },
  "bm.lesson.v1": { mode: "page" }
};

/* the widest HUD a reader can have: a 120-day streak, level 30-odd, a full combo with its
   shield, and ch05's boss fight under way, so the chapter's hearts are in the rail */
const LONG = {
  "bm.activity.v1": { days: Object.fromEntries(Array.from({ length: 120 }, (_, i) => [daysAgo(i), 60])) },
  "bm.run.v1": { combo: { pips: 5, shield: true }, seen: { level: 30, ach: 1 } },
  "bm.attempts.v1": { ch05: { e1: { tries: 1, section: "angles" } } },
  "bm.lesson.v1": { mode: "page" }
};
/* every kind of top bar (the usual links, the contents page's one, the about page's two,
   a chapter's hearts, the Arena's hearts and clock), and the widths the sweep sets: the
   phones, the tablets, the small laptops and either side of every step of the collapse */
const BARS = ["index.html", "parts/2-geometry/05-distance-and-angles.html", "arena.html", "progress.html", "about.html"];
const SWEEP = [320, 359, 360, 375, 390, 414, 420, 421, 440, 441, 480, 481, 520, 521, 600, 615, 616, 690, 691, 720, 768, 800, 801,
  834, 860, 861, 900, 940, 941, 1024, 1050, 1051, 1100, 1120, 1121, 1180, 1240, 1241, 1280];

/* every box of the HUD, and what it says; run in the page at three moments */
const MEASURE = function () {
  const out = {};
  const bar = document.querySelector(".topbar");
  if (!bar) return null;
  const list = [["topbar", bar], ["hud", bar.querySelector(".hud")]]
    .concat(Array.from(bar.querySelectorAll(".hud > *")).map(el => [el.className.split(" ")[0], el]))
    .concat([["acct", bar.querySelector(".acct")], ["sound", bar.querySelector(".hud-sound")], ["menu", bar.querySelector(".hud-menu")], ["xpbar", bar.querySelector(".hud-xpbar i")]]);
  list.forEach(([k, el]) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    out[k] = [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(" ");
  });
  const text = (s) => { const el = bar.querySelector(s); return el ? el.textContent : null; };
  out.says = [text(".hud-badge b"), text(".hud-xptext"), text(".hud-streak > b"), bar.querySelector(".hud-combo").hidden ? "no combo" : "combo"].join(" | ");
  return out;
};
const AT_EACH_MOMENT = "(" + function (measure) {
  const m = (0, eval)("(" + measure + ")");
  window.__hud = {};
  document.addEventListener("readystatechange", () => { if (document.readyState === "interactive") window.__hud.interactive = m(); });
  document.addEventListener("DOMContentLoaded", () => { window.__hud.dcl = m(); });
} + ")(" + JSON.stringify(MEASURE.toString()) + ")";

/* the alpha of a computed colour: rgba(), or color(srgb … / a) for a color-mix() result */
const ALPHA = (s) => {
  let m = /color\(srgb[^/)]*\/\s*([\d.]+)\s*\)/.exec(s);
  if (m) return +m[1];
  m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(s);
  return m ? +m[1] : 1;
};

module.exports = {
  name: "hud",
  order: 46,
  description: "the HUD and the settings sheet: no layout shift when the bundle loads (4 page kinds), the top bar fits from 320 to 1280 wide (5 kinds), the sheet by mouse and keyboard, modal focus trap, each setting kept and taking effect, axe on the open sheet",
  async run(ctx) {
    const { h, report, server } = ctx;

    /* a page in a context of its own, its storage seeded once and then loaded again */
    async function fresh(rel, seed, o) {
      o = o || {};
      const context = await h.newContext({ viewport: VIEWPORTS[o.vw || 1280], colorScheme: o.theme || "light", reducedMotion: o.reducedMotion || "no-preference", deviceScaleFactor: 1, serviceWorkers: "block" });
      if (o.init) await context.addInitScript(o.init);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = track(page, server.url);
      await page.goto(server.url + rel, { waitUntil: "load" });
      await page.evaluate((seed) => { localStorage.clear(); Object.keys(seed).forEach(k => localStorage.setItem(k, JSON.stringify(seed[k]))); }, seed || {});
      await page.reload({ waitUntil: "load" });
      await h.settle(page);
      return { context, page, errors, close: () => context.close() };
    }
    const reload = async (page) => { await page.reload({ waitUntil: "load" }); await h.settle(page); };
    const sheetOpen = (page) => page.evaluate(() => { const s = document.getElementById("hud-sheet"); return { open: s.open, modal: s.matches(":modal"), expanded: document.querySelector(".hud-menu").getAttribute("aria-expanded"), focusIn: s.contains(document.activeElement), onMenu: document.activeElement === document.querySelector(".hud-menu") }; });
    async function done(label, problems, errors, close, pass) {
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"](label, problems.length ? problems.join("\n") : pass);
    }

    /* ------------------------------------------------ no layout shift ---- */
    const pages = PAGES.filter(p => ctx.pages.includes(p));
    for (const rel of pages) {
      for (const theme of ctx.themes) {
        for (const vw of ctx.vws) {
          const label = rel + " [" + theme + ", " + vw + "] HUD does not move";
          const { page, errors, close } = await fresh(rel, Object.assign({ "bm.theme": theme }, READER), { theme, vw, init: AT_EACH_MOMENT });
          const problems = [];
          let pass;
          try {
            await page.waitForTimeout(300);
            const after = await page.evaluate(MEASURE);
            const at = await page.evaluate(() => window.__hud);
            if (!at || !at.interactive || !at.dcl) problems.push("the HUD was not measured before the bundle ran: " + JSON.stringify(at));
            else {
              Object.keys(after).forEach(k => {
                if (at.interactive[k] !== after[k] || at.dcl[k] !== after[k]) problems.push(k + ": before the bundle " + at.interactive[k] + ", at DOMContentLoaded " + at.dcl[k] + ", after load " + after[k]);
              });
              if (!/^7 \| 18 \/ 85 XP \| 3 \| combo$/.test(at.interactive.says)) problems.push("before the bundle the HUD says " + JSON.stringify(at.interactive.says) + ", not the reader's level 7, 18 of 85 XP, a 3-day streak and the combo: the HUD script did not fill it");
            }
            const hearts = await page.evaluate(() => { const el = document.querySelector(".hud > .hud-hearts"); return el ? !el.hidden : null; });
            pass = Object.keys(after).length + " boxes the same at three moments" + (hearts ? ", the boss's hearts filled into the place kept for them" : "");
            if (rel === CHAPTER && vw === 1280 && hearts !== true) problems.push("the chapter's boss fight is under way but the HUD shows no hearts");
            await h.screenshot(page, "hud/" + h.slug(rel) + "-" + theme + "-" + vw + "-bar", { fullPage: false, clip: { x: 0, y: 0, width: vw, height: 72 } });
          } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
          await done(label, problems, errors, close, pass);
        }
      }
    }

    /* ------------------------------------------ every width: it fits ---- */
    /* The collapse (game.css): at every width of SWEEP, with the widest HUD, the top bar
       is no wider than the window, nothing in it spills past its own edge, and the menu
       button, the way to every setting and link, is on screen, takes a click at its
       middle and sits at the right end of the bar (not mid-bar when the links are gone).
       One page per kind of top bar, resized, not reloaded: the media queries are all that
       changes. And at each width, the parts of the HUD a reader keeps an eye on (the level
       badge and XP, the streak, the combo, the account chip, Sound, the menu button) sit in
       the same place on every kind of bar that shows them, so going from page to page
       (the README's "Between pages") moves none of them: the hearts and the clock, which
       only some kinds have, are to their left (lib/shell.js hud()). */
    const HELD = [["the level badge and XP", ".hud-level"], ["the streak", ".hud-streak"], ["the combo", ".hud-combo"],
      ["the account chip", ".acct"], ["Sound", ".hud-sound"], ["the menu button", ".hud-menu"]];
    const held = {};
    for (const rel of BARS.filter(p => ctx.pages.includes(p))) {
      const label = rel + " [320 to 1280, " + SWEEP.length + " widths] the top bar fits, and the menu button is on screen at its right end";
      const { page, errors, close } = await fresh(rel, LONG);
      const problems = [];
      try {
        for (const vw of SWEEP) {
          await page.setViewportSize({ width: vw, height: 740 });
          const m = await page.evaluate(() => {
            const bar = document.querySelector(".topbar"), nav = bar.querySelector("nav"), menu = bar.querySelector(".hud-menu");
            const n = nav.getBoundingClientRect(), r = menu.getBoundingClientRect();
            const shown = Array.from(nav.children).filter(c => c.getClientRects().length).map(c => c.getBoundingClientRect());
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
              scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
              menu: [r.left, r.right].map(Math.round), navRight: Math.round(n.right),
              spill: Math.round(Math.max(n.left - Math.min(...shown.map(b => b.left)), Math.max(...shown.map(b => b.right)) - n.right)),
              hit: !!hit && menu.contains(hit)
            };
          });
          (held[vw] = held[vw] || {})[rel] = await page.evaluate((parts) => Object.fromEntries(parts.map(([k, sel]) => {
            const el = document.querySelector(".topbar " + sel);
            const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
            return [k, r ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(" ") : null];
          })), HELD);
          const what = [];
          if (m.scrollWidth > m.innerWidth) what.push("the page is " + m.scrollWidth + "px wide");
          if (m.menu[0] < 0 || m.menu[1] > m.innerWidth || !m.hit) what.push("the menu button at " + m.menu.join("-") + " is not on screen to click" + (m.hit ? "" : " (a click there lands elsewhere)"));
          if (m.spill > 0) what.push("the bar's items spill " + m.spill + "px past its edge");
          if (Math.abs(m.menu[1] - m.navRight) > 1) what.push("the menu button ends at " + m.menu[1] + ", not at the bar's right end " + m.navRight);
          if (what.length) problems.push(vw + "px: " + what.join("; "));
        }
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(label, problems, errors, close, "no overflow at any width, the menu button on screen and at the right end");
    }
    {
      const bars = BARS.filter(p => ctx.pages.includes(p));
      const problems = [];
      if (bars.length > 1) {
        for (const vw of SWEEP) {
          for (const [k] of HELD) {
            const at = {};
            for (const rel of bars) { const v = held[vw] && held[vw][rel] && held[vw][rel][k]; if (v) (at[v] = at[v] || []).push(rel.split("/").pop()); }
            if (Object.keys(at).length > 1) problems.push(vw + "px: " + k + " is at " + Object.entries(at).map(([v, on]) => v + " on " + on.join(", ")).join("; "));
          }
        }
        report[problems.length ? "fail" : "pass"]("every kind of top bar [320 to 1280, " + SWEEP.length + " widths] the HUD holds still from page to page",
          problems.length ? problems.join("\n") : "at every width the level badge and XP, the streak, the combo, the account chip, Sound and the menu button are in the same place on " + bars.join(", ") + " wherever they show");
      }
    }

    /* ------------------------------------------- the sheet: mouse, keys -- */
    for (const vw of ctx.vws) {
      const label = CHAPTER + " [" + vw + "] the sheet by mouse and keyboard";
      const { page, errors, close } = await fresh(CHAPTER, READER, { vw });
      const problems = [];
      const want = (s, open, what) => {
        if (s.open !== open || s.expanded !== String(open) || (open && s.modal !== (vw <= 480))) problems.push(what + ": " + JSON.stringify(s));
      };
      try {
        await page.click(".hud-menu");
        let s = await sheetOpen(page);
        want(s, true, "a click on the menu button opens the sheet, " + (vw <= 480 ? "modal" : "not modal"));
        if (!s.focusIn) problems.push("opened, the sheet does not take the focus");
        await page.click("#hud-sheet [data-sheet-close]");
        s = await sheetOpen(page);
        want(s, false, "the close button closes it");
        if (!s.onMenu) problems.push("after the close button the focus is not on the menu button");

        /* closed and opened again in one task: the dialog's late `close` event must not
           shut the reopened sheet's state or take its focus */
        await page.click(".hud-menu");
        await page.evaluate(() => { document.querySelector("#hud-sheet [data-sheet-close]").click(); document.querySelector(".hud-menu").click(); });
        await page.waitForTimeout(150);
        s = await sheetOpen(page);
        want(s, true, "closed and opened again at once, the sheet stays open");
        if (!s.focusIn) problems.push("closed and opened again at once, the focus left the sheet");
        await page.click("#hud-sheet [data-sheet-close]");

        await page.focus(".hud-menu");
        await page.keyboard.press("Enter");
        s = await sheetOpen(page);
        want(s, true, "Enter on the menu button opens it");
        if (!s.focusIn) problems.push("opened by keyboard, the focus is not in the sheet");
        if (vw <= 480) {
          const ins = [];
          for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); ins.push((await sheetOpen(page)).focusIn); }
          for (let i = 0; i < 8; i++) { await page.keyboard.press("Shift+Tab"); ins.push((await sheetOpen(page)).focusIn); }
          if (ins.some(x => !x)) problems.push("the focus left the modal sheet on Tab or Shift+Tab " + ins.filter(x => !x).length + " times of " + ins.length);
        }
        await page.keyboard.press("Escape");
        s = await sheetOpen(page);
        want(s, false, "Escape closes it");
        if (!s.onMenu) problems.push("after Escape the focus is not on the menu button");

        await page.click(".hud-menu");
        if (vw <= 480) await page.mouse.click(vw / 2, 12);
        else await page.click("main h1");
        s = await sheetOpen(page);
        want(s, false, vw <= 480 ? "a click on the scrim closes it" : "a click on the page closes it");
        if (vw > 480) {
          await page.click(".hud-menu");
          await page.click(".hud-menu");
          want(await sheetOpen(page), false, "a second click on the menu button closes it");
        }
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(label, problems, errors, close, (vw <= 480 ? "modal, focus kept inside over 38 Tabs; " : "beside the rail; ") + "opened by click and Enter, closed by the close button, Escape and a click outside, focus back on the menu button");
    }

    /* ----------------------------------------- axe on the open sheet ---- */
    for (const theme of ctx.themes) {
      for (const vw of ctx.vws) {
        const label = CHAPTER + " [" + theme + ", " + vw + "] axe on the open sheet";
        if (!ctx.axeSource) { report.skip(label, "axe-core not resolvable"); continue; }
        const { page, errors, close } = await fresh(CHAPTER, Object.assign({ "bm.theme": theme }, READER), { theme, vw });
        const problems = [];
        try {
          await page.click(".hud-menu");
          await page.waitForTimeout(300);
          await page.addScriptTag({ content: ctx.axeSource });
          const bad = await page.evaluate(async () => {
            const r = await window.axe.run({ include: [["#hud-sheet"]] }, { resultTypes: ["violations"] });
            return r.violations.map(v => v.id + " (" + v.nodes.length + "): " + v.help + " — " + v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" , "));
          });
          problems.push(...bad.map(b => "axe: " + b));
          await h.screenshot(page, "hud/sheet-" + theme + "-" + vw, { fullPage: false });
        } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
        await done(label, problems, errors, close, "no violations");
      }
    }

    /* ------------------------------------- each setting, kept and in effect -- */
    const set = async (page, sel) => {
      if (!(await page.evaluate(() => document.getElementById("hud-sheet").open))) await page.click(".hud-menu");
      await page.click("#hud-sheet " + sel);
      await page.keyboard.press("Escape");
    };
    const prefs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bm.prefs.v1") || "{}"));
    const inSheet = (page, sel) => page.evaluate((sel) => { const el = document.querySelector("#hud-sheet " + sel); return el && { checked: el.checked, disabled: el.disabled, value: el.value }; }, sel);
    const running = (page) => page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.transitionProperty === undefined).map(a => a.animationName || "?"));
    async function answerOne(page, nth) {
      const exs = page.locator("#practice .ex");
      let seen = 0;
      for (let i = 0; i < await exs.count(); i++) {
        const m = await drive.info(exs.nth(i));
        if (m.inline || m.kind !== "text" || m.state === "correct") continue;
        if (seen++ < nth) continue;
        await drive.answerWithKey(exs.nth(i), m);
        await page.waitForTimeout(60);
        return m.key;
      }
      return null;
    }
    const settings = [
      ["Study mode", async (page, problems) => {
        const before = await page.evaluate(() => ({ combo: getComputedStyle(document.querySelector(".hud-combo")).display, hearts: getComputedStyle(document.querySelector(".hud > .hud-hearts")).display, set: !!document.querySelector("#practice .encounter-hearts") }));
        if (before.combo === "none" || before.hearts === "none" || !before.set) problems.push("before Study mode the combo and the hearts were not on show, so this proves nothing: " + JSON.stringify(before));
        await set(page, '[data-pref="calm"]');
        await reload(page);
        const after = await page.evaluate(() => ({
          calm: document.documentElement.getAttribute("data-calm"), sound: document.documentElement.getAttribute("data-sound"),
          combo: getComputedStyle(document.querySelector(".hud-combo")).display, hearts: getComputedStyle(document.querySelector(".hud > .hud-hearts")).display,
          set: !!document.querySelector("#practice .encounter-hearts"), clue: !!document.querySelector("#practice .ex[data-hint]")
        }));
        if (!(after.calm === "true" && after.combo === "none" && after.hearts === "none" && !after.set && after.sound === "off")) problems.push("after a reload Study mode is not on, or the hearts and the combo still show: " + JSON.stringify(after));
        if ((await prefs(page)).calm !== true || !(await inSheet(page, '[data-pref="calm"]')).checked) problems.push("Study mode is not kept, or the sheet does not show it on");
      }],
      ["Sound and volume", async (page, problems) => {
        await set(page, '[data-pref="sound"]');
        await reload(page);
        const on = await page.evaluate(() => [document.documentElement.getAttribute("data-sound"), document.querySelector(".hud-sound").getAttribute("aria-pressed")]);
        if (on.join() !== "on,true") problems.push("after a reload sound is not on: " + JSON.stringify(on));
        await page.click(".hud-menu");
        await page.focus('#hud-sheet [data-pref="volume"]');
        await page.keyboard.press("End");
        const loud = await page.evaluate(() => window.BMSfx.gain());
        for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowLeft");
        const quiet = await page.evaluate(() => [window.BMSfx.gain(), JSON.parse(localStorage.getItem("bm.prefs.v1")).volume]);
        if (!(loud > 0.99 && Math.abs(quiet[0] - 0.3) < 1e-6 && quiet[1] === 30)) problems.push("the volume did not reach the sound's gain: at the top " + loud + ", fourteen steps down " + JSON.stringify(quiet));
        await reload(page);
        await page.click(".hud-menu");
        const kept = await inSheet(page, '[data-pref="volume"]');
        await page.keyboard.press("Escape");
        const gain = await page.evaluate(() => window.BMSfx.gain());
        if (!(kept.value === "30" && !kept.disabled && Math.abs(gain - 0.3) < 1e-6)) problems.push("after a reload the volume is not 30, or the gain made on the next key is not 0.3: " + JSON.stringify({ kept, gain }));
      }],
      ["Reduce motion", async (page, problems) => {
        await answerOne(page, 0);
        const moving = await running(page);
        if (!moving.length) problems.push("a right answer started no animation before Reduce motion, so this proves nothing");
        const scrollBefore = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
        if (scrollBefore !== "smooth") problems.push("the page did not scroll smoothly before Reduce motion (" + scrollBefore + "), so this proves nothing");
        await set(page, '[data-pref="motion"]');
        await reload(page);
        await page.waitForTimeout(400);
        const stamp = await page.evaluate(() => [document.documentElement.getAttribute("data-motion"), window.BMFx.still()]);
        const scrollAfter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
        if (scrollAfter !== "auto") problems.push("with Reduce motion the page still scrolls smoothly to an anchor: html's scroll-behavior is " + scrollAfter);
        const key = await answerOne(page, 0);
        const still = await running(page);
        if (stamp.join() !== "reduce,true") problems.push("after a reload html[data-motion] is " + JSON.stringify(stamp[0]) + " and BMFx.still() " + stamp[1]);
        if (!key || still.length) problems.push("with Reduce motion a right answer still animates: " + JSON.stringify(still) + " (answered " + key + ")");
        if (!(await inSheet(page, '[data-pref="motion"]')).checked) problems.push("the sheet does not show Reduce motion on");
      }],
      ["Reduce transparency", async (page, problems) => {
        const look = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector(".topbar")); return { bg: cs.backgroundColor, blur: cs.backdropFilter }; });
        const before = await look();
        if (!(ALPHA(before.bg) < 1)) problems.push("the top bar was solid before Reduce transparency, so this proves nothing: " + before.bg);
        await set(page, '[data-pref="transparency"]');
        await reload(page);
        const after = await look();
        const stamp = await page.evaluate(() => document.documentElement.getAttribute("data-transparency"));
        if (stamp !== "reduce" || ALPHA(after.bg) < 1 || (after.blur && after.blur !== "none")) problems.push("after a reload the top bar is still see-through: " + JSON.stringify({ stamp, after }));
        if (!(await inSheet(page, '[data-pref="transparency"]')).checked) problems.push("the sheet does not show Reduce transparency on");
      }],
      ["Reading panel", async (page, problems) => {
        await set(page, 'input[data-pref="panel"][value="dark"]');
        await reload(page);
        if (await page.evaluate(() => document.documentElement.getAttribute("data-panel")) !== "dark" || !(await inSheet(page, 'input[data-pref="panel"][value="dark"]')).checked) problems.push("the dark reading panel is not kept");
      }],
      ["Theme", async (page, problems) => {
        await set(page, 'input[data-pref="theme"][value="dark"]');
        await reload(page);
        const dark = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), localStorage.getItem("bm.theme")]);
        await set(page, 'input[data-pref="theme"][value="system"]');
        await reload(page);
        const system = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), localStorage.getItem("bm.theme"), document.querySelector('#hud-sheet input[data-pref="theme"]:checked').value]);
        if (dark.join() !== 'dark,"dark"' || system.join() !== "light,,system") problems.push("the theme choice is not kept: Dark " + JSON.stringify(dark) + ", Match system (a light device) " + JSON.stringify(system));
      }]
    ];
    for (const [what, fn] of settings) {
      const label = CHAPTER + " [" + what + "] kept across a reload and in effect";
      const { page, errors, close } = await fresh(CHAPTER, READER);
      const problems = [];
      try { await fn(page, problems); } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(label, problems, errors, close);
    }

    /* Each switch is named by its words alone and described by its line, so a screen
       reader says "Study mode, switch, off" and then the line, not the line as the name */
    {
      const { page, errors, close } = await fresh(CHAPTER, READER);
      const problems = [];
      try {
        await page.click(".hud-menu");
        const want = { calm: "Study mode", sound: "Sound", motion: "Reduce motion", transparency: "Reduce transparency", map3d: "3D course map" };
        for (const [pref, name] of Object.entries(want)) {
          const n = await page.getByRole("switch", { name, exact: true }).count();
          const d = await page.evaluate((pref) => {
            const el = document.querySelector('#hud-sheet input[data-pref="' + pref + '"]');
            return (el.getAttribute("aria-describedby") || "").split(/\s+/).map(id => { const t = document.getElementById(id); return t ? t.textContent : "(no #" + id + ")"; }).join(" ");
          }, pref);
          const small = await page.evaluate((pref) => document.querySelector('#hud-sheet input[data-pref="' + pref + '"]').closest("label").querySelector("small").textContent, pref);
          if (n !== 1) problems.push("no one switch is named exactly " + JSON.stringify(name) + " (" + n + ")");
          if (d !== small) problems.push("the " + name + " switch is described by " + JSON.stringify(d) + ", not its line " + JSON.stringify(small));
        }
        const snap = await page.locator("#hud-sheet").ariaSnapshot();
        if (/switch "[^"]*\.[^"]*"/.test(snap)) problems.push("a switch's name still holds its whole line: " + snap.split("\n").filter(l => /switch "/.test(l)).join(" | "));
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(CHAPTER + " [the sheet's switches] named by their words, described by their line", problems, errors, close);
    }

    /* What the device asks for, and Study mode, are in effect whatever the switch says, so
       the switch says so: Reduce motion and Reduce transparency show on and cannot be
       turned off, as Sound in Study mode */
    for (const [what, o, seed, motion, transparency] of [
      ["the device asks for less motion", { reducedMotion: "reduce" }, READER, true, false],
      ["Study mode", {}, Object.assign({}, READER, { "bm.prefs.v1": { calm: true } }), true, false],
      ["the device asks for less transparency", { transparency: true }, READER, false, true],
      ["nothing asks", {}, READER, false, false]
    ]) {
      const label = CHAPTER + " [" + what + "] the Reduce motion and Reduce transparency switches say what is in effect";
      const { context, page, errors, close } = await fresh(CHAPTER, seed, o);
      const problems = [];
      try {
        /* Playwright has no option for this media feature; Chromium's own emulation does
           it, for the page's CSS and its matchMedia alike */
        if (o.transparency) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
          await reload(page);
          if (!(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches))) problems.push("the emulation of prefers-reduced-transparency did not take, so this proves nothing");
        }
        await page.click(".hud-menu");
        const got = await page.evaluate(() => ["motion", "transparency"].map(p => { const el = document.querySelector('#hud-sheet input[data-pref="' + p + '"]'); return { checked: el.checked, aria: el.getAttribute("aria-checked"), disabled: el.disabled }; }).concat([window.BMFx.still()]));
        const want = (on) => ({ checked: on, aria: String(on), disabled: on });
        if (JSON.stringify(got.slice(0, 2)) !== JSON.stringify([want(motion), want(transparency)])) problems.push("Reduce motion, Reduce transparency: " + JSON.stringify(got.slice(0, 2)) + ", not " + JSON.stringify([want(motion), want(transparency)]));
        if (got[2] !== motion) problems.push("BMFx.still() is " + got[2] + " where motion is " + (motion ? "" : "not ") + "reduced");
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(label, problems, errors, close, (motion || transparency ? "on and fixed" : "off and free") + ", as is in effect");
    }

    /* at 360 the modal sheet's scrim goes solid too */
    {
      const { page, errors, close } = await fresh(CHAPTER, Object.assign({ "bm.prefs.v1": { transparency: "reduce" } }, READER), { vw: 360 });
      const problems = [];
      try {
        await page.click(".hud-menu");
        const scrim = await page.evaluate(() => getComputedStyle(document.getElementById("hud-sheet"), "::backdrop").backgroundColor);
        if (ALPHA(scrim) < 1) problems.push("with Reduce transparency the sheet's scrim is see-through: " + scrim);
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(CHAPTER + " [360, Reduce transparency] the scrim is solid", problems, errors, close);
    }

    /* A chapter as a browser may have cached it from before the HUD script: the same page
       with that script taken out. The bundle installs window.BMHud itself
       (src/hud/install.js), so nothing throws and a right answer still earns its XP. */
    {
      const { context, page, errors, close } = await fresh(CHAPTER, READER);
      const problems = [];
      try {
        await context.route(u => (typeof u === "string" ? u : u.href).split("#")[0] === server.url + CHAPTER, async (route) => {
          const res = await route.fetch();
          const body = (await res.text()).replace(/(<\/header>)\n<script>[\s\S]*?<\/script>/, "$1");
          await route.fulfill({ response: res, body });
        });
        await reload(page);
        const had = await page.evaluate(() => [document.querySelectorAll("body > script").length, !!window.BMHud, !!window.BMGame]);
        const xp0 = await page.evaluate(() => window.BMActivity.total());
        const key = await answerOne(page, 0);
        await page.waitForTimeout(300);
        const xp1 = await page.evaluate(() => window.BMActivity.total());
        if (had.join() !== "0,true,true") problems.push("without the HUD script: body scripts, BMHud, BMGame = " + JSON.stringify(had));
        if (!key || !(xp1 > xp0)) problems.push("without the HUD script a right answer (" + key + ") did not earn XP: " + xp0 + " then " + xp1);
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done(CHAPTER + " [cached from before the HUD script] the bundle installs BMHud, and XP is still earned", problems, errors, close);
    }

    /* the course map: Graphics quality Low keeps the list; the 3D map switch is kept */
    if (ctx.pages.includes("index.html")) {
      const { page, errors, close } = await fresh("index.html", {});
      const problems = [];
      try {
        await set(page, '[data-pref="map3d"]');
        await reload(page);
        const off = [(await prefs(page)).map, await page.evaluate(() => window.BMMap3D.why())];
        await set(page, '[data-pref="map3d"]');
        await reload(page);
        if (off.join() !== "list,list" || (await prefs(page)).map !== "3d") problems.push("the 3D map switch is not kept: off " + JSON.stringify(off) + ", on again " + JSON.stringify((await prefs(page)).map));
        await set(page, 'input[data-pref="gfx"][value="low"]');
        await reload(page);
        const low = await page.evaluate(() => [JSON.parse(localStorage.getItem("bm.prefs.v1")).gfx, window.BMMap3D.on(), window.BMMap3D.why(), document.querySelector("[data-map3d]") ? document.querySelector("[data-map3d]").hidden : null]);
        const sw = await inSheet(page, '[data-pref="map3d"]');
        if (low.slice(0, 3).join() !== "low,false,gfx-low" || low[3] === false || sw.checked || !sw.disabled) problems.push("Graphics quality Low does not keep the list: " + JSON.stringify({ low, map3dSwitch: sw }));
        if (!(await inSheet(page, 'input[data-pref="gfx"][value="low"]')).checked) problems.push("the sheet does not show Low chosen");
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      await done("index.html [Graphics quality, 3D map] kept across a reload and in effect", problems, errors, close);
    }
  }
};
