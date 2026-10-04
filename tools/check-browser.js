#!/usr/bin/env node
"use strict";
/* Browser checks for the site, driven by Playwright (resolved from a sibling project;
   see lib/pw.js and BM_PLAYWRIGHT_FROM).

   Usage: node tools/check-browser.js [--only=<substring>] [--theme=light|dark] [--vw=1280|360]
                                      [--base=<ref>] [--headed] [--strict-axe] [--list]

   --only      a suite name (or several, comma-separated) runs just those suites; anything
               else is matched against page paths and narrows every suite to those pages
   --theme     one theme instead of both;  --vw one viewport instead of both
   --base      git ref whose exercise keys the restore suite seeds (default lib/site.js)
   --headed    show the browser
   --strict-axe   axe violations fail the run instead of warning
   --list      print the suites and leave

   Output: .cache/check/  — screenshots, report.json, index.html (a contact sheet).
   Exit code 1 on any failure.

   ---- Suite interface ------------------------------------------------------------
   A suite is a file in tools/suites/ exporting:
     name         string, unique; what --only matches
     order        number; lower runs first (webgl is 0 and always probes before launch)
     description  one line for --list and the report
     run(ctx)     async; records results through ctx.report and returns nothing
   ctx has:
     pw, browser            the playwright module and the launched Chromium
     launch                 { args, webgl: {ok, renderer, ...} } chosen by the WebGL probe
     server                 { url, baseUrl }  — the working tree, and /__base/<path> at --base
     root, base, outDir     repo root, git ref, output directory
     pages, chapterPages    discovered HTML pages (filtered by --only when it names pages)
     chapterOf(rel)         chapter id of a page, or null
     curriculum             data/curriculum.js evaluated
     themes, vws            ["light","dark"] and [1280, 360] as filtered by the flags
     opts                   parsed flags
     h                      helpers from lib/browser.js: newPage, open, settle, wholePage,
                            screenshot, noWebGL, blockUrl
     report                 pass(name, detail?), fail(name, detail), warn(name, detail),
                            skip(name, why), cell({...}) for the contact sheet
     axeSource              axe-core source text, or null when it did not resolve
   Drop a new file in tools/suites/ and it runs; nothing else needs registering.
   ------------------------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");

const site = require("./lib/site");
const git = require("./lib/git");
const { parse } = require("./lib/html");
const serve = require("./lib/serve");
const browserLib = require("./lib/browser");

const ROOT = site.ROOT;
const opts = site.parseArgs(process.argv.slice(2));
const BASE = opts.base || site.DEFAULT_BASE;
const OUT = path.join(ROOT, ".cache", "check");

/* ------------------------------------------------------------ reporter --- */

function makeReport() {
  const suites = {};
  let current = null;
  const cells = [];
  const R = {
    begin(name, description) { current = suites[name] = { name, description, pass: 0, fail: 0, warn: 0, skip: 0, results: [], ms: 0, started: Date.now() }; },
    end() { if (current) current.ms = Date.now() - current.started; current = null; },
    add(status, name, detail) {
      current[status]++;
      current.results.push({ status, name, detail: detail === undefined ? null : detail });
      const mark = { pass: "  ok  ", fail: " FAIL ", warn: " warn ", skip: " skip " }[status];
      if (status !== "pass" || opts.verbose) {
        console.log("   " + mark + " " + name + (detail ? "\n          " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).split("\n").join("\n          ") : ""));
      }
    },
    pass(n, d) { R.add("pass", n, d); }, fail(n, d) { R.add("fail", n, d); }, warn(n, d) { R.add("warn", n, d); }, skip(n, d) { R.add("skip", n, d); },
    cell(c) { cells.push(c); },
    suites, cells,
    anyFail() { return Object.values(suites).some(s => s.fail > 0); }
  };
  return R;
}

