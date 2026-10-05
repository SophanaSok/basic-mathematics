"use strict";
/* The game frame and the reading panel (src/styles/tokens.css, assets/site.css), on the
   contents page, a chapter, the Arena and the progress page, in each theme with the
   panel as it comes (light) and as a reader can choose it (bm.prefs.v1 panel: "dark"):
     - html[data-panel] is stamped by the boot script before the first frame, from the
       preference, "light" when there is none;
     - the frame (the body) is dark in both themes, and the theme changes its shade;
     - the panel (.wrap, .wrap-narrow) is light paper in both themes unless the reader
       chose the dark panel, and then it is dark, and its colour scheme follows it;
     - text on the panel and the frame passes axe-core's colour-contrast rule (a
       failure here, where the axe suite only warns);
     - BMGame.setPref("panel", …) switches the panel on the page and keeps it;
     - the first stop of a keyboard walk, the skip link, sits on the dark top bar: its
       ring stands off the bar at 3:1 in both themes;
     - in forced-colours mode the top bar is solid (no see-through glass, no blur);
     - printed, there is no frame: no dark page, no motif, no panel edge, and the dark
       panel's ink is gone (the paper tokens are print's light ones). */

const PAGES = ["index.html", "parts/2-geometry/05-distance-and-angles.html", "arena.html", "progress.html"];

const FIRST_FRAME = () => {
  requestAnimationFrame(() => { window.__panelAtFirstFrame = document.documentElement.getAttribute("data-panel"); });
};

/* what the page shows, measured in the page */
const LOOK = () => {
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s) || []; const p = (m[1] || "").split(/[ ,/]+/).filter(Boolean).map(Number); return p.length >= 3 ? p : null; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const panel = document.querySelector(".wrap, .wrap-narrow");
  const body = rgb(getComputedStyle(document.body).backgroundColor);
  const paper = panel ? rgb(getComputedStyle(panel).backgroundColor) : null;
  return {
    panel: document.documentElement.getAttribute("data-panel"),
    first: window.__panelAtFirstFrame,
    frame: body ? +lum(body).toFixed(4) : null,
    paper: paper ? +lum(paper).toFixed(4) : null,
    scheme: panel ? getComputedStyle(panel).colorScheme : null
  };
};

