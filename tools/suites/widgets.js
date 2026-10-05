"use strict";
/* Every interactive figure mounts (an <svg> or <canvas> inside, no failure note), and
   survives being driven: each range slider to both ends, each chip clicked, and the
   arrow keys and Space on a focusable SVG. Any exception fails.
   On a chapter with 3D scenes, also the painter every stage reached, one result per page:
   under a launch the webgl suite's probe found WebGL 2 in, every stage must be on the GL
   painter (data-painter="gl" data-state="ready"), since scenes3d.js falls back to the SVG
   painter on purpose, without a console error, when the GL one cannot start, and a
   Three.js release that broke only the scene painter would otherwise pass here on the
   flat pictures. The probe runs even under --skip=webgl (the deploy gate, which is not
   retried, and software WebGL now and then loses its context), so there a stage off the
   GL painter is a warn that names every stage's painter, not a failure: the failure is
   this suite's in every other run, and game/scenes.test.js's in the retried webgl job,
   where it also holds the fallback without WebGL. */

/* a stage that asked for 3D ends on gl/ready or svg/fallback; svg/ready never asked
   (the page was not scrolled to it), loading is still waiting */
const SCENE_HOSTS = "[data-widget][data-painter]";
async function settledPainters(page) {
  const done = await page.waitForFunction((sel) => Array.prototype.every.call(document.querySelectorAll(sel), el => {
    const s = el.getAttribute("data-painter") + "/" + el.getAttribute("data-state");
    return s === "gl/ready" || s === "svg/fallback";
  }), SCENE_HOSTS, { timeout: 20000 }).then(() => true, () => false);
  const states = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(el =>
    el.getAttribute("data-widget") + (el.closest(".ex") ? "(ex)" : "") + ":" + el.getAttribute("data-painter") + "/" + el.getAttribute("data-state")), SCENE_HOSTS);
  return { done, states };
}

