"use strict";
/* The README promises file:// works. Load index.html and one chapter straight from
   disk; fail on page errors, console errors, or a site that did not build itself. */
const path = require("path");

module.exports = {
  name: "file",
  order: 60,
  description: "index.html and one chapter load from file:// without errors",
  async run(ctx) {
    const { h, report } = ctx;
    const targets = ["index.html"].concat(ctx.chapterPages.slice(0, 1)).filter(p => ctx.pages.includes(p));
    for (const rel of targets) {
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await page.goto("file://" + path.join(ctx.root, rel), { waitUntil: "load" });
        await h.settle(page);
        const built = await page.evaluate(() => ({
          curriculum: !!window.BM_CURRICULUM, site: !!window.BMSite, widgets: !!window.BMWidgets,
          home: document.querySelectorAll("[data-course-index] .stop").length,
          sidebar: document.querySelectorAll("[data-sidebar] a").length,
          lesson: document.body.getAttribute("data-lesson"), chapter: document.body.getAttribute("data-chapter")
        }));
        const problems = [];
        if (!built.curriculum || !built.site) problems.push("scripts did not run: " + JSON.stringify(built));
        if (rel === "index.html" && !built.home) problems.push("home path not built");
        if (built.chapter && built.lesson !== "steps") problems.push("lesson mode not initialised: " + built.lesson);
        if (built.chapter && !built.sidebar) problems.push("sidebar not built");
        /* file:// has no origin: "same-origin" tracking covers file: URLs */
        problems.push(...errors.pageErrors.map(e => "pageerror: " + e), ...errors.console);
        report[problems.length ? "fail" : "pass"]("file://" + rel, problems.length ? problems.join("\n") : JSON.stringify(built));
        if (errors.thirdParty.length) report.warn("file://" + rel, "third-party: " + errors.thirdParty.slice(0, 3).join("; "));
      } catch (e) { report.fail("file://" + rel, "driver error: " + (e && e.message || e)); }
      finally { await close(); }
    }
  }
};