module.exports = {
  name: "frame",
  order: 45,
  description: "the dark game frame round the reading panel: panel stamped before first paint, frame dark in both themes, panel light unless chosen dark, colour contrast (axe), the panel switch, print",
  async run(ctx) {
    const { h, report } = ctx;
    const pages = PAGES.filter(p => ctx.pages.includes(p));
    const frameOf = {};
    for (const rel of pages) {
      for (const theme of ctx.themes) {
        for (const panel of [null, "dark"]) {
          const label = rel + " [" + theme + (panel ? ", dark panel" : "") + "]";
          const { context, page, errors, close } = await h.newPage({ theme, vw: 1280, storage: panel ? { "bm.prefs.v1": { panel } } : {} });
          const problems = [];
          try {
            await context.addInitScript(FIRST_FRAME);
            await h.open(page, rel);
            const look = await page.evaluate(LOOK);
            const want = panel || "light";
            if (look.panel !== want) problems.push("html[data-panel] is " + JSON.stringify(look.panel) + ", expected " + JSON.stringify(want));
            if (look.first !== want) problems.push("html[data-panel] was " + JSON.stringify(look.first) + " at the first frame, expected " + JSON.stringify(want) + ": the boot script did not stamp it before first paint");
            if (!(look.frame !== null && look.frame < 0.03)) problems.push("the frame (the body's background) is not dark: relative luminance " + look.frame);
            if (want === "light" && !(look.paper > 0.75)) problems.push("the reading panel is not light paper: relative luminance " + look.paper);
            if (want === "dark" && !(look.paper !== null && look.paper < 0.03)) problems.push("the dark panel is not dark: relative luminance " + look.paper);
            if (look.scheme !== want) problems.push("the panel's color-scheme is " + JSON.stringify(look.scheme) + ", expected " + want);
            if (!panel) frameOf[rel + " " + theme] = look.frame;
            if (ctx.chapterOf(rel)) await h.wholePage(page);
            if (ctx.axeSource) {
              await page.addScriptTag({ content: ctx.axeSource });
              const bad = await page.evaluate(async () => {
                const r = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] });
                return r.violations.flatMap(v => v.nodes.slice(0, 4).map(n => n.target.join(" ") + ": " + (n.any[0] && n.any[0].message || v.help)));
              });
              if (bad.length) problems.push("axe colour-contrast: " + bad.join("\n  "));
            }
          } catch (e) {
            problems.push("driver error: " + (e && e.message || e));
          }
          problems.push(...errors.failures());
          await close();
          report[problems.length ? "fail" : "pass"](label, problems.length ? problems.join("\n") : undefined);
        }
      }
      if (frameOf[rel + " light"] !== undefined && frameOf[rel + " dark"] !== undefined && !(frameOf[rel + " light"] > frameOf[rel + " dark"])) {
        report.fail(rel + " [themes]", "the theme does not shade the frame: luminance " + frameOf[rel + " light"] + " (light) and " + frameOf[rel + " dark"] + " (dark)");
      }
    }

    /* the preference, switched on the page, and kept */
    const rel = pages[1] || pages[0];
    {
      const { page, errors, close } = await h.newPage({ theme: "dark", vw: 1280 });
      const problems = [];
      try {
        await h.open(page, rel);
        const before = await page.evaluate(LOOK);
        const after = await page.evaluate(() => { window.BMGame.setPref("panel", "dark"); return JSON.parse(localStorage.getItem("bm.prefs.v1")).panel; });
        const look = await page.evaluate(LOOK);
        if (!(before.paper > 0.75 && look.panel === "dark" && look.paper < 0.03 && after === "dark")) problems.push("BMGame.setPref(\"panel\", \"dark\") did not switch the panel and keep it: " + JSON.stringify({ before, look, stored: after }));
        await page.reload({ waitUntil: "load" });
        const again = await page.evaluate(LOOK);
        if (again.panel !== "dark") problems.push("after a reload the panel is " + JSON.stringify(again.panel) + ", not the dark one chosen");
        await page.evaluate(() => window.BMGame.setPref("panel", "light"));
        if ((await page.evaluate(LOOK)).panel !== "light") problems.push("setPref(\"panel\", \"light\") did not bring the light panel back");
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"](rel + " [the panel preference]", problems.length ? problems.join("\n") : undefined);
    }

    /* the skip link's ring, against the top bar it appears over */
    for (const theme of ctx.themes) {
      const { page, errors, close } = await h.newPage({ theme, vw: 1280 });
      const problems = [];
      try {
        await h.open(page, rel);
        await page.keyboard.press("Tab");
        const ring = await page.evaluate(() => {
          const el = document.activeElement, bar = document.querySelector(".topbar");
          /* rgb()/rgba(), or color(srgb r g b / a) for a color-mix() result */
          const rgb = (s) => {
            let m = /color\(srgb\s+([^)]+)\)/.exec(s);
            if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] === undefined ? 1 : p[3]]; }
            m = /rgba?\(([^)]+)\)/.exec(s) || [];
            const p = (m[1] || "").split(/[ ,/]+/).filter(Boolean).map(Number);
            return p.length >= 3 ? [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]] : null;
          };
          const over = (t, u) => [0, 1, 2].map(i => t[i] * t[3] + u[i] * (1 - t[3]));
          const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
          const cs = getComputedStyle(el);
          const under = over(rgb(getComputedStyle(bar).backgroundColor), rgb(getComputedStyle(document.body).backgroundColor));
          const a = lum(rgb(cs.outlineColor)), b = lum(under);
          return { cls: el.className, style: cs.outlineStyle, colour: cs.outlineColor, ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
        });
        if (!/skip-link/.test(ring.cls)) problems.push("the first Tab stop is " + JSON.stringify(ring.cls) + ", not the skip link");
        else if (ring.style === "none" || !(ring.ratio >= 3)) problems.push("the skip link's ring " + ring.colour + " (" + ring.style + ") stands off the top bar at " + ring.ratio + ":1, needs 3:1");
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"](rel + " [skip link ring, " + theme + "]", problems.length ? problems.join("\n") : undefined);
    }

    /* forced colours: the top bar is solid */
    for (const theme of ctx.themes) {
      const { page, errors, close } = await h.newPage({ theme, vw: 1280 });
      const problems = [];
      try {
        await h.open(page, rel);
        await page.emulateMedia({ forcedColors: "active" });
        const bar = await page.evaluate(() => {
          const cs = getComputedStyle(document.querySelector(".topbar"));
          const m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(cs.backgroundColor) || /\/\s*([\d.]+)\s*\)/.exec(cs.backgroundColor);
          return { bg: cs.backgroundColor, alpha: m ? +m[1] : 1, blur: cs.backdropFilter };
        });
        if (bar.alpha < 1) problems.push("in forced colours the top bar is see-through: " + bar.bg);
        if (bar.blur && bar.blur !== "none") problems.push("in forced colours the top bar still blurs what is under it: " + bar.blur);
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"](rel + " [forced colours, " + theme + "]", problems.length ? problems.join("\n") : undefined);
    }

    /* printed: paper, no frame */
    {
      const { page, errors, close } = await h.newPage({ theme: "dark", vw: 1280, storage: { "bm.prefs.v1": { panel: "dark" } } });
      const problems = [];
      try {
        await h.open(page, rel);
        await page.emulateMedia({ media: "print" });
        const printed = await page.evaluate(() => {
          const panel = document.querySelector(".wrap");
          const cs = getComputedStyle(panel), b = getComputedStyle(document.body), before = getComputedStyle(document.body, "::before");
          const root = getComputedStyle(document.documentElement);
          const ink = {};
          ["--on-accent", "--accent-deep", "--xp-ink", "--focus", "--heart", "--tile-edge"].forEach(t => { ink[t] = root.getPropertyValue(t).trim(); });
          return { body: b.backgroundColor, motif: before.display, edge: cs.borderTopWidth, paper: cs.backgroundColor, text: b.color, ink };
        });
        /* print's light ink (tokens.css @media print), whatever panel the screen showed */
        const PRINT_INK = { "--on-accent": "#ffffff", "--accent-deep": "#17309f", "--xp-ink": "#855600", "--focus": "#2646d4", "--heart": "#c81e4a", "--tile-edge": "#b0a68f" };
        Object.keys(PRINT_INK).forEach(t => { if (printed.ink[t] !== PRINT_INK[t]) problems.push("printed with the dark panel, " + t + " is " + JSON.stringify(printed.ink[t]) + ", not print's " + PRINT_INK[t]); });
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(printed.body)) problems.push("printed, the page still has the frame's background: " + printed.body);
        if (printed.motif !== "none") problems.push("printed, the frame's motif still shows");
        if (printed.edge !== "0px") problems.push("printed, the panel keeps its edge: " + printed.edge);
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(printed.paper)) problems.push("printed, the panel is painted: " + printed.paper);
        if (printed.text !== "rgb(23, 25, 35)") problems.push("printed, the text is not the print ink: " + printed.text);
      } catch (e) { problems.push("driver error: " + (e && e.message || e)); }
      problems.push(...errors.failures());
      await close();
      report[problems.length ? "fail" : "pass"](rel + " [print]", problems.length ? problems.join("\n") : "paper, no frame, print's ink, dark panel or not");
    }
  }
};
