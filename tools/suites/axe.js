"use strict";
/* axe-core on every page × theme × width, 1280 and 360 (--vw narrows it; whole-page mode on
   chapters). A violation of a rule in STRICT_RULES fails the run; any other is a warning
   (counted by rule), and --strict-axe makes those fail too. Every violating node, with its markup and axe's
   reason, goes to .cache/check/axe.json. Skipped when axe-core does not resolve next to
   Playwright (it is a dev dependency, so after `npm ci` it does). */

const fs = require("fs");
const path = require("path");

/* Rules that fail whatever the flags. Each had violations on the site that were fixed
   where they came from, and is held at zero so it cannot come back:
     button-name, label      a guess chip or a choice whose content is a formula had no
                             name (src/ui/math-names.ts gives it one)
     empty-table-header      a table header that is a formula was empty to assistive
                             technology (the same)
     heading-order           a worked example's heading was an h4 under a section's h2
                             (it is an h3 now, styled as before)
     scrollable-region-focusable
                             at 360px a display formula or a table wider than the column
                             scrolled, and a keyboard could not reach what was past its edge
                             (src/ui/scroll-regions.ts makes it a named tab stop while it
                             overflows); seen only at 360, which is why the suite runs both */
const STRICT_RULES = ["button-name", "label", "empty-table-header", "heading-order", "scrollable-region-focusable"];

module.exports = {
  name: "axe",
  order: 70,
  description: "axe-core accessibility violations per page × theme × width (FAIL for " + STRICT_RULES.join(", ") + "; WARN for the rest unless --strict-axe)",
  STRICT_RULES,
  async run(ctx) {
    const { h, report } = ctx;
    if (!ctx.axeSource) { report.skip("axe-core", "not resolvable from " + require("../lib/pw").from() + " — run `npm ci`"); return; }
    const strict = !!ctx.opts["strict-axe"];
    const fails = (id) => strict || STRICT_RULES.includes(id);
    const byRule = {};
    const every = [];
    let pagesRun = 0;
    for (const rel of ctx.pages) {
      for (const theme of ctx.themes) for (const vw of ctx.vws) {
        const label = rel + " [" + theme + " " + vw + "]";
        const { page, close } = await h.newPage({ theme, vw });
        try {
          await h.open(page, rel);
          if (ctx.chapterOf(rel)) await h.wholePage(page);
          await page.addScriptTag({ content: ctx.axeSource });
          const res = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
            return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(" ")),
              all: v.nodes.map(n => ({ target: n.target.join(" "), html: n.html, why: n.failureSummary })) }));
          });
          pagesRun++;
          res.forEach(v => v.all.forEach(n => every.push({ page: rel, theme, vw, rule: v.id, impact: v.impact, target: n.target, html: n.html, why: n.why })));
          if (!res.length) report.pass(label, "no violations");
          else {
            res.forEach(v => { byRule[v.id] = byRule[v.id] || { count: 0, impact: v.impact, help: v.help, where: [] }; byRule[v.id].count += v.nodes; if (byRule[v.id].where.length < 3) byRule[v.id].where.push(label + " " + v.sample.join(" , ")); });
            report[res.some(v => fails(v.id)) ? "fail" : "warn"](label, res.map(v => v.id + (fails(v.id) ? "" : " [warning]") + " (" + v.impact + ", " + v.nodes + " nodes): " + v.help + " — e.g. " + v.sample.join(" , ")).join("\n"));
          }
        } catch (e) { report.fail(label, "axe driver error: " + (e && e.message || e)); }
        finally { await close(); }
      }
    }
    fs.writeFileSync(path.join(ctx.outDir, "axe.json"), JSON.stringify(every, null, 1));
    const rules = Object.keys(byRule).sort((a, b) => byRule[b].count - byRule[a].count);
    report[rules.length ? (rules.some(fails) ? "fail" : "warn") : "pass"]("by rule (axe-core " + ctx.axeVersion + ", " + pagesRun + " page loads; every node in .cache/check/axe.json)",
      rules.length ? rules.map(r => r + (fails(r) ? "" : " [warning]") + ": " + byRule[r].count + " nodes (" + byRule[r].impact + ") — " + byRule[r].help + "\n    " + byRule[r].where.join("\n    ")).join("\n") : "no violations anywhere");
  }
};