module.exports = {
  name: "widgets",
  order: 20,
  description: "every [data-widget] mounts and survives sliders at both ends, every chip, and keyboard on its SVG; every 3D stage on the GL painter under WebGL",
  async run(ctx) {
    const { h, report } = ctx;
    let totalHosts = 0;
    for (const rel of ctx.chapterPages) {
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await h.open(page, rel);
        await h.wholePage(page);
        /* the 3D stages ask for Three.js as they near the screen: scroll past every one,
           then wait for each to settle on its painter before the figures are driven */
        const scenes = page.locator(SCENE_HOSTS);
        const nScenes = await scenes.count();
        for (let s = 0; s < nScenes; s++) await scenes.nth(s).scrollIntoViewIfNeeded();
        const painters = nScenes ? await settledPainters(page) : null;
        const hosts = await page.evaluate(() => Array.from(document.querySelectorAll("[data-widget]")).map((el, i) => ({
          i, name: el.getAttribute("data-widget"), inEx: !!el.closest(".ex"),
          /* most figures are SVG; truthtable is an HTML <table>, scenes will be <canvas> */
          mounted: !!el.querySelector("svg, canvas, table"),
          note: (el.querySelector(".hint-drag") && /failed to load|not available/i.test(el.querySelector(".hint-drag").textContent)) ? el.querySelector(".hint-drag").textContent.trim() : null,
          ranges: el.querySelectorAll("input[type=range]").length, chips: el.querySelectorAll("button.chip").length,
          focusable: el.querySelectorAll("svg[tabindex], svg [tabindex]").length
        })));
        totalHosts += hosts.length;
        if (!hosts.length) { report.warn(rel, "no [data-widget] on this chapter"); }
        for (const w of hosts) {
          const label = rel + " · " + w.name + (w.inEx ? " (in exercise)" : "");
          const problems = [];
          if (!w.mounted) problems.push("no svg/canvas/table inside the host");
          if (w.note) problems.push("failure note shown: " + w.note);
          if (!problems.length) {
            const before = errors.failures().length;
            try {
              const host = page.locator("[data-widget]").nth(w.i);
              /* sliders to both ends, with the input event the widgets listen for */
              await host.evaluate(el => {
                el.querySelectorAll("input[type=range]").forEach(r => {
                  [r.min || "0", r.max || "100", r.min || "0"].forEach(v => {
                    r.value = v;
                    r.dispatchEvent(new Event("input", { bubbles: true }));
                    r.dispatchEvent(new Event("change", { bubbles: true }));
                  });
                });
              });
              /* every chip, one at a time (they may rebuild the figure) */
              const chips = host.locator("button.chip");
              const nChips = await chips.count();
              for (let c = 0; c < nChips; c++) {
                const chip = chips.nth(c);
                /* a chip may be disabled on purpose (a move that would leave the scene's range) */
                if (await chip.isVisible().catch(() => false) && await chip.isEnabled().catch(() => false)) await chip.click({ timeout: 3000 }).catch(e => problems.push("chip " + c + ": " + e.message.split("\n")[0]));
                await page.waitForTimeout(30);
              }
              /* keyboard on the focusable SVG (and any focusable handle inside it) */
              const foc = host.locator("svg[tabindex], svg [tabindex]");
              const nFoc = await foc.count();
              for (let f = 0; f < Math.min(nFoc, 6); f++) {
                const el = foc.nth(f);
                await el.focus().catch(() => {});
                for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Space"]) await page.keyboard.press(key);
              }
              /* give the deferred mission checks and any animation frame a tick */
              await page.evaluate(() => new Promise(r => setTimeout(r, 60)));
              const still = await host.evaluate(el => !!el.querySelector("svg, canvas, table"));
              if (!still) problems.push("figure vanished after interaction");
            } catch (e) { problems.push("driver: " + (e && e.message || e).split("\n")[0]); }
            const fresh = errors.failures().slice(before);
            if (fresh.length) problems.push(...fresh);
          }
          report[problems.length ? "fail" : "pass"](label, problems.length ? problems.join("\n") : (w.ranges + " sliders, " + w.chips + " chips, " + w.focusable + " focusable"));
        }
        /* the painter the 3D stages reached (header): GL everywhere under WebGL 2 */
        if (painters) {
          const label = rel + " · painters";
          const allGL = painters.done && painters.states.every(s => /:gl\/ready$/.test(s));
          const gl = ctx.launch && ctx.launch.webgl;
          const gate = String(ctx.opts.skip || "").split(",").map(s => s.trim()).includes("webgl");
          if (!gl) report.skip(label, "no WebGL probe ran, so the painter is whatever this launch gave: " + painters.states.join(" "));
          else if (!gl.ok) report.skip(label, "no WebGL 2 in this launch, so the SVG fallback: " + painters.states.join(" "));
          else if (allGL) report.pass(label, painters.states.length + " stages on the GL painter under " + gl.renderer);
          else report[gate ? "warn" : "fail"](label, "WebGL 2 is there (" + gl.renderer + ") but not every stage is on the GL painter" + (painters.done ? "" : " after 20 s") + ": " + painters.states.join(" ") + ". A stage on svg/fallback asked for 3D and the GL painter did not start (BM3D.initGL threw or returned nothing, or the loader said " + JSON.stringify(await page.evaluate(() => window.BM3D && window.BM3D.why)) + "); scenes3d.js falls back without a console error, so this is the one check that sees it" + (gate ? ". A warning under --skip=webgl (the gate, not retried); the webgl job's scenes.test.js fails on it" : ""));
        }
        /* anything that went wrong on the page as a whole but outside a host */
        const rest = errors.failures();
        if (rest.length && !hosts.length) report.fail(rel, rest.join("\n"));
      } catch (e) {
        report.fail(rel, "driver error: " + (e && e.stack || e));
      } finally { await close(); }
    }
    report.pass("total", totalHosts + " widget hosts driven on " + ctx.chapterPages.length + " chapters");
  }
};
