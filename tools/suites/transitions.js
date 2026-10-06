"use strict";
/* Between pages: cross-document view transitions (the opt-in tools/lib/shell.js writes
   inline into every <head>, the rest in assets/game.css "Between pages", the skips in
   src/boot.js). Chromium has them, so here:
     - transitions on: from the contents page to a chapter, the Arena, the progress page,
       the about page and back to the contents page (every kind of page), at each width,
       each navigation runs a view transition: the page left and the page arriving both
       had one, it became ready, the old page faded out in --dur-state and the new one in
       --dur-reveal (their computed durations, so the tokens reached the pseudo-elements),
       laid over each other with plain alpha; nothing animates the top bar's pseudo-
       elements, and its group sits exactly where the top bar is on the page arriving;
       the HUD keeps its position: every part of it that both pages show (the level badge
       and XP, the streak, the combo, the account chip, Sound, the menu button) is where it
       was on the page left, with a reader whose combo shows on a chapter only (its shield).
       The top bar is the one element named. The transition's own length is bounded: it
       starts within three frames of the page showing, each of its animations runs at
       most 250ms from its start to its end (delay, iterations and end delay counted, at
       its playback rate), and it is over in the first or second frame after they end
       (see TIMING). While it runs a click on the HUD is lost (captured elements are not
       hit-tested): that 250ms is the window, and the menu button takes a click again once
       it is over. And one hop from half-way down a chapter, and one by a link in the open
       settings sheet: where
       the sheet is not modal it fades out with the page (its own name while it is open),
       and where it is (a narrow screen, the top layer) it is in the root's fade;
     - skipped: with Study mode, with Reduce motion (the settings), with reduced motion
       on the device (never opted in: the page left had no transition to skip), with
       Study mode switched on on the page left after it loaded (pageswap skips it), and
       with Study mode stored for the page arriving only (pagereveal skips it);
     - a slow page: the arriving page's stylesheets held back past the browser's timeout
       (four seconds in Chrome): no transition, the page still arrives, and no error;
     - back and forward, on the full Chromium with its back/forward cache on (Playwright
       turns it off): each restores the page left, and the transition runs, or is skipped
       in Study mode;
     - and on every page, no console error, no uncaught exception, no same-origin 404.
   Each navigation is started by the page (location.assign, as a link's is): one typed
   into the address bar or a reload never has a transition. */
const browserLib = require("../lib/browser");
const gl = require("../lib/gl");

const PAGES = ["index.html", "parts/2-geometry/05-distance-and-angles.html", "arena.html", "progress.html", "about.html", "index.html"];
const CHAPTER = PAGES[1];
const SWAP_KEY = "bm-test-swap";

/* in every document of the context, before the page's own scripts (so these listeners
   run before the boot script's, and see a transition it is about to skip). A page
   restored from the back/forward cache runs no script again: its listeners are the ones
   it had, so each reveal starts its record afresh (`reveals` counts them) and reads what
   the page left wrote at pageswap then, not when the document started. */
