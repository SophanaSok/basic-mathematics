"use strict";
/* WebGL availability in headless Chromium. Runs first: `probe` is called by the runner
   before the shared browser is launched and its winning arg set becomes ctx.launch.
   Exports the helpers scene suites will want: ARG_SETS, probe, and (via ctx.h) the
   noWebGL / blockUrl helpers that live in lib/browser.js. */
const path = require("path");
const browserLib = require("../lib/browser");

const ARG_SETS = [
  ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  []
];

const FIXTURE = "tools/fixtures/webgl-probe.html";

async function probeWith(pw, args, url, headed, noWebGL) {
  const browser = await pw.chromium.launch({ headless: !headed, args });
  try {
    const context = await browser.newContext();
    if (noWebGL) await context.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (/^(webgl|webgl2|experimental-webgl)$/.test(String(type))) return null;
        return orig.apply(this, arguments);
      };
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    const res = await page.evaluate(() => window.__probe);
    await context.close();
    return res;
  } finally {
    await browser.close();
  }
}

/* try each arg set in order; the first that yields a working context wins */
async function probe(ctx) {
  const url = ctx.server.url + FIXTURE;
  const tried = [];
  for (const args of ARG_SETS) {
    let res;
    try { res = await probeWith(ctx.pw, args, url, !!ctx.opts.headed); }
    catch (e) { res = { ok: false, error: "launch failed: " + (e && e.message || e) }; }
    tried.push({ args, result: res });
    if (res && res.ok) {
      console.log("WebGL: available with args " + JSON.stringify(args) + " — " + res.renderer + " (" + res.context + ")");
      return { args, webgl: res, tried };
    }
  }
  console.log("WebGL: NOT available with any arg set; launching with no extra args");
  return { args: [], webgl: null, tried };
}

module.exports = {
  name: "webgl",
  order: 0,
  description: "WebGL context in headless Chromium (chooses the launch args for every other suite)",
  ARG_SETS, probe, FIXTURE,
  async run(ctx) {
    const L = ctx.launch || {};
    (L.tried || []).forEach(t => {
      const r = t.result || {};
      ctx.report[r.ok ? "pass" : "warn"]("args " + JSON.stringify(t.args), r.ok ? r.renderer + " via " + r.context : (r.error || "no context"));
    });
    if (L.webgl && L.webgl.ok) ctx.report.pass("launch config", "args " + JSON.stringify(L.args) + "; renderer: " + L.webgl.renderer + "; vendor: " + L.webgl.vendor + "; " + L.webgl.version);
    else ctx.report.fail("launch config", "no arg set produced a WebGL context; 3D scenes cannot be exercised on this machine. Tried: " + JSON.stringify(L.tried));
    /* the no-WebGL helper must actually remove WebGL, or the degrade-path tests mean nothing */
    const { page, close } = await ctx.h.newPage({ noWebGL: true });
    try {
      await ctx.h.open(page, FIXTURE);
      const res = await page.evaluate(() => window.__probe);
      if (res && res.ok) ctx.report.fail("noWebGL helper", "a context was still created: " + JSON.stringify(res));
      else ctx.report.pass("noWebGL helper", "getContext('webgl*') returns null under the init script");
    } finally { await close(); }
    /* and blockUrl must block: with every built chunk refused the page has no script
       but the inline boot, so nothing of the site's (widgets.js's BMPlot, for one) is
       there, while the page itself still loads */
    const p2 = await ctx.h.newPage({});
    try {
      await ctx.h.blockUrl(p2.page, /\/assets\/[^?#]*\.js(?:[?#]|$)/);
      await ctx.h.open(p2.page, ctx.chapterPages[0] || "index.html");
      const hasWidgets = await p2.page.evaluate(() => !!window.BMPlot);
      if (hasWidgets) ctx.report.fail("blockUrl helper", "the site's scripts still ran while every chunk under assets/ was blocked");
      else ctx.report.pass("blockUrl helper", "blocked every .js under assets/; page still loaded (" + p2.errors.pageErrors.length + " page errors, " + p2.errors.notFound.length + " same-origin failures, as expected from the block)");
    } finally { await p2.close(); }
  }
};
