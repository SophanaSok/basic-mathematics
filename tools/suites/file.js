"use strict";
/* The README promises the built site still opens from disk. Load dist/index.html and one
   chapter of dist/ from file:// (always dist/, whatever --root serves); fail on page
   errors, console errors, a file of the site that did not load, a page left unstyled, or
   a site that did not build itself. A dist/ that is not there fails; one older than the
   source is loaded all the same, with a warning saying so. */
const path = require("path");
const target = require("../lib/target");

module.exports = {
  name: "file",
  order: 60,
  description: "dist/index.html and one chapter load from file:// without errors",
  async run(ctx) {
    const { h, report } = ctx;
    const old = target.stale();
    if (old === null) { report.fail("file://", "no build in " + target.DIST + " — run `npm run build` first"); return; }
    if (old) report.warn("file://", old + ": this loaded the older build (npm run build)");
    const targets = ["index.html"].concat(ctx.chapterPages.slice(0, 1)).filter(p => ctx.pages.includes(p));
    for (const rel of targets) {
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await page.goto("file://" + path.join(target.DIST, rel), { waitUntil: "load" });
        await h.settle(page);
        const built = await page.evaluate(() => ({
          curriculum: !!window.BM_CURRICULUM, site: !!window.BMSite, widgets: !!window.BMWidgets,
          home: document.querySelectorAll("[data-course-index] .stop").length,
          sidebar: document.querySelectorAll("[data-sidebar] a").length,
          lesson: document.body.getAttribute("data-lesson"), chapter: document.body.getAttribute("data-chapter"),
          /* a token of assets/site.css: there only when the site's own stylesheet applied */
          styled: !!getComputedStyle(document.documentElement).getPropertyValue("--plot-fill").trim()
        }));
        const problems = [];
        if (!built.curriculum || !built.site) problems.push("scripts did not run: " + JSON.stringify(built));
        if (!built.styled) problems.push("the site's stylesheet did not apply (no --plot-fill on the root element)");
        if (rel === "index.html" && !built.home) problems.push("home path not built");
        if (built.chapter && built.lesson !== "steps") problems.push("lesson mode not initialised: " + built.lesson);
        if (built.chapter && !built.sidebar) problems.push("sidebar not built");
        /* file:// has no origin: "same-origin" tracking covers file: URLs, so a file of
           the site that was refused or is missing is among the failures */
        problems.push(...errors.failures());
        report[problems.length ? "fail" : "pass"]("file://" + rel, problems.length ? problems.join("\n") : JSON.stringify(built));
        if (errors.thirdParty.length) report.warn("file://" + rel, "third-party: " + errors.thirdParty.slice(0, 3).join("; "));
      } catch (e) { report.fail("file://" + rel, "driver error: " + (e && e.message || e)); }
      finally { await close(); }
    }
  }
};
