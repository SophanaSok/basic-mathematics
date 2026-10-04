"use strict";
/* Every exercise grades. Per chapter, in whole-page mode:
   (b) the first scored typed exercise: a wrong answer shows feedback (with the hint when
       there is one), then the right answer is marked correct;
   (a) every exercise is answered with its own key — typed kinds by typing the key and
       pressing Enter, choice/multi by ticking, blank by filling each blank, order by the
       up/down buttons; `figure` kinds are counted and skipped (the answer is the state
       of a figure, which has no generic driver);
   (c) after a reload every solved scored exercise comes back as correct and restored. */
const drive = require("../lib/drive");

module.exports = {
  name: "exercises",
  order: 30,
  description: "every exercise grades with its key; wrong answers show hints; solved ones survive a reload",
  async run(ctx) {
    const { h, report } = ctx;
    const totals = { driven: 0, ok: 0, skipped: 0, fallback: 0, byKind: {} };
    for (const rel of ctx.chapterPages) {
      const chapter = ctx.chapterOf(rel);
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await h.open(page, rel);
        await h.wholePage(page);
        const exs = page.locator(".ex");
        const n = await exs.count();
        const metas = [];
        for (let i = 0; i < n; i++) metas.push(await drive.info(exs.nth(i)));

        /* (b) wrong then right on the first scored typed exercise */
        const bi = metas.findIndex(m => !m.inline && m.kind === "text");
        if (bi === -1) report.warn(rel + " · feedback", "no scored typed exercise to test wrong-answer feedback on");
        else {
          const ex = exs.nth(bi), m = metas[bi];
          const problems = [];
          await drive.answerWrong(ex, m);
          const st = await drive.state(ex);
          if (st !== "wrong") problems.push("state after a wrong answer is " + JSON.stringify(st));
          if (!(await drive.feedbackVisible(ex))) problems.push("feedback not visible after a wrong answer");
          const fb = await drive.feedbackText(ex);
          if (!/Not right/.test(fb)) problems.push("feedback text lacks 'Not right': " + JSON.stringify(fb));
          if (m.hint) {
            const frag = drive.hintFragment(m.hint);
            /* the hint is its own panel, .ex-hint, under the verdict */
            const panel = await ex.locator(".ex-feedback .ex-hint:not([data-prev])").count();
            if (!panel || !/Hint/.test(fb)) problems.push("hint not shown after the first wrong answer; feedback: " + JSON.stringify(fb));
            else if (frag && !fb.includes(frag)) problems.push("feedback does not contain the hint fragment " + JSON.stringify(frag) + ": " + JSON.stringify(fb));
          }
          const r = await drive.answerWithKey(ex, m);
          if (!r.ok) problems.push("right answer " + JSON.stringify(r.used) + " not accepted; feedback: " + JSON.stringify(await drive.feedbackText(ex)));
          const fb2 = await drive.feedbackText(ex);
          if (r.ok && !/Correct/.test(fb2)) problems.push("correct feedback text missing: " + JSON.stringify(fb2));
          report[problems.length ? "fail" : "pass"](rel + " · feedback (" + m.key + ")", problems.length ? problems.join("\n") : "wrong → 'Not right'" + (m.hint ? " + hint" : "") + ", then correct");
        }

        /* (a) the sweep */
        const solvedScored = [];
        const fails = [];
        for (let i = 0; i < n; i++) {
          const m = metas[i];
          totals.byKind[m.kind] = (totals.byKind[m.kind] || 0) + 1;
          if (m.kind === "figure") { totals.skipped++; continue; }
          totals.driven++;
          const ex = exs.nth(i);
          if (m.state === "correct" || (await drive.state(ex)) === "correct") { totals.ok++; if (!m.inline) solvedScored.push(m.key); continue; }
          let r;
          try { r = await drive.answerWithKey(ex, m); }
          catch (e) { r = { ok: false, note: "driver: " + (e && e.message || e).split("\n")[0] }; }
          if (r.ok) {
            totals.ok++;
            if (r.tried > 1) totals.fallback++;
            if (!m.inline) solvedScored.push(m.key);
          } else {
            fails.push(m.key + " [" + m.kind + "/" + m.type + "] answer=" + JSON.stringify(m.answer) + (r.note ? " " + r.note : "") + " feedback=" + JSON.stringify(await drive.feedbackText(ex)));
          }
        }
        const pageErrs = errors.failures();
        if (fails.length || pageErrs.length) report.fail(rel + " · sweep", fails.concat(pageErrs).join("\n"));
        else report.pass(rel + " · sweep", n + " exercises (" + metas.filter(m => m.kind === "figure").length + " figure kinds skipped), all graded correct");

        /* the score line agrees */
        const score = await page.evaluate(() => { const s = document.querySelector("[data-practice-score]"); return s ? s.textContent.replace(/\s+/g, " ").trim() : null; });
        const scoredN = metas.filter(m => !m.inline).length;
        if (score !== null && score !== solvedScored.length + " of " + scoredN + " solved") report.fail(rel + " · score line", JSON.stringify(score) + " vs " + solvedScored.length + " of " + scoredN);
        const banner = await page.evaluate(() => !!document.querySelector(".chapter-done"));
        if (solvedScored.length === scoredN && scoredN && !banner) report.fail(rel + " · completion banner", "all " + scoredN + " solved but no .chapter-done");

        /* (c) reload: solved scored exercises come back as correct + restored */
        await page.reload({ waitUntil: "load" });
        await h.settle(page);
        const after = await page.evaluate(() => Array.from(document.querySelectorAll(".ex:not([data-inline])")).map(el => ({
          key: el.getAttribute("data-key"), state: el.getAttribute("data-state"), restored: el.getAttribute("data-restored") === "true"
        })));
        const restored = after.filter(a => a.state === "correct" && a.restored).map(a => a.key).sort();
        const want = solvedScored.slice().sort();
        const missing = want.filter(k => !restored.includes(k)), extra = restored.filter(k => !want.includes(k));
        const notRestoredFlag = after.filter(a => a.state === "correct" && !a.restored).map(a => a.key);
        if (missing.length || extra.length || notRestoredFlag.length) report.fail(rel + " · restore after reload", (missing.length ? "not restored: " + missing.join(",") : "") + (extra.length ? " unexpectedly restored: " + extra.join(",") : "") + (notRestoredFlag.length ? " correct but without data-restored: " + notRestoredFlag.join(",") : ""));
        else report.pass(rel + " · restore after reload", restored.length + " scored exercises restored as correct");
        /* and the lesson remembers whole-page mode (bm.lesson.v1 mode) */
        const mode = await page.evaluate(() => document.body.getAttribute("data-lesson"));
        if (mode !== "page") report.fail(rel + " · lesson mode remembered", "after reload body[data-lesson]=" + JSON.stringify(mode));
      } catch (e) { report.fail(rel, "driver error: " + (e && e.stack || e)); }
      finally { await close(); }
    }
    report.pass("totals", totals.driven + " driven, " + totals.ok + " correct, " + totals.skipped + " skipped (figure kind), " + totals.fallback + " needed a |-alternative; by kind " + JSON.stringify(totals.byKind));
    if (totals.skipped) report.warn("skipped kinds", totals.skipped + " exercises of kind `figure` are not driven: their answer is the state of an interactive figure, which has no generic driver");
  }
};