const WATCH = ({ key, parts }) => {
  if (window.top !== window) return;
  const doc = Math.random();
  let vt = window.__vt = { doc, swap: null, reveal: null, done: false, reveals: 0, persisted: null };
  let persisted = null;
  addEventListener("pageshow", (e) => { persisted = e.persisted; });
  addEventListener("pageswap", (e) => {
    const sheet = document.querySelector("#hud-sheet");
    const s = sheet && sheet.open ? { modal: sheet.matches(":modal"), name: getComputedStyle(sheet).viewTransitionName } : null;
    try { sessionStorage.setItem(key, JSON.stringify({ vt: !!e.viewTransition, sheet: s })); } catch (x) { /* no storage */ }
  });
  /* each part of the HUD as [x y width height], or "hidden" */
  const where = () => Object.fromEntries(parts.map(([k, sel]) => {
    const el = document.querySelector(sel);
    const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
    return [k, r ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(" ") : "hidden"];
  }));
  /* where a click at the middle of the menu button would land: the button (or inside
     it), or what is hit instead */
  const hit = () => {
    const b = document.querySelector(".topbar .hud-menu");
    if (!b) return "no menu button";
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el && b.contains(el) ? "the menu button" : el ? el.tagName.toLowerCase() : "nothing";
  };
  addEventListener("pagereveal", (e) => {
    const t0 = performance.now();
    vt = window.__vt = { doc, swap: null, reveal: { vt: !!e.viewTransition }, done: false, reveals: vt.reveals + 1, persisted };
    try { vt.swap = JSON.parse(sessionStorage.getItem(key)); sessionStorage.removeItem(key); } catch (x) { /* no storage */ }
    const mine = vt;
    if (!e.viewTransition) { mine.done = true; return; }
    /* TIMING. Three bounds, none of them on the milliseconds from reveal to finish: those
       also hold the page arriving doing its own work. Its module scripts run after the
       first frame, while the animations play, and `finished` is settled on the main
       thread: on a CI runner a
       chapter's transition finished 1009ms after the reveal, and here, held to four
       threads and one and a half CPUs, the contents page's scripts kept the thread 1.1s
       after its first frame, its animations ended at 317ms and it finished at 1139ms, in
       the first frame the page drew after that. Without a transition those scripts take
       as long.
       What the transition itself holds is
         - its start: frames before `ready`, at most three;
         - its animations: each one's length on the document timeline, its computed end
           time (delay + iterations x duration + end delay) over its playback rate, at
           most 250ms. That is a property of the animation, not of the machine, so it is
           a bound in milliseconds that a delay or an extra iteration cannot slip past
           (the duration alone would let them);
         - its end: frames drawn once the latest of its animations is over (its start
           time plus its length, read once all have started), at most two. Frames are not
           drawn while the page's own work holds the thread, so a count of them is the
           transition's and nothing else; an animation added after `ready`, which the
           list above does not hold, shows here as frames it keeps the transition for.
       So the transition is held to three frames, 250ms and two frames, on any machine.
       The milliseconds are reported, with the share the page's own work took: from the
       end of the animations to the finish, a wait in which the page drew no more than
       those two frames. */
    const frames = [];
    let anims = null, live = true;
    /* an animation's length on the document timeline: its end time at its playback rate */
    const span = (a) => a.effect.getComputedTiming().endTime / Math.abs(a.playbackRate || 1);
    const tick = (t) => {
      if (!live) return;
      frames.push(t);
      if (anims && anims.length && mine.end == null && anims.every(a => a.startTime !== null)) mine.end = Math.max(...anims.map(a => a.startTime + span(a)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    e.viewTransition.ready.then(() => {
      const vt = mine;
      anims = document.getAnimations().filter(a => a.effect && a.effect.pseudoElement);
      vt.readyFrames = frames.length;
      vt.ran = true;
      vt.hitReady = hit();
      vt.anims = anims.map(a => ({ on: a.effect.pseudoElement, name: a.animationName, ms: a.effect.getComputedTiming().duration, span: Math.round(span(a)) }));
      const css = (p) => { const s = getComputedStyle(document.documentElement, p); return { w: s.width, h: s.height, t: s.transform, ease: s.animationTimingFunction, blend: s.mixBlendMode, opacity: s.opacity }; };
      vt.hud = css("::view-transition-group(hud)");
      vt.sheetGroup = css("::view-transition-group(hud-sheet)");
      vt.oldHud = css("::view-transition-old(hud)");
      vt.oldRoot = css("::view-transition-old(root)");
      vt.newRoot = css("::view-transition-new(root)");
      const root = getComputedStyle(document.documentElement);
      vt.tokens = { in: root.getPropertyValue("--ease-in").trim(), out: root.getPropertyValue("--ease-out").trim() };
      const r = document.querySelector(".topbar").getBoundingClientRect();
      vt.bar = [r.x, r.y, r.width, r.height];
      vt.parts = where();
      vt.rootName = getComputedStyle(document.documentElement).viewTransitionName;
      vt.named = Array.from(document.body.querySelectorAll("*")).filter(el => getComputedStyle(el).viewTransitionName !== "none")
        .map(el => el.tagName.toLowerCase() + (el.classList.length ? "." + el.classList[0] : ""));
    }, (err) => { mine.ran = false; mine.skipped = err && err.name; });
    e.viewTransition.finished.then(() => {
      live = false;
      mine.ms = Math.round(performance.now() - t0);
      if (mine.end != null) {
        const after = frames.filter(t => t >= mine.end);
        mine.afterFrames = after.length;
        mine.endMs = Math.round(mine.end - t0);
        mine.heldByPage = mine.ms - mine.endMs;
      }
      mine.hitDone = hit();
      mine.done = true;
    });
  });
};

const BAR = () => { const r = document.querySelector(".topbar").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
/* the HUD, part by part: what a reader sees stay put or jump when the page changes */
const HUD_PARTS = [["the level badge and XP", ".topbar .hud-level"], ["the streak", ".topbar .hud-streak"], ["the combo", ".topbar .hud-combo"],
  ["the account chip", ".topbar .acct"], ["Sound", ".topbar .hud-sound"], ["the menu button", ".topbar .hud-menu"]];
const PARTS = (parts) => Object.fromEntries(parts.map(([k, sel]) => {
  const el = document.querySelector(sel);
  const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
  return [k, r ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10).join(" ") : "hidden"];
}));
/* the parts both pages show that are not where they were: [] when the HUD held still */
const moved = (before, after) => Object.keys(before).filter(k => before[k] !== "hidden" && after && after[k] !== "hidden" && before[k] !== after[k])
  .map(k => k + " " + before[k] + " -> " + after[k]);
/* a reader whose combo shows on a chapter and nowhere else (a shield and no pips: the HUD
   shows a shield where a boss can take it), so the HUD has a part a chapter adds */
const SHIELD = { "bm.run.v1": { combo: { pips: 0, shield: true }, seen: { level: 1, ach: 0 } } };
/* a timing function as numbers, however it is spelt: "cubic-bezier(.5, 0, .9, .4)" */
const curve = (s) => (String(s).match(/-?[\d.]+/g) || []).map(Number).join(",");
const px = (s) => Math.round(parseFloat(s) * 10) / 10;
const round = (a) => a.map(v => Math.round(v * 10) / 10);
/* matrix(1, 0, 0, 1, x, y) -> [x, y]; "none" -> [0, 0] */
const shift = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ""); if (!m) return t === "none" ? [0, 0] : null; const v = m[1].split(",").map(Number); return v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1 ? [v[4], v[5]].map(x => Math.round(x * 10) / 10) : null; };

module.exports = {
  name: "transitions",
  order: 47,
  description: "between pages: a cross-document view transition runs from page kind to page kind with the HUD held still (each width), and is skipped in Study mode, with Reduce motion, with reduced motion on the device, from either side, going back and forward too; a slow page is not held, and a click lost to a transition is held to a quarter of a second",
  async run(ctx) {
    const { h, report, server } = ctx;
    const pages = PAGES.filter(p => ctx.pages.includes(p));
    if (pages.length < 2) { report.skip("transitions", "needs two of " + PAGES.join(", ") + "; --only left " + pages.length); return; }
    const theme = ctx.themes[0];

    /* a context with the watch in every document, on the first page */
    async function start(o, helpers) {
      const hh = helpers || h;
      const s = await hh.newPage({ theme, vw: o.vw || 1280, reducedMotion: o.reducedMotion, storage: o.storage });
      await s.context.addInitScript(WATCH, { key: SWAP_KEY, parts: HUD_PARTS });
      if (o.prep) await o.prep(s.context);
      await hh.open(s.page, o.from || pages[0]);
      return s;
    }
    /* leave for `rel` as a link does, and wait for the page to arrive and its transition,
       if it has one, to finish; returns what the watch saw and the top bar left behind */
    async function go(page, rel, before, click) {
      const left = await page.evaluate(BAR);
      const hud = await page.evaluate(PARTS, HUD_PARTS);
      if (before) await before(page);
      if (click) await page.click(click);
      else await page.evaluate((url) => { location.assign(url); }, server.url + rel);
      await page.waitForURL(server.url + rel, { timeout: 20000 });
      await page.waitForLoadState("load", { timeout: 20000 });
      await page.waitForFunction(() => window.__vt && window.__vt.done, null, { timeout: 10000 });
      const seen = await page.evaluate(() => window.__vt);
      await h.settle(page);
      return { left: round(left), hud, seen };
    }
    const hop = (a, b) => a + " -> " + b;

    /* ---------------------------------------------- transitions on ----- */
    for (const vw of ctx.vws) {
      const { page, errors, close } = await start({ vw, storage: SHIELD });
      const problems = [], ms = [], deadHits = new Set(), combo = new Set(), sheetNote = [], held = [], spans = new Set();
      try {
        for (let i = 1; i < pages.length; i++) {
          const { left, hud, seen } = await go(page, pages[i]);
          const where = hop(pages[i - 1], pages[i]) + ": ";
          const bad = (m) => problems.push(where + m);
          if (!seen.swap || !seen.swap.vt) bad("the page left had no view transition at pageswap: " + JSON.stringify(seen.swap));
          if (!seen.reveal || !seen.reveal.vt) { bad("the page arriving had no view transition at pagereveal"); continue; }
          if (!seen.ran) { bad("the view transition did not run (" + (seen.skipped || "never ready") + ")"); continue; }
          const anim = (on) => (seen.anims || []).filter(a => a.on === on);
          const oldRoot = anim("::view-transition-old(root)"), newRoot = anim("::view-transition-new(root)");
          if (oldRoot.length !== 1 || oldRoot[0].name !== "fade-out" || oldRoot[0].ms !== 160) bad("the old page's fade is " + JSON.stringify(oldRoot) + ", not fade-out over --dur-state (160ms)");
          if (newRoot.length !== 1 || newRoot[0].name !== "fade" || newRoot[0].ms !== 240) bad("the new page's fade is " + JSON.stringify(newRoot) + ", not fade over --dur-reveal (240ms)");
          if (curve(seen.oldRoot.ease) !== curve(seen.tokens.in)) bad("the old page fades with " + seen.oldRoot.ease + ", not --ease-in " + seen.tokens.in);
          if (curve(seen.newRoot.ease) !== curve(seen.tokens.out)) bad("the new page fades with " + seen.newRoot.ease + ", not --ease-out " + seen.tokens.out);
          if (seen.oldRoot.blend !== "normal" || seen.newRoot.blend !== "normal") bad("the two pages blend " + seen.oldRoot.blend + "/" + seen.newRoot.blend + ", not normal");
          const moving = (seen.anims || []).filter(a => /\((hud|\*)\)|group\(root\)/.test(a.on));
          if (moving.length) bad("the top bar or a group is animated: " + JSON.stringify(moving));
          if (seen.oldHud.opacity !== "0") bad("the old top bar shows under the new one (opacity " + seen.oldHud.opacity + ")");
          if (JSON.stringify(seen.named) !== JSON.stringify(["header.topbar"]) || seen.rootName !== "root") bad("the named elements are " + JSON.stringify(seen.named) + " and the root (" + seen.rootName + "), not the top bar alone and the root");
          const group = [shift(seen.hud.t), [px(seen.hud.w), px(seen.hud.h)]];
          const arrived = round(seen.bar);
          if (!group[0] || group[0][0] !== arrived[0] || group[0][1] !== arrived[1] || group[1][0] !== arrived[2] || group[1][1] !== arrived[3]) bad("the HUD's group is at " + JSON.stringify(seen.hud) + ", not on the top bar at " + arrived.join(" "));
          if (left.join(" ") !== arrived.join(" ")) bad("the top bar moved: " + left.join(" ") + " on the page left, " + arrived.join(" ") + " on the page arriving");
          const jumped = moved(hud, seen.parts);
          if (jumped.length) bad("the HUD moved under the fade: " + jumped.join("; "));
          if (seen.parts) combo.add(pages[i].split("/").pop() + " " + (seen.parts["the combo"] === "hidden" ? "without" : "with"));
          /* the transition's own hold, in the page's frames (TIMING in WATCH) */
          if (!(seen.readyFrames <= 3)) bad("the transition became ready only after " + seen.readyFrames + " frames of the page arriving (" + seen.ms + "ms to finish)");
          if (seen.end == null) bad("the transition's animations were never seen to start (" + seen.ms + "ms to finish)");
          else if (!(seen.afterFrames <= 2)) bad("the transition finished " + seen.afterFrames + " frames after its animations ended, at " + seen.endMs + "ms (" + seen.ms + "ms to finish)");
          if (seen.heldByPage > 50) held.push(pages[i].split("/").pop() + " " + seen.heldByPage + "ms");
          /* while it runs the page is not hit-tested (the spec: captured elements behave as
             if pointer-events: none), so a click on the HUD then is lost; the README says so.
             The window is the longest of its animations from start to end, delay and
             iterations counted (`span`, TIMING in WATCH), not their durations: hold it to a
             quarter of a second, and the menu button to taking clicks again once it is over */
          const longest = (seen.anims || []).reduce((m, a) => a.span > m.span ? a : m, { span: 0 });
          if (!(longest.span <= 250)) bad("the transition's " + longest.on + " runs " + longest.span + "ms from its start to its end (" + longest.ms + "ms a play): clicks are ignored for that long (README, \"Between pages\": a quarter of a second)");
          spans.add(longest.span);
          if (seen.hitDone !== "the menu button") bad("once the transition finished, a click on the menu button lands on " + seen.hitDone);
          deadHits.add(seen.hitReady);
          ms.push(seen.ms);
        }
        /* from half-way down a chapter: the old page fades where it was, the HUD with it */
        if (pages.includes(CHAPTER) && pages.indexOf(CHAPTER) + 1 < pages.length) {
          await page.goto(server.url + CHAPTER, { waitUntil: "load" });
          await h.settle(page);
          const next = pages[pages.indexOf(CHAPTER) + 1];
          const { left, hud, seen } = await go(page, next, (p) => p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2)));
          const arrived = seen.bar ? round(seen.bar) : null;
          if (!seen.ran) problems.push(hop(CHAPTER + " (half-way down)", next) + ": the view transition did not run (" + (seen.skipped || JSON.stringify(seen.reveal)) + ")");
          else if (!arrived || left.join(" ") !== arrived.join(" ")) problems.push(hop(CHAPTER + " (half-way down)", next) + ": the top bar moved: " + left.join(" ") + " -> " + arrived);
          else if (moved(hud, seen.parts).length) problems.push(hop(CHAPTER + " (half-way down)", next) + ": the HUD moved: " + moved(hud, seen.parts).join("; "));
        }
        /* by a link in the open settings sheet. Not modal (a wide screen), it hangs from the
           top bar, so it would be in the top bar's capture, which is hidden at once: it has a
           name of its own while it is open, and fades out with the page, from where it was.
           Modal (a narrow screen), it is in the top layer, which is in the root's capture. */
        if (pages.includes("index.html") && pages.includes("progress.html")) {
          await page.goto(server.url + "index.html", { waitUntil: "load" });
          await h.settle(page);
          const where = "index.html -> progress.html (a link in the open settings sheet): ";
          let hung = null;
          const sheetAt = async (p) => {
            await p.click(".hud-menu");
            await p.waitForFunction(() => document.querySelector("#hud-sheet").open);
            /* where it hangs once it has come in (it rises into place, game.css) */
            await p.evaluate(() => Promise.all(document.querySelector("#hud-sheet").getAnimations().map(a => a.finished)));
            hung = round(await p.evaluate(() => { const b = document.querySelector("#hud-sheet").getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
          };
          const { seen } = await go(page, "progress.html", sheetAt, "#hud-sheet a[href=\"progress.html\"]");
          const sheet = seen.swap && seen.swap.sheet;
          const fade = (seen.anims || []).filter(a => a.on === "::view-transition-old(hud-sheet)");
          const rootFade = (seen.anims || []).filter(a => a.on === "::view-transition-old(root)");
          if (!seen.ran) problems.push(where + "the view transition did not run (" + (seen.skipped || JSON.stringify(seen.reveal)) + ")");
          else if (!sheet) problems.push(where + "the sheet was not open when the page was left");
          else if (sheet.modal) {
            if (fade.length || sheet.name !== "none") problems.push(where + "the modal sheet has a name of its own (" + sheet.name + "), so it does not fade in the root");
            else sheetNote.push(vw + ": modal, in the root's fade");
          } else {
            const g = [shift(seen.sheetGroup.t), px(seen.sheetGroup.w), px(seen.sheetGroup.h)];
            if (fade.length !== 1 || !rootFade.length || fade[0].name !== rootFade[0].name || fade[0].ms !== rootFade[0].ms) problems.push(where + "the sheet does not fade out with the page: " + JSON.stringify(fade) + " against the root's " + JSON.stringify(rootFade));
            /* within a pixel: the capture is snapped to whole pixels */
            else if (!g[0] || !hung || [g[0][0], g[0][1], g[1], g[2]].some((v, j) => !(Math.abs(v - hung[j]) <= 1))) problems.push(where + "the sheet fades at " + JSON.stringify(seen.sheetGroup) + ", not where it was, " + JSON.stringify(hung));
            else sheetNote.push(vw + ": not modal, faded out in " + fade[0].ms + "ms where it hung");
          }
          const named = seen.named || [];
          if (JSON.stringify(named) !== JSON.stringify(["header.topbar"])) problems.push(where + "the named elements on the page arriving are " + JSON.stringify(named));
        }
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"]("transitions on [" + vw + "]: " + pages.join(" -> "),
        problems.length ? problems.join("\n") : (pages.length - 1) + " navigations each ran a transition, every part of the HUD both pages show where it was (the combo: " + Array.from(combo).join(", ") + ") and the page faded in " + ms.join("/") + "ms (the longest animation " + Array.from(spans).join("/") + "ms from start to end, each transition over in the first frame or two after its animations; the page's own work held the end longer than 50ms: " + (held.length ? held.join(", ") : "none") + "), and one from half-way down a chapter; a click on the menu button lands on " + Array.from(deadHits).join("/") + " while it runs (ignored) and on the button once it is over; from the open sheet, " + sheetNote.join(", "));
    }

    /* ---------------------------------------------------- skipped ------ */
    const SKIPS = [
      { label: "Study mode", storage: { "bm.prefs.v1": { calm: true } } },
      { label: "Reduce motion (the setting)", storage: { "bm.prefs.v1": { motion: "reduce" } } },
      { label: "reduced motion on the device", reducedMotion: "reduce", never: true },
      { label: "Study mode switched on on the page left", before: (p) => p.evaluate(() => document.documentElement.setAttribute("data-calm", "true")) },
      { label: "Study mode stored for the page arriving only", before: (p) => p.evaluate(() => localStorage.setItem("bm.prefs.v1", JSON.stringify({ calm: true }))), arriving: true }
    ];
    for (const s of SKIPS) {
      const { page, errors, close } = await start({ storage: s.storage, reducedMotion: s.reducedMotion });
      const problems = [], how = [];
      /* the first page only for the one-sided cases: after it, both pages are in Study mode */
      const route = s.before ? pages.slice(0, 2) : pages;
      try {
        for (let i = 1; i < route.length; i++) {
          const { seen } = await go(page, route[i], s.before);
          const where = hop(route[i - 1], route[i]) + ": ";
          if (seen.ran) { problems.push(where + "the view transition ran"); continue; }
          if (s.never && seen.swap && seen.swap.vt) problems.push(where + "the page left opted in at all under reduced motion");
          if (s.arriving && !(seen.reveal && seen.reveal.vt && seen.skipped)) problems.push(where + "expected the page arriving to skip the transition it was handed, saw " + JSON.stringify({ reveal: seen.reveal, skipped: seen.skipped }));
          how.push(seen.reveal && seen.reveal.vt ? "skipped at pagereveal (" + seen.skipped + ")" : seen.swap && seen.swap.vt ? "skipped at pageswap" : "none offered");
        }
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"]("skipped with " + s.label + ": " + route.join(" -> "),
        problems.length ? problems.join("\n") : (route.length - 1) + " navigation(s), no transition: " + Array.from(new Set(how)).join(", "));
    }

    /* -------------------------------------------------- a slow page ---- */
    {
      const to = pages[1];
      const { context, page, errors, close } = await start({});
      const problems = [];
      let note = "";
      try {
        let armed = true;
        await context.route((u) => armed && /\.css(\?|$)/.test(u.href), async (r) => { await new Promise(res => setTimeout(res, 5000)); try { await r.continue(); } catch (e) { /* the context closed */ } });
        const t0 = Date.now();
        const { seen } = await go(page, to);
        armed = false;
        const took = Date.now() - t0;
        if (seen.ran) problems.push("a transition ran though the page took " + took + "ms");
        const shows = await page.evaluate(() => !!document.querySelector("main") && getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)");
        if (!shows) problems.push("the page arrived without its styles");
        note = "the page arrived styled after " + took + "ms with no transition (" + (seen.reveal && seen.reveal.vt ? "skipped: " + seen.skipped : "none offered at pagereveal") + ")";
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"]("a slow page: " + hop(pages[0], to) + " with its stylesheets held back 5s", problems.length ? problems.join("\n") : note + ", and no error");
    }

    /* --------------------------------------------- back and forward ---- */
    /* A page left by a link stays in the back/forward cache, and going back or forward
       restores it (pageshow.persisted) and is offered a transition like any other
       navigation. Playwright launches Chromium with that cache off, and its headless shell
       has none, so this part runs on a browser of its own: the full Chromium, the cache
       on. Forward by links through three pages, then back, back and forward: each of
       those must restore the page from the cache, and run the transition with the HUD
       still, or skip it in Study mode, stored or switched on on the page being left. */
    if (pages.length >= 3) {
      const route = pages.slice(0, 3);
      let bf = null;
      try { bf = await ctx.pw.chromium.launch({ channel: "chromium", headless: !ctx.opts.headed, args: ctx.launch.args, env: gl.env(ctx.pw.chromium), ignoreDefaultArgs: ["--disable-back-forward-cache"] }); }
      catch (e) { report.fail("back and forward: launch", "the full Chromium (channel \"chromium\", from npx playwright install chromium) did not start with the back/forward cache on: " + (e && e.message || e)); }
      if (bf) {
        const hb = browserLib.makeHelpers(Object.assign({}, ctx, { browser: bf }));
        const CASES = [
          { label: "transitions on", ran: true, storage: SHIELD },
          { label: "Study mode", storage: { "bm.prefs.v1": { calm: true } } },
          { label: "Study mode switched on on the page left", before: (p) => p.evaluate(() => document.documentElement.setAttribute("data-calm", "true")) }
        ];
        try {
          for (const c of CASES) {
            /* served as GitHub Pages serves it (OPERATIONS.md: max-age=600): the test server's
               no-store keeps a page out of the cache */
            const pagesHeaders = (context) => context.route((u) => u.href.startsWith(server.url), async (r) => {
              try {
                const res = await r.fetch();
                await r.fulfill({ response: res, headers: Object.assign({}, res.headers(), { "cache-control": "max-age=600" }) });
              } catch (e) { /* the context closed */ }
            });
            const { page, context, errors, close } = await start({ storage: c.storage, prep: pagesHeaders }, hb);
            const problems = [], how = [], notUsed = [];
            try {
              const cdp = await context.newCDPSession(page);
              await cdp.send("Page.enable");
              cdp.on("Page.backForwardCacheNotUsed", (e) => notUsed.push((e.notRestoredExplanations || []).map(x => x.reason).join(", ")));
              /* each page as it was left: which document, revealed how many times */
              const left = {};
              const leave = async () => { const v = await page.evaluate(() => ({ at: location.href, doc: window.__vt.doc, reveals: window.__vt.reveals })); left[v.at] = v; };
              for (let i = 1; i < route.length; i++) { await leave(); await go(page, route[i]); }
              let at = route.length - 1;
              for (const dir of ["back", "back", "forward"]) {
                const to = route[at + (dir === "back" ? -1 : 1)];
                const where = dir + " from " + route[at] + " to " + to + ": ";
                const bad = (m) => problems.push(where + m);
                const bar = await page.evaluate(BAR);
                const hudLeft = await page.evaluate(PARTS, HUD_PARTS);
                await leave();
                if (c.before) await c.before(page);
                await page.evaluate((d) => history[d](), dir);
                /* restored, the document is the one left and its record starts again at its
                   next reveal; loaded afresh, it is another document */
                const was = left[server.url + to] || { doc: null, reveals: 0 };
                try {
                  await page.waitForFunction(([url, d, n]) => location.href === url && window.__vt && window.__vt.done && (window.__vt.doc !== d || window.__vt.reveals > n),
                    [server.url + to, was.doc, was.reveals], { timeout: 20000 });
                } catch (e) {
                  const state = await page.evaluate(() => ({ at: location.href, vt: window.__vt })).catch(x => x.message);
                  bad("never arrived: " + JSON.stringify(state) + "; not restored because " + (notUsed.join("; ") || "(no reason given)"));
                  break;
                }
                const seen = await page.evaluate(() => window.__vt);
                at += dir === "back" ? -1 : 1;
                if (seen.doc !== was.doc || seen.persisted !== true) { bad("the page was not restored from the back/forward cache (" + (notUsed.pop() || "no reason given") + ")"); continue; }
                if (c.ran) {
                  if (!seen.swap || !seen.swap.vt) bad("the page left had no view transition at pageswap");
                  if (!seen.ran) { bad("the view transition did not run (" + (seen.skipped || JSON.stringify(seen.reveal)) + ")"); continue; }
                  const arrived = round(seen.bar);
                  if (round(bar).join(" ") !== arrived.join(" ")) bad("the top bar moved: " + round(bar).join(" ") + " -> " + arrived.join(" "));
                  if (moved(hudLeft, seen.parts).length) bad("the HUD moved under the fade: " + moved(hudLeft, seen.parts).join("; "));
                  if (JSON.stringify(seen.named) !== JSON.stringify(["header.topbar"])) bad("the named elements are " + JSON.stringify(seen.named));
                  if (seen.hitDone !== "the menu button") bad("once the transition finished, a click on the menu button lands on " + seen.hitDone);
                  how.push(seen.ms + "ms");
                } else {
                  if (seen.ran) { bad("the view transition ran"); continue; }
                  how.push(seen.reveal && seen.reveal.vt ? "skipped at pagereveal (" + seen.skipped + ")" : seen.swap && seen.swap.vt ? "skipped at pageswap" : "none offered");
                }
              }
            } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
            problems.push(...errors.failures());
            await close();
            report[problems.length ? "fail" : "pass"]("back and forward, " + c.label + ": " + route.join(" -> ") + ", back, back, forward",
              problems.length ? problems.join("\n") : "each of the three restored from the back/forward cache, " + (c.ran ? "the transition ran with the HUD still, finished in " + how.join("/") : "no transition: " + Array.from(new Set(how)).join(", ")));
          }
        } finally { await bf.close(); }
      }
    }
  }
};
