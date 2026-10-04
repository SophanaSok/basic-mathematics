"use strict";
/* With clean storage no mission is done the moment its figure mounts: every
   .missions li lacks data-done, the heading reads "0 of n", BMPlay has nothing, and
   BMMissions.total() matches what the page shows. (missions() in widgets.js marks a
   finished mission with li[data-done="true"] and stores it under BMPlay.) */

module.exports = {
  name: "missions",
  order: 25,
  description: "no mission is done at mount with clean storage; totals agree",
  async run(ctx) {
    const { h, report } = ctx;
    let total = 0;
    for (const rel of ctx.chapterPages) {
      const chapter = ctx.chapterOf(rel);
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await h.open(page, rel);
        /* the tests also re-run on any click inside a host; the mode switch sits outside */
        await h.wholePage(page);
        await page.evaluate(() => new Promise(r => setTimeout(r, 80)));
        const m = await page.evaluate((chapter) => {
          const lis = Array.from(document.querySelectorAll(".missions li"));
          const done = lis.filter(li => li.getAttribute("data-done") === "true").map(li => li.textContent.trim());
          const heads = Array.from(document.querySelectorAll(".missions-head")).map(h => h.textContent.trim());
          const badHead = heads.filter(t => !/^Missions — 0 of \d+$/.test(t));
          const play = window.BMPlay ? window.BMPlay.chapter(chapter) : null;
          const inExercise = Array.from(document.querySelectorAll(".ex .missions")).length;
          return { n: lis.length, done, heads: heads.length, badHead, bmTotal: window.BMMissions ? window.BMMissions.total() : null,
            playDone: play ? Object.keys(play.done).length : null, playTotal: play ? play.total : null, inExercise, figures: document.querySelectorAll("[data-widget]").length };
        }, chapter);
        total += m.n;
        const problems = [];
        if (m.done.length) problems.push(m.done.length + " mission(s) already done at mount: " + m.done.join(" | "));
        if (m.badHead.length) problems.push("heading not '0 of n': " + m.badHead.join(" | "));
        if (m.playDone) problems.push("BMPlay already has " + m.playDone + " done");
        if (m.bmTotal !== m.n) problems.push("BMMissions.total() = " + m.bmTotal + " but " + m.n + " mission items are on the page");
        if (m.playTotal !== m.n) problems.push("BMPlay total " + m.playTotal + " ≠ " + m.n + " items");
        if (m.inExercise) problems.push(m.inExercise + " missions box inside an exercise (data-no-missions should suppress it)");
        if (m.figures && !m.n) problems.push("figures present but no missions rendered");
        problems.push(...errors.failures());
        report[problems.length ? "fail" : "pass"](rel, problems.length ? problems.join("\n") : m.n + " missions on " + m.figures + " figures, none done");
      } catch (e) { report.fail(rel, "driver error: " + (e && e.message || e)); }
      finally { await close(); }
    }
    report.pass("total", total + " missions across " + ctx.chapterPages.length + " chapters");
  }
};
