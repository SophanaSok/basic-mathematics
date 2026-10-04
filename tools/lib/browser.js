"use strict";
/* Helpers the browser suites share: open a page with a forced theme and seeded
   storage, track what went wrong on it, wait for KaTeX, switch lesson mode, and
   take a screenshot into the output directory. */
const fs = require("fs");
const path = require("path");

const THEME_KEY = "bm.theme";          /* read by initTheme() in site.js (and boot.js when it lands) */
const LESSON_KEY = "bm.lesson.v1";
const PROGRESS_KEY = "bm.progress.v1";
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 360: { width: 360, height: 740 } };

function slug(rel) { return rel.replace(/\.html$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, ""); }

/* Everything that went wrong while a page was open. Same-origin trouble is a failure;
   a third-party resource that did not arrive (fonts, the KaTeX CDN) is a warning,
   because a local run may well be offline. */
function track(page, originUrl) {
  const t = { console: [], pageErrors: [], notFound: [], thirdParty: [] };
  const sameOrigin = (u) => u.startsWith(originUrl) || u.startsWith("file://");
  page.on("console", msg => {
    if (msg.type() !== "error") return;
    const loc = msg.location() || {};
    const text = msg.text();
    const url = loc.url || "";
    if ((url && !sameOrigin(url)) || /^Failed to load resource/.test(text) && !sameOrigin(url)) {
      t.thirdParty.push(text + (url ? " @ " + url : ""));
      return;
    }
    t.console.push(text + (url ? " @ " + url + ":" + loc.lineNumber : ""));
  });
  page.on("pageerror", err => { t.pageErrors.push(String(err && err.message || err)); });
  page.on("response", res => {
    const url = res.url();
    if (res.status() < 400) return;
    if (sameOrigin(url)) t.notFound.push(res.status() + " " + url);
    else t.thirdParty.push(res.status() + " " + url);
  });
  page.on("requestfailed", req => {
    const url = req.url();
    const why = (req.failure() || {}).errorText || "failed";
    if (why === "net::ERR_ABORTED") return;             /* navigation away, not a failure */
    if (sameOrigin(url)) t.notFound.push(why + " " + url);
    else t.thirdParty.push(why + " " + url);
  });
  t.failures = () => t.console.concat(t.pageErrors.map(e => "pageerror: " + e), t.notFound.map(n => "same-origin " + n));
  t.reset = () => { t.console.length = 0; t.pageErrors.length = 0; t.notFound.length = 0; t.thirdParty.length = 0; };
  return t;
}

function makeHelpers(ctx) {
  const { browser, server, outDir } = ctx;

  /* a fresh context (so clean storage) and page.
       theme: "light" | "dark"        stored under bm.theme the way site.js stores it (JSON)
       vw: 1280 | 360                  viewport preset
       storage: { key: value }         extra localStorage seeds (values JSON-stringified)
       reducedMotion, noWebGL, headedSlow */
  async function newPage(o) {
    o = o || {};
    const theme = o.theme || "light";
    const context = await browser.newContext({
      viewport: VIEWPORTS[o.vw || 1280],
      colorScheme: theme,
      reducedMotion: o.reducedMotion || "no-preference",
      deviceScaleFactor: 1,
      serviceWorkers: "block"
    });
    const seeds = Object.assign({ [THEME_KEY]: theme }, o.storage || {});
    await context.addInitScript((seeds) => {
      try { Object.keys(seeds).forEach(k => localStorage.setItem(k, JSON.stringify(seeds[k]))); } catch (e) { /* storage blocked */ }
    }, seeds);
    if (o.noWebGL) await noWebGL(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = track(page, server.url);
    return { context, page, errors, theme, vw: o.vw || 1280, close: () => context.close() };
  }

  /* Make every canvas refuse a WebGL context: what a locked-down or very old
     browser looks like, so scenes must degrade rather than throw. */
  async function noWebGL(contextOrPage) {
    await contextOrPage.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (/^(webgl|webgl2|experimental-webgl)$/.test(String(type))) return null;
        return orig.apply(this, arguments);
      };
      if (window.OffscreenCanvas) {
        const o2 = OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext = function (type) {
          if (/^(webgl|webgl2|experimental-webgl)$/.test(String(type))) return null;
          return o2.apply(this, arguments);
        };
      }
    });
  }

  /* abort every request whose URL matches (string substring or RegExp) */
  async function blockUrl(page, pattern) {
    const test = typeof pattern === "string" ? (u) => u.indexOf(pattern) !== -1 : (u) => pattern.test(u);
    await page.route(u => test(typeof u === "string" ? u : u.href), route => route.abort("blockedbyclient"));
  }

  /* load plus KaTeX plus fonts plus a quiet network, with a cap so an offline run still ends */
  async function settle(page) {
    await page.waitForLoadState("load");
    await page.evaluate(async () => {
      const hasKatex = !!document.querySelector('script[src*="katex"]');
      if (hasKatex) {
        const t0 = Date.now();
        while (!(window.katex && window.renderMathInElement) && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 50));
      }
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4000))]);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch (e) { /* offline or slow CDN: carry on */ }
  }

  async function open(page, rel, o) {
    o = o || {};
    const base = o.fromBase ? server.baseUrl : server.url;
    await page.goto(base + rel + (o.hash ? "#" + o.hash : ""), { waitUntil: "load" });
    await settle(page);
  }

  /* lesson.js: the "Whole page" button in .lesson-mode; body[data-lesson] says which mode is on */
  async function wholePage(page) {
    const has = await page.evaluate(() => !!document.querySelector(".lesson-mode"));
    if (!has) return false;
    await page.locator(".lesson-mode button", { hasText: "Whole page" }).click();
    await page.waitForFunction(() => document.body.getAttribute("data-lesson") === "page");
    return true;
  }

  async function screenshot(page, name, o) {
    const rel = name.replace(/[^a-zA-Z0-9/_.-]+/g, "-") + ".png";
    const abs = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await page.screenshot(Object.assign({ path: abs, fullPage: true, animations: "disabled", caret: "hide" }, o || {}));
    return rel;
  }

  return { newPage, noWebGL, blockUrl, settle, open, wholePage, screenshot, slug, VIEWPORTS, THEME_KEY, LESSON_KEY, PROGRESS_KEY };
}

module.exports = { makeHelpers, track, slug, VIEWPORTS, THEME_KEY, LESSON_KEY, PROGRESS_KEY };
