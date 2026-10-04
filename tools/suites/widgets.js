"use strict";
/* Every interactive figure mounts (an <svg> or <canvas> inside, no failure note), and
   survives being driven: each range slider to both ends, each chip clicked, and the
   arrow keys and Space on a focusable SVG. Any exception fails. */

module.exports = {
  name: "widgets",
  order: 20,
  description: "every [data-widget] mounts and survives sliders at both ends, every chip, and keyboard on its SVG",
  async run(ctx) {
    const { h, report } = ctx;
    let totalHosts = 0;
    for (const rel of ctx.chapterPages) {
      const { page, errors, close } = await h.newPage({ theme: "light", vw: 1280 });
      try {
        await h.open(page, rel);
        await h.wholePage(page);
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
                if (await chip.isVisible().catch(() => false)) await chip.click({ timeout: 3000 }).catch(e => problems.push("chip " + c + ": " + e.message.split("\n")[0]));
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
