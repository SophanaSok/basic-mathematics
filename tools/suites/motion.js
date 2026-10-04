"use strict";
/* Under prefers-reduced-motion: reduce nothing animates: at load, after a wrong answer
   and after a right one, document.getAnimations() has no running CSS animation
   (keyframes) — that FAILs. Running CSS transitions are sorted: a transition of a
   property that moves or resizes something (transform, translate/scale/rotate, width,
   height, top/left/right/bottom, margin, inset) is a WARN naming the property and the
   element; colour, opacity, shadow and filter fades are not motion and are ignored. */
const drive = require("../lib/drive");

const MOTION_PROPS = /^(transform|translate|scale|rotate|width|height|top|left|right|bottom|inset|margin.*|max-height|max-width)$/;

async function running(page) {
  return page.evaluate((src) => {
    const motion = new RegExp(src);
    const out = { animations: [], motionTransitions: [], fades: 0 };
    document.getAnimations().filter(a => a.playState === "running").forEach(a => {
      const t = a.effect && a.effect.target;
      const where = t ? t.tagName.toLowerCase() + (t.className && typeof t.className === "string" && t.className.trim() ? "." + t.className.trim().split(/\s+/).join(".") : "") : "?";
      if (a.transitionProperty !== undefined) {
        if (motion.test(a.transitionProperty)) out.motionTransitions.push(a.transitionProperty + " on " + where);
        else out.fades++;
      } else {
        out.animations.push((a.animationName || a.constructor.name) + " on " + where);
      }
    });
    return out;
  }, MOTION_PROPS.source);
}

module.exports = {
  name: "motion",
  order: 40,
  description: "reduced motion: no running CSS animation at load, after a wrong and after a right answer",
  async run(ctx) {
    const { h, report } = ctx;
    const transitionsSeen = {};
    for (const rel of ctx.chapterPages) {
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280, reducedMotion: "reduce" });
      try {
        await h.open(page, rel);
        await h.wholePage(page);
        const problems = [];
        const exs = page.locator(".ex");
        const n = await exs.count();
        let target = -1, meta = null;
        for (let i = 0; i < n && target === -1; i++) { const m = await drive.info(exs.nth(i)); if (!m.inline && m.kind === "text") { target = i; meta = m; } }
        const samples = [["at load", await running(page)]];
        if (target === -1) report.warn(rel, "no scored typed exercise; only the load state was sampled");
        else {
          const ex = exs.nth(target);
          await drive.answerWrong(ex, meta);
          await page.waitForTimeout(60);
          samples.push(["after a wrong answer", await running(page)]);
          await drive.answerWithKey(ex, meta);
          await page.waitForTimeout(60);
          samples.push(["after a right answer", await running(page)]);
        }
        let fades = 0;
        samples.forEach(([when, s]) => {
          if (s.animations.length) problems.push("running " + when + ": " + s.animations.join(", "));
          s.motionTransitions.forEach(t => { transitionsSeen[t] = transitionsSeen[t] || new Set(); transitionsSeen[t].add(when); });
          fades += s.fades;
        });
        /* scrolling stays instant too */
        const smooth = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
        if (smooth === "smooth") problems.push("html scroll-behavior is still smooth under reduced motion");
        problems.push(...errors.failures());
        report[problems.length ? "fail" : "pass"](rel, problems.length ? problems.join("\n") : "no running CSS animation at load / after wrong / after right (" + fades + " colour/shadow fades ignored)");
      } catch (e) { report.fail(rel, "driver error: " + (e && e.message || e)); }
      finally { await close(); }
    }
    const keys = Object.keys(transitionsSeen).sort();
    if (keys.length) report.warn("motion transitions under reduced motion", "these transitions move or resize something and are not switched off by prefers-reduced-motion:\n" + keys.map(k => k + " (" + Array.from(transitionsSeen[k]).join(", ") + ")").join("\n"));
  }
};
