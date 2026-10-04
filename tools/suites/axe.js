"use strict";
/* axe-core on every page × theme at 1280. Violations are warnings for now (counted by
   rule); --strict-axe turns them into failures. Skipped when axe-core does not resolve
   next to Playwright. */

module.exports = {
  name: "axe",
  order: 70,
  description: "axe-core accessibility violations per page × theme (WARN unless --strict-axe)",
  async run(ctx) {
    const { h, report } = ctx;
    if (!ctx.axeSource) { report.skip("axe-core", "not resolvable from " + require("../lib/pw").from() + " — set BM_PLAYWRIGHT_FROM to a node_modules that has axe-core"); return; }
    const strict = !!ctx.opts["strict-axe"];
    const byRule = {};
    let pagesRun = 0;
    for (const rel of ctx.pages) {
      for (const theme of ctx.themes) {
        const { page, close } = await h.newPage({ theme, vw: 1280 });
        try {
          await h.open(page, rel);
          if (ctx.chapterOf(rel)) await h.wholePage(page);
          await page.addScriptTag({ content: ctx.axeSource });
          const res = await page.evaluate(async () => {
            const r = await window.axe.run(document, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: true } } });
            return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(" ")) }));
          });
          pagesRun++;
          const label = rel + " [" + theme + "]";
          if (!res.length) report.pass(label, "no violations");
          else {
            res.forEach(v => { byRule[v.id] = byRule[v.id] || { count: 0, impact: v.impact, help: v.help, where: [] }; byRule[v.id].count += v.nodes; if (byRule[v.id].where.length < 3) byRule[v.id].where.push(label + " " + v.sample.join(" , ")); });
            report[strict ? "fail" : "warn"](label, res.map(v => v.id + " (" + v.impact + ", " + v.nodes + " nodes): " + v.help + " — e.g. " + v.sample.join(" , ")).join("\n"));
          }
        } catch (e) { report.fail(rel + " [" + theme + "]", "axe driver error: " + (e && e.message || e)); }
        finally { await close(); }
      }
    }
    const rules = Object.keys(byRule).sort((a, b) => byRule[b].count - byRule[a].count);
    report[rules.length ? (strict ? "fail" : "warn") : "pass"]("by rule (axe-core " + ctx.axeVersion + ", " + pagesRun + " page loads)",
      rules.length ? rules.map(r => r + ": " + byRule[r].count + " nodes (" + byRule[r].impact + ") — " + byRule[r].help + "\n    " + byRule[r].where.join("\n    ")).join("\n") : "no violations anywhere");
  }
};
