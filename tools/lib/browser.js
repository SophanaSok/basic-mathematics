"use strict";
/* Helpers the browser suites share: open a page with a forced theme and seeded
   storage, keep a request to another server from stalling it, track what went wrong on
   it and every request it made, wait for KaTeX and the fonts, switch lesson mode, and
   take a screenshot into the output directory. */
const fs = require("fs");
const path = require("path");

const THEME_KEY = "bm.theme";          /* read by the inline boot script (src/boot.js) before first paint, and by initTheme() in site.js */
const LESSON_KEY = "bm.lesson.v1";
const PROGRESS_KEY = "bm.progress.v1";
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 360: { width: 360, height: 740 } };

function slug(rel) { return rel.replace(/\.html$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, ""); }

/* Everything that went wrong while a page was open, and every request it made: `own`
   is those to the local server (the chunks fetched on demand are read off it:
   bundle/three.js on a page with no 3D is a failure in the pages suite), `requests`
   those to any other server. Same-origin trouble is a failure. Nothing a page needs
   comes from another server since the fonts, KaTeX, supabase-js and Three.js moved
   into the bundle, so every request off the local server is `unexpected`, and the
   pages suite fails on it: a signed-out reader's browser contacts no one else. A
   third-party resource that did not arrive is still noted apart (`thirdParty`), for
   the suite that checks such a request cannot stall a run. */
function track(page, originUrl) {
  const t = { console: [], pageErrors: [], notFound: [], thirdParty: [], requests: [], own: [] };
  const sameOrigin = (u) => u.startsWith(originUrl);
  page.on("request", req => { (sameOrigin(req.url()) ? t.own : t.requests).push(req.url()); });
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
  /* the requests off the local server, each once: every one is a failure */
  t.unexpected = () => Array.from(new Set(t.requests));
  t.reset = () => { t.console.length = 0; t.pageErrors.length = 0; t.notFound.length = 0; t.thirdParty.length = 0; t.requests.length = 0; t.own.length = 0; };
  return t;
}

/* ---- third-party requests ------------------------------------------------------
   No page asks another server for anything any more (Three.js was the last, from a
   CDN, until it moved into the bundle; the pages suite fails any such request). What
   is kept here is what makes that failure a line in the report and not the end of the
   run: left to Chromium, a request that neither answers nor fails holds whatever waits
   on it until page.goto times out, and one such stall among the several hundred page
   loads of a run failed the run, back when the pages did load from CDNs. So every
   request that is not for the local server is answered from here instead: fetched by
   Node under a deadline, once per run, and repeated to every later page from memory. A
   request that fails or runs out of time is aborted, which the page sees as a failed
   request and track() notes as a third-party warning, beside the failure.
   A host that did not answer is then left alone for a while: its requests are aborted
   at once. That is what keeps a page inside page.goto's 15 s when the whole network
   stalls and a page asks one host after another: the chain waits once per host, not
   once per request. The `thirdparty` suite holds this to a stand-in CDN. */
const THIRD_PARTY_MS = 4000;
const THIRD_PARTY_RETRY_MS = 30000;
const FORWARDED = ["user-agent", "accept", "accept-language", "origin", "referer"];   /* so the other server answers as it would the browser (a crossorigin script's CORS headers depend on the Origin asked with) */
const HOP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);   /* fetch() has decoded the body */
const answers = new Map();               /* URL -> Promise<{ status, headers, body } | { error }>, kept when it is a good answer */
const quiet = new Map();                 /* host -> { at, error }: the last time it did not answer */

async function fetchThirdParty(request) {
  const all = await request.allHeaders();
  const headers = {};
  FORWARDED.forEach(k => { if (all[k]) headers[k] = all[k]; });
  const method = request.method();
  const body = method === "GET" || method === "HEAD" ? undefined : request.postDataBuffer() || undefined;
  if (body && all["content-type"]) headers["content-type"] = all["content-type"];
  /* the signal covers the body too: a response that starts and never ends is cut off */
  const res = await fetch(request.url(), { method, headers, body, redirect: "follow", signal: AbortSignal.timeout(THIRD_PARTY_MS) });
  const out = {};
  res.headers.forEach((v, k) => { if (!HOP.has(k)) out[k] = v; });
  return { status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) };
}

async function answerThirdParty(route) {
  const request = route.request();
  const url = request.url(), host = new URL(url).host;
  const key = request.method() === "GET" ? url : null;
  let answer = key && answers.get(key);
  if (!answer) {
    const q = quiet.get(host);
    if (q && Date.now() - q.at < THIRD_PARTY_RETRY_MS) answer = Promise.resolve({ error: q.error });
    else {
      answer = fetchThirdParty(request).then(
        a => { if (a.status >= 400 && key) answers.delete(key); return a; },          /* an error page is passed on, and asked for again next time */
        error => { quiet.set(host, { at: Date.now(), error }); if (key) answers.delete(key); return { error }; });
      if (key) answers.set(key, answer);
    }
  }
  const a = await answer;
  try {
    if (a.error) await route.abort(a.error.name === "TimeoutError" ? "timedout" : "failed");
    else await route.fulfill({ status: a.status, headers: a.headers, body: a.body });
  } catch (e) { /* the page went away first */ }
}

function makeHelpers(ctx) {
  const { browser, server, outDir } = ctx;

  /* A browser context whose third-party requests are answered as above. Every context
     a suite opens comes from here (newPage below, or directly when a suite needs its
     own options): one opened with browser.newContext could be stalled by a request to
     another server, and the `thirdparty` suite fails a suite that does it. */
  async function newContext(options) {
    const context = await browser.newContext(options);
    await context.route(u => { const s = typeof u === "string" ? u : u.href; return /^https?:/.test(s) && !s.startsWith(server.url); }, answerThirdParty);
    return context;
  }

  /* a fresh context (so clean storage) and page.
       theme: "light" | "dark"        stored under bm.theme the way site.js stores it (JSON)
       vw: 1280 | 360                  viewport preset
       storage: { key: value }         extra localStorage seeds (values JSON-stringified)
       reducedMotion, noWebGL, headedSlow */
  async function newPage(o) {
    o = o || {};
    const theme = o.theme || "light";
    const context = await newContext({
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
    /* the site scrolls smoothly; a click far down a long chapter would then chase an
       animated scroll for seconds, which Playwright reads as an unstable element */
    await context.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.scrollBehavior = "auto"; });
    });
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

  /* load plus KaTeX plus fonts plus a quiet network, with a cap so an offline run still
     ends. KaTeX comes in the page's module entry (src/vendor/katex.js), which has run by
     the load event unless the bundle failed; the wait is for that failure not to hang
     the run, and the pages suite reports the missing globals. */
  async function settle(page) {
    await page.waitForLoadState("load");
    await page.evaluate(async () => {
      const hasEntry = !!document.querySelector('script[type="module"]');
      if (hasEntry) {
        const t0 = Date.now();
        while (!(window.katex && window.renderMathInElement) && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 50));
      }
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4000))]);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch (e) { /* a request still open (a stray third-party one under its deadline): carry on */ }
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

  return { newContext, newPage, noWebGL, blockUrl, settle, open, wholePage, screenshot, slug, VIEWPORTS, THEME_KEY, LESSON_KEY, PROGRESS_KEY };
}

module.exports = { makeHelpers, track, slug, VIEWPORTS, THEME_KEY, LESSON_KEY, PROGRESS_KEY, THIRD_PARTY_MS };