/* --------------------------------------------------------- contact sheet -- */

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function writeIndex(report, meta) {
  const cells = report.cells;
  const pages = Array.from(new Set(cells.map(c => c.page)));
  const fails = [];
  Object.values(report.suites).forEach(s => s.results.filter(r => r.status === "fail").forEach(r => fails.push({ suite: s.name, name: r.name, detail: r.detail })));
  const warns = [];
  Object.values(report.suites).forEach(s => s.results.filter(r => r.status === "warn").forEach(r => warns.push({ suite: s.name, name: r.name, detail: r.detail })));
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>check-browser report</title>
<style>
:root{color-scheme:light dark;--ok:#1d7a45;--bad:#a52a2d;--warn:#8a6d00;--line:#8884;--bg:Canvas;--fg:CanvasText}
body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:1rem 1.25rem;background:var(--bg);color:var(--fg)}
h1{font-size:1.25rem;margin:.2rem 0}h2{font-size:1.05rem;margin:1.6rem 0 .5rem}
.meta{color:#888;font-size:.85rem}
table{border-collapse:collapse;width:100%}td,th{border-top:1px solid var(--line);padding:.4rem .5rem;vertical-align:top;text-align:left}
.ok{color:var(--ok)}.fail{color:var(--bad);font-weight:600}.warn{color:var(--warn)}.skip{color:#888}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.9rem}
.cellbox{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:color-mix(in srgb,Canvas 92%,CanvasText)}
.cellbox img{width:100%;height:160px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:4px;background:#fff}
.cellbox .lbl{font-size:.8rem;display:flex;justify-content:space-between;margin-bottom:.3rem}
details{margin:.2rem 0}summary{cursor:pointer}pre{white-space:pre-wrap;font-size:.8rem;margin:.3rem 0 .6rem;color:#666}
.sum span{display:inline-block;margin-right:1rem}
</style></head><body>
<h1>check-browser report</h1>
<p class="meta">${esc(meta.startedAt)} · ${(meta.durationMs / 1000).toFixed(1)}s · base ${esc(meta.base)} · Playwright ${esc(meta.playwright)} · WebGL ${meta.launch.webgl && meta.launch.webgl.ok ? "ok (" + esc(meta.launch.webgl.renderer) + ") with args " + esc(JSON.stringify(meta.launch.args)) : "unavailable"}</p>
<p class="sum">${Object.values(report.suites).map(s => `<span><b>${esc(s.name)}</b> <span class="${s.fail ? "fail" : "ok"}">${s.pass} ok / ${s.fail} fail</span>${s.warn ? ` <span class="warn">${s.warn} warn</span>` : ""}${s.skip ? ` <span class="skip">${s.skip} skip</span>` : ""} <span class="meta">${(s.ms / 1000).toFixed(0)}s</span></span>`).join("")}</p>`;
  html += `<h2>Failures (${fails.length})</h2>` + (fails.length ? `<table>${fails.map(f => `<tr><td><b>${esc(f.suite)}</b></td><td>${esc(f.name)}</td><td><pre>${esc(typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail, null, 1))}</pre></td></tr>`).join("")}</table>` : "<p class=ok>none</p>");
  html += `<h2>Warnings (${warns.length})</h2>` + (warns.length ? `<details><summary>show</summary><table>${warns.map(f => `<tr><td><b>${esc(f.suite)}</b></td><td>${esc(f.name)}</td><td><pre>${esc(typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail, null, 1))}</pre></td></tr>`).join("")}</table></details>` : "<p class=ok>none</p>");
  html += `<h2>Pages (${pages.length} × ${cells.length / Math.max(1, pages.length)} cells)</h2>`;
  pages.forEach(p => {
    const mine = cells.filter(c => c.page === p);
    html += `<h3 style="font-size:.95rem;margin:1.2rem 0 .4rem">${esc(p)}</h3><div class="grid">` + mine.map(c => `<div class="cellbox"><div class="lbl"><span>${esc(c.theme)} · ${c.vw}px</span><span class="${c.status}">${c.status}</span></div>${c.screenshot ? `<a href="${esc(c.screenshot)}" target="_blank"><img loading="lazy" src="${esc(c.screenshot)}" alt=""></a>` : ""}${c.detail ? `<pre>${esc(c.detail)}</pre>` : ""}</div>`).join("") + `</div>`;
  });
  html += `<h2>All results</h2>` + Object.values(report.suites).map(s => `<details><summary><b>${esc(s.name)}</b> — ${esc(s.description)} (${s.pass} ok, ${s.fail} fail, ${s.warn} warn, ${s.skip} skip)</summary><table>${s.results.map(r => `<tr><td class="${r.status}">${r.status}</td><td>${esc(r.name)}</td><td>${r.detail ? `<pre>${esc(typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail, null, 1))}</pre>` : ""}</td></tr>`).join("")}</table></details>`).join("");
  html += "</body></html>";
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}

/* --------------------------------------------------------------- main ---- */

function loadSuites() {
  const dir = path.join(__dirname, "suites");
  return fs.readdirSync(dir).filter(f => /\.js$/.test(f)).map(f => {
    const s = require(path.join(dir, f));
    if (!s.name || typeof s.run !== "function") throw new Error("tools/suites/" + f + " must export { name, run }");
    s.order = s.order === undefined ? 50 : s.order;
    s.file = f;
    return s;
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

async function main() {
  const t0 = Date.now();
  const allSuites = loadSuites();
  if (opts.list) { allSuites.forEach(s => console.log(s.name.padEnd(10) + " " + s.description)); return 0; }

  let pwInfo;
  try { pwInfo = require("./lib/pw").resolvePlaywright(); }
  catch (e) { console.error(e.message); return 2; }
  const pw = pwInfo.pw;

  const baseSha = git.resolveRef(ROOT, BASE);
  if (!baseSha) { console.error("base ref " + BASE + " does not resolve"); return 2; }

  /* --only: suite names first, else a page filter */
  const only = opts.only ? String(opts.only).split(",").map(s => s.trim()).filter(Boolean) : [];
  const suiteMatches = only.filter(o => allSuites.some(s => s.name === o || s.name.includes(o)));
  const pageFilters = only.filter(o => !suiteMatches.includes(o));
  const suites = suiteMatches.length ? allSuites.filter(s => suiteMatches.some(o => s.name === o || s.name.includes(o))) : allSuites;

  let pages = site.htmlPages(ROOT);
  if (pageFilters.length) pages = pages.filter(p => pageFilters.some(f => p.includes(f)));
  if (!pages.length) { console.error("no page matches " + pageFilters.join(",")); return 2; }
  const docs = {};
  pages.forEach(p => { docs[p] = parse(fs.readFileSync(path.join(ROOT, p), "utf8")); });
  const chapterOf = (rel) => docs[rel] ? site.chapterIdOf(docs[rel]) : null;
  const chapterPages = pages.filter(p => chapterOf(p));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const server = await serve.start(ROOT, BASE);
  const report = makeReport();
  const ctx = {
    pw, browser: null, launch: null, server, root: ROOT, base: BASE, baseSha, outDir: OUT,
    pages, chapterPages, chapterOf, docs, curriculum: site.curriculum(ROOT),
    themes: opts.theme ? [String(opts.theme)] : ["light", "dark"],
    vws: opts.vw ? [parseInt(opts.vw, 10)] : [1280, 360],
    opts, report, axeSource: pwInfo.axeSource, axeVersion: pwInfo.axeVersion, h: null
  };
  console.log("serving " + ROOT + " at " + server.url + " (base " + BASE + " = " + baseSha.slice(0, 10) + " under /__base/); Playwright " + pwInfo.version + " from " + pwInfo.from);

  /* the WebGL probe decides how Chromium is launched for everything else */
  const webgl = allSuites.find(s => s.name === "webgl");
  ctx.launch = webgl && webgl.probe ? await webgl.probe(ctx) : { args: [], webgl: null };
  ctx.browser = await pw.chromium.launch({ headless: !opts.headed, args: ctx.launch.args });
  ctx.h = browserLib.makeHelpers(ctx);

  for (const s of suites) {
    console.log("\n== " + s.name + " — " + s.description);
    report.begin(s.name, s.description);
    const ts = Date.now();
    try { await s.run(ctx); }
    catch (e) { report.fail("suite crashed", (e && e.stack) || String(e)); }
    report.end();
    const r = report.suites[s.name];
    console.log("   " + s.name + ": " + r.pass + " ok, " + r.fail + " fail, " + r.warn + " warn, " + r.skip + " skip (" + ((Date.now() - ts) / 1000).toFixed(1) + "s)");
  }

  await ctx.browser.close();
  await server.close();

  const meta = { startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, base: BASE, baseSha, playwright: pwInfo.version, playwrightFrom: pwInfo.from, axe: pwInfo.axeVersion, launch: ctx.launch, pages, themes: ctx.themes, vws: ctx.vws, only: only };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(Object.assign({}, meta, { suites: report.suites, cells: report.cells }), null, 1));
  writeIndex(report, meta);
  const totals = Object.values(report.suites).reduce((a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail, warn: a.warn + s.warn, skip: a.skip + s.skip }), { pass: 0, fail: 0, warn: 0, skip: 0 });
  console.log("\n" + (report.anyFail() ? "FAILED" : "passed") + ": " + totals.pass + " ok, " + totals.fail + " fail, " + totals.warn + " warn, " + totals.skip + " skip in " + ((Date.now() - t0) / 1000).toFixed(1) + "s — " + path.relative(ROOT, path.join(OUT, "index.html")));
  return report.anyFail() ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e && e.stack || e); process.exit(2); });
