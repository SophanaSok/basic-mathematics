"use strict";
/* Every page × theme × viewport, with clean storage: no console errors, no page errors,
   no same-origin 404s, the theme on <html> before the first frame (the inline boot
   script, so a dark page never flashes light), the site's scripts run (window.BMSite,
   BMGame and BMStore, in which site.js must have gone before game.js), KaTeX there and a
   formula rendered where the page has one (it comes in the bundle, ahead of site.js),
   no request to any server but the site's own and Three.js's CDN (a signed-out
   reader's browser contacts no one else), no horizontal overflow at phone width, lesson
   mode initialised on chapter pages, and a full-page screenshot of each cell for the
   contact sheet. Chapter pages are shot in whole-page mode (after the mode switch has
   been clicked, which also exercises it) so the sheet shows the content, not just the
   first step. */
const { slug } = require("../lib/browser");

/* runs before any script of the page: the theme as it stands at the first animation
   frame, which comes before the first paint */
const FIRST_FRAME = () => {
  requestAnimationFrame(() => { window.__themeAtFirstFrame = document.documentElement.getAttribute("data-theme"); });
};

module.exports = {
  name: "pages",
  order: 10,
  description: "every page × light/dark × 1280/360: errors, 404s, theme before first paint, scripts ran, KaTeX rendered, no third party but Three.js, overflow, lesson mode, screenshots",
  async run(ctx) {
    const { h, report } = ctx;
    for (const rel of ctx.pages) {
      const chapter = ctx.chapterOf(rel);
      for (const theme of ctx.themes) {
        for (const vw of ctx.vws) {
          const label = rel + " [" + theme + " " + vw + "]";
          const { context, page, errors, close } = await h.newPage({ theme, vw });
          const problems = [], warns = [];
          let shot = null;
          try {
            await context.addInitScript(FIRST_FRAME);
            await h.open(page, rel);
            /* the theme really took, and before anything was painted: the boot script
               inline in <head> sets html[data-theme] from bm.theme ahead of the
               stylesheets; site.js keeps it up */
            const applied = await page.evaluate(() => ({ now: document.documentElement.getAttribute("data-theme"), first: window.__themeAtFirstFrame }));
            if (applied.now !== theme) problems.push("html[data-theme] is " + JSON.stringify(applied.now) + ", expected " + theme);
            if (applied.first !== theme) problems.push("html[data-theme] was " + JSON.stringify(applied.first) + " at the first frame, expected " + theme + ": the boot script did not run before first paint");
            /* the module entry ran, in its order: BMStore and BMSite come from site.js,
               BMGame from game.js, which needs BMStore when it runs */
            const ran = await page.evaluate(() => ({ site: !!window.BMSite, game: !!window.BMGame, store: !!window.BMStore, curriculum: !!window.BM_CURRICULUM }));
            Object.keys(ran).forEach(k => { if (!ran[k]) problems.push("window.BM" + (k === "curriculum" ? "_CURRICULUM" : k[0].toUpperCase() + k.slice(1)) + " is missing: the module entry did not run, or not in order"); });
            /* KaTeX is in the bundle (src/vendor/katex.js, the entry's first import), so
               it is there, and was there when site.js ran */
            const katex = await page.evaluate(() => !!(window.katex && window.renderMathInElement));
            if (!katex) problems.push("window.katex or window.renderMathInElement is missing: src/vendor/katex.js did not run");
            else {
              const rendered = await page.evaluate(() => document.querySelectorAll(".katex").length);
              const math = await page.evaluate(() => /\$[^$]+\$|\\\(/.test(document.body.textContent || ""));
              if (!rendered && math) problems.push("KaTeX loaded but no formula was rendered: renderMathInElement was not there when site.js ran");
            }
            const overflow = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
            let ov = await overflow();
            if (ov.sw > ov.iw) problems.push("horizontal overflow: scrollWidth " + ov.sw + " > innerWidth " + ov.iw + " (initial view)");
            if (chapter) {
              const lesson = await page.evaluate(() => ({
                mode: document.body.getAttribute("data-lesson"),
                buttons: document.querySelectorAll(".lesson-mode button").length,
                steps: document.querySelectorAll("#main > [data-step]").length,
                hidden: document.querySelectorAll("#main > [data-step][hidden]").length,
                bar: !!document.querySelector(".lesson-next")
              }));
              if (lesson.mode !== "steps") problems.push("lesson mode not initialised: body[data-lesson]=" + JSON.stringify(lesson.mode));
              if (lesson.buttons !== 2) problems.push("expected the two lesson-mode buttons, found " + lesson.buttons);
              if (!lesson.hidden) problems.push("step mode shows every step (nothing hidden)");
              if (!lesson.bar) problems.push("no .lesson-next bar in step mode");
              if (await h.wholePage(page)) {
                ov = await overflow();
                if (ov.sw > ov.iw) problems.push("horizontal overflow in whole-page mode: scrollWidth " + ov.sw + " > innerWidth " + ov.iw);
                const stillHidden = await page.evaluate(() => document.querySelectorAll("#main > [data-step][hidden]").length);
                if (stillHidden) problems.push(stillHidden + " steps still hidden in whole-page mode");
              }
            }
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
            shot = await h.screenshot(page, "pages/" + slug(rel) + "--" + theme + "--" + vw);
          } catch (e) {
            problems.push("driver error: " + (e && e.message || e));
          }
          problems.push(...errors.failures());
          /* the fonts, KaTeX and supabase-js come from the site itself now, and a
             signed-out reader never fetches the account library at all: a request to
             anything but the local server and Three.js's CDN is a failure, not a warning */
          const unexpected = errors.unexpected();
          if (unexpected.length) problems.push("request(s) to a third party other than Three.js's CDN: " + unexpected.slice(0, 6).join(", ") + (unexpected.length > 6 ? " and " + (unexpected.length - 6) + " more" : ""));
          if (errors.thirdParty.length) warns.push("third-party: " + Array.from(new Set(errors.thirdParty)).slice(0, 4).join("; "));
          await close();
          const status = problems.length ? "fail" : "pass";
          report[status](label, problems.length ? problems.join("\n") : undefined);
          warns.forEach(w => report.warn(label, w));
          report.cell({ page: rel, theme, vw, status, screenshot: shot, detail: problems.join("\n") || null });
        }
      }
    }
  }
};
