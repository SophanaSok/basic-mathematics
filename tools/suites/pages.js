"use strict";
/* Every page × theme × viewport, with clean storage: no console errors, no page errors,
   no same-origin 404s, no horizontal overflow at phone width, lesson mode initialised
   on chapter pages, and a full-page screenshot of each cell for the contact sheet.
   Chapter pages are shot in whole-page mode (after the mode switch has been clicked,
   which also exercises it) so the sheet shows the content, not just the first step. */
const { slug } = require("../lib/browser");

module.exports = {
  name: "pages",
  order: 10,
  description: "every page × light/dark × 1280/360: errors, 404s, overflow, lesson mode, screenshots",
  async run(ctx) {
    const { h, report } = ctx;
    let katexMissingNoted = false;
    for (const rel of ctx.pages) {
      const chapter = ctx.chapterOf(rel);
      for (const theme of ctx.themes) {
        for (const vw of ctx.vws) {
          const label = rel + " [" + theme + " " + vw + "]";
          const { page, errors, close } = await h.newPage({ theme, vw });
          const problems = [], warns = [];
          let shot = null;
          try {
            await h.open(page, rel);
            /* the theme really took: site.js sets html[data-theme] from bm.theme */
            const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
            if (applied !== theme) problems.push("html[data-theme] is " + JSON.stringify(applied) + ", expected " + theme);
            const katex = await page.evaluate(() => !!(window.katex && window.renderMathInElement));
            if (!katex && !katexMissingNoted) { katexMissingNoted = true; warns.push("KaTeX did not load (offline?) — formulas are unrendered in every screenshot"); }
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
