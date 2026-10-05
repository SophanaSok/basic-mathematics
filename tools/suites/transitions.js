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
       elements, and its group sits exactly where the top bar is on the page left and on
       the page arriving: the HUD keeps its position. The top bar is the one element
       named. It is over within a second of the page showing. And one hop from half-way
       down a chapter;
     - skipped: with Study mode, with Reduce motion (the settings), with reduced motion
       on the device (never opted in: the page left had no transition to skip), with
       Study mode switched on on the page left after it loaded (pageswap skips it), and
       with Study mode stored for the page arriving only (pagereveal skips it);
     - a slow page: the arriving page's stylesheets held back past the browser's timeout
       (four seconds in Chrome): no transition, the page still arrives, and no error;
     - and on every page, no console error, no uncaught exception, no same-origin 404.
   Each navigation is started by the page (location.assign, as a link's is): one typed
   into the address bar or a reload never has a transition. */
const PAGES = ["index.html", "parts/2-geometry/05-distance-and-angles.html", "arena.html", "progress.html", "about.html", "index.html"];
const CHAPTER = PAGES[1];
const SWAP_KEY = "bm-test-swap";

/* in every document of the context, before the page's own scripts (so these listeners
   run before the boot script's, and see a transition it is about to skip) */
const WATCH = (key) => {
  if (window.top !== window) return;
  const vt = window.__vt = { swap: null, reveal: null, done: false };
  try { vt.swap = JSON.parse(sessionStorage.getItem(key)); sessionStorage.removeItem(key); } catch (e) { /* no storage */ }
  addEventListener("pageswap", (e) => {
    try { sessionStorage.setItem(key, JSON.stringify({ vt: !!e.viewTransition })); } catch (x) { /* no storage */ }
  });
  addEventListener("pagereveal", (e) => {
    const t0 = performance.now();
    vt.reveal = { vt: !!e.viewTransition };
    if (!e.viewTransition) { vt.done = true; return; }
    e.viewTransition.ready.then(() => {
      vt.ran = true;
      vt.anims = document.getAnimations().filter(a => a.effect && a.effect.pseudoElement)
        .map(a => ({ on: a.effect.pseudoElement, name: a.animationName, ms: a.effect.getComputedTiming().duration }));
      const css = (p) => { const s = getComputedStyle(document.documentElement, p); return { w: s.width, h: s.height, t: s.transform, ease: s.animationTimingFunction, blend: s.mixBlendMode, opacity: s.opacity }; };
      vt.hud = css("::view-transition-group(hud)");
      vt.oldHud = css("::view-transition-old(hud)");
      vt.oldRoot = css("::view-transition-old(root)");
      vt.newRoot = css("::view-transition-new(root)");
      const root = getComputedStyle(document.documentElement);
      vt.tokens = { in: root.getPropertyValue("--ease-in").trim(), out: root.getPropertyValue("--ease-out").trim() };
      const r = document.querySelector(".topbar").getBoundingClientRect();
      vt.bar = [r.x, r.y, r.width, r.height];
      vt.rootName = getComputedStyle(document.documentElement).viewTransitionName;
      vt.named = Array.from(document.body.querySelectorAll("*")).filter(el => getComputedStyle(el).viewTransitionName !== "none")
        .map(el => el.tagName.toLowerCase() + (el.classList.length ? "." + el.classList[0] : ""));
    }, (err) => { vt.ran = false; vt.skipped = err && err.name; });
    e.viewTransition.finished.then(() => { vt.ms = Math.round(performance.now() - t0); vt.done = true; });
  });
};

const BAR = () => { const r = document.querySelector(".topbar").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
/* a timing function as numbers, however it is spelt: "cubic-bezier(.5, 0, .9, .4)" */
const curve = (s) => (String(s).match(/-?[\d.]+/g) || []).map(Number).join(",");
const px = (s) => Math.round(parseFloat(s) * 10) / 10;
const round = (a) => a.map(v => Math.round(v * 10) / 10);
/* matrix(1, 0, 0, 1, x, y) -> [x, y]; "none" -> [0, 0] */
const shift = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ""); if (!m) return t === "none" ? [0, 0] : null; const v = m[1].split(",").map(Number); return v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1 ? [v[4], v[5]].map(x => Math.round(x * 10) / 10) : null; };

module.exports = {
  name: "transitions",
  order: 47,
  description: "between pages: a cross-document view transition runs from page kind to page kind with the HUD held still (each width), and is skipped in Study mode, with Reduce motion, with reduced motion on the device, from either side; a slow page is not held",
  async run(ctx) {
    const { h, report, server } = ctx;
    const pages = PAGES.filter(p => ctx.pages.includes(p));
    if (pages.length < 2) { report.skip("transitions", "needs two of " + PAGES.join(", ") + "; --only left " + pages.length); return; }
    const theme = ctx.themes[0];

    /* a context with the watch in every document, on the first page */
    async function start(o) {
      const s = await h.newPage({ theme, vw: o.vw || 1280, reducedMotion: o.reducedMotion, storage: o.storage });
      await s.context.addInitScript(WATCH, SWAP_KEY);
      await h.open(s.page, o.from || pages[0]);
      return s;
    }
    /* leave for `rel` as a link does, and wait for the page to arrive and its transition,
       if it has one, to finish; returns what the watch saw and the top bar left behind */
    async function go(page, rel, before) {
      const left = await page.evaluate(BAR);
      if (before) await before(page);
      await page.evaluate((url) => { location.assign(url); }, server.url + rel);
      await page.waitForURL(server.url + rel, { timeout: 20000 });
      await page.waitForLoadState("load", { timeout: 20000 });
      await page.waitForFunction(() => window.__vt && window.__vt.done, null, { timeout: 10000 });
      const seen = await page.evaluate(() => window.__vt);
      await h.settle(page);
      return { left: round(left), seen };
    }
    const hop = (a, b) => a + " -> " + b;

    /* ---------------------------------------------- transitions on ----- */
    for (const vw of ctx.vws) {
      const { page, errors, close } = await start({ vw });
      const problems = [], ms = [];
      try {
        for (let i = 1; i < pages.length; i++) {
          const { left, seen } = await go(page, pages[i]);
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
          if (!(seen.ms <= 1000)) bad("the transition took " + seen.ms + "ms to finish");
          ms.push(seen.ms);
        }
        /* from half-way down a chapter: the old page fades where it was, the HUD with it */
        if (pages.includes(CHAPTER) && pages.indexOf(CHAPTER) + 1 < pages.length) {
          await page.goto(server.url + CHAPTER, { waitUntil: "load" });
          await h.settle(page);
          const next = pages[pages.indexOf(CHAPTER) + 1];
          const { left, seen } = await go(page, next, (p) => p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2)));
          const arrived = seen.bar ? round(seen.bar) : null;
          if (!seen.ran) problems.push(hop(CHAPTER + " (half-way down)", next) + ": the view transition did not run (" + (seen.skipped || JSON.stringify(seen.reveal)) + ")");
          else if (!arrived || left.join(" ") !== arrived.join(" ")) problems.push(hop(CHAPTER + " (half-way down)", next) + ": the top bar moved: " + left.join(" ") + " -> " + arrived);
        }
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"]("transitions on [" + vw + "]: " + pages.join(" -> "),
        problems.length ? problems.join("\n") : (pages.length - 1) + " navigations each ran a transition, the HUD still and the page faded in " + ms.join("/") + "ms, and one from half-way down a chapter");
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
  }
};
