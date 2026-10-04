"use strict";
/* An old reader's saved progress still lands on the same questions. For each chapter,
   the scored keys and question fingerprints are computed from the page at the BASE ref
   (tools/lib/keys.js — the same rule site.js uses), a bm.progress.v1 marking all of
   them solved is seeded, and the working-tree page is loaded. Every card that comes
   back as restored must carry the key the static rule predicts for its position
   (parser and engine agree) and its question must fingerprint the same as at base. */
const fs = require("fs");
const path = require("path");
const git = require("../lib/git");
const { exercisesOf } = require("../lib/keys");
const { PROGRESS_KEY } = require("../lib/browser");

module.exports = {
  name: "restore",
  order: 35,
  description: "progress saved at --base restores onto the same questions in the working tree",
  async run(ctx) {
    const { h, report } = ctx;
    for (const rel of ctx.chapterPages) {
      const chapter = ctx.chapterOf(rel);
      const baseSrc = git.showText(ctx.root, ctx.base, rel);
      if (baseSrc === null) { report.skip(rel, "not present at " + ctx.base + " (new chapter)"); continue; }
      const baseEx = exercisesOf(baseSrc).filter(e => !e.inline);
      const baseFp = {}; baseEx.forEach(e => { baseFp[e.key] = e; });
      const wtEx = exercisesOf(fs.readFileSync(path.join(ctx.root, rel), "utf8"));
      const solved = {}; baseEx.forEach(e => { solved[e.key] = true; });
      const storage = {}; storage[PROGRESS_KEY] = { [chapter]: { solved, total: baseEx.length } };
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280, storage });
      try {
        await h.open(page, rel);
        const dom = await page.evaluate(() => Array.from(document.querySelectorAll(".ex")).map(el => ({
          key: el.getAttribute("data-key"), inline: el.hasAttribute("data-inline"),
          state: el.getAttribute("data-state"), restored: el.getAttribute("data-restored") === "true"
        })));
        const problems = [];
        if (dom.length !== wtEx.length) problems.push("DOM has " + dom.length + " .ex, the parser found " + wtEx.length);
        let restoredN = 0;
        dom.forEach((d, i) => {
          const w = wtEx[i];
          if (!w) return;
          if (d.key !== w.key) { problems.push("#" + i + ": engine key " + JSON.stringify(d.key) + " ≠ static key " + JSON.stringify(w.key)); return; }
          if (d.inline) { if (d.restored) problems.push(w.key + ": inline exercise restored from progress"); return; }
          const b = baseFp[w.key];
          if (b) {
            if (!(d.state === "correct" && d.restored)) problems.push(w.key + ": seeded solved but not restored (state " + d.state + ")");
            else { restoredN++; if (w.fp !== b.fp) problems.push(w.key + ": restored onto a different question (fingerprint " + w.fp + " vs base " + b.fp + "; base line " + b.line + ", now line " + w.line + ")"); }
          } else if (d.restored) problems.push(w.key + ": restored although not in the base key set");
        });
        const lesson = await page.evaluate(() => ({ mode: document.body.getAttribute("data-lesson"), hidden: document.querySelectorAll("#main > [data-step][hidden]").length }));
        /* lesson.js: a reader with solved work is not sent back to step 1 */
        if (restoredN && lesson.mode === "steps" && lesson.hidden) problems.push("lesson mode hid " + lesson.hidden + " steps for a reader who had solved " + restoredN + " exercises (expected every step open)");
        const banner = await page.evaluate(() => !!document.querySelector(".chapter-done"));
        const wtScored = wtEx.filter(e => !e.inline).length;
        if (restoredN === wtScored && !banner) problems.push("every scored exercise restored but no .chapter-done banner");
        problems.push(...errors.failures());
        report[problems.length ? "fail" : "pass"](rel, problems.length ? problems.join("\n") : restoredN + " of " + baseEx.length + " base keys restored onto identical questions; " + wtScored + " scored in the working tree");
      } catch (e) { report.fail(rel, "driver error: " + (e && e.message || e)); }
      finally { await close(); }
    }
  }
};
