#!/usr/bin/env node
"use strict";
/* Checks on the redirect site, dist-redirects/ (tools/build-redirects.js writes it): what
   GitHub Pages serves at the old address. Node built-ins only, no browser. Run after
   `npm run build:redirects`.

   Usage: node tools/check-redirects.js [--dir=dist-redirects]

   Same shape as check-dist.js: one line per check, exit code 1 on any failure. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const site = require("./lib/site");
const redirects = require("./build-redirects");
const { parse } = require("./lib/html");

const ROOT = site.ROOT;
const ORIGIN = redirects.ORIGIN;
const opts = site.parseArgs(process.argv.slice(2));
const DIR = path.resolve(ROOT, typeof opts.dir === "string" ? opts.dir : "dist-redirects");

function result() {
  const r = { fails: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}
function filesUnder(dir) {
  return site.walk(dir, () => true).map(p => path.relative(dir, p).split(path.sep).join("/")).sort();
}
const scriptOf = (text) => { const m = /<script>([\s\S]*?)<\/script>/.exec(text); return m ? m[1] : null; };

function context() {
  const pages = site.htmlPages(ROOT);
  const files = filesUnder(DIR);
  const docs = {}, text = {};
  files.filter(f => /\.html$/.test(f)).forEach(f => { text[f] = fs.readFileSync(path.join(DIR, f), "utf8"); docs[f] = parse(text[f]); });
  return { pages, files, docs, text, want: redirects.render() };
}

/* (a) a redirect at the path of every page of the site, 404.html, .nojekyll, and nothing
   else: no page of the course, no bundle, no script file */
function checkFiles(ctx, r) {
  const want = ctx.pages.concat(["404.html", ".nojekyll"]).sort();
  want.forEach(f => { r.count++; if (!ctx.files.includes(f)) r.fail(f + " is not in " + site.rel(DIR) + "/"); });
  ctx.files.forEach(f => { r.count++; if (!want.includes(f)) r.fail(site.rel(DIR) + "/ has " + f + ", which the redirect site is not made of"); });
  r.note(ctx.pages.length + " page path(s) of the site, each with its redirect");
}

/* (b) every file is what build-redirects.js writes now (so a stale copy is caught) */
function checkSame(ctx, r) {
  Object.keys(ctx.want.files).forEach(f => {
    r.count++;
    let have = null;
    try { have = fs.readFileSync(path.join(DIR, f), "utf8"); } catch (e) { return; }      /* `files` reports it */
    if (have !== ctx.want.files[f]) r.fail(f + " is not what tools/build-redirects.js writes (run `npm run build:redirects`)");
  });
}

/* (c) each page, read as a page: a canonical link to the page's address at ORIGIN, a
   refresh to it inside <noscript> and a link to it in the text, robots noindex; one
   script, inline, whose hash is the only script its own Content-Security-Policy allows,
   and a policy that allows nothing else to load but the empty data: icon; no stylesheet,
   no style, no script file, no image, no frame, nothing of the course's bundle. Every
   address is on ORIGIN. */
function checkPages(ctx, r) {
  const check = (page, to) => {
    const doc = ctx.docs[page], text = ctx.text[page];
    if (!doc) return;
    const where = page + ": ";
    r.count++;
    const canon = doc.queryAll("link").filter(l => l.getAttribute("rel") === "canonical").map(l => l.getAttribute("href"));
    if (canon.join() !== to) r.fail(where + "canonical link " + JSON.stringify(canon) + ", not " + to);
    const refresh = doc.queryAll("meta").filter(m => (m.getAttribute("http-equiv") || "").toLowerCase() === "refresh");
    if (refresh.length !== 1 || refresh[0].getAttribute("content") !== "0; url=" + to) r.fail(where + "no single refresh to " + to + " (" + refresh.map(m => m.getAttribute("content")).join(", ") + ")");
    else if (!/<noscript><meta http-equiv="refresh"/.test(text)) r.fail(where + "the refresh is not inside <noscript>: it would race the script, which keeps the query and fragment");
    if (!doc.queryAll("a").some(a => a.getAttribute("href") === to)) r.fail(where + "no visible link to " + to);
    const robots = doc.queryAll("meta").filter(m => (m.getAttribute("name") || "").toLowerCase() === "robots").map(m => m.getAttribute("content"));
    if (robots.join() !== "noindex") r.fail(where + "robots " + JSON.stringify(robots) + ", not noindex");
    const scripts = doc.queryAll("script");
    if (scripts.length !== 1 || Object.keys(scripts[0].attrs).length) r.fail(where + scripts.length + " script(s); a redirect has one, inline, with no attributes");
    const links = doc.queryAll("link").filter(l => !(l.getAttribute("rel") === "canonical" || (l.getAttribute("rel") === "icon" && l.getAttribute("href") === "data:,")));
    if (links.length) r.fail(where + "links " + links.map(l => l.getAttribute("rel") + " " + l.getAttribute("href")).join(", "));
    const loads = doc.queryAll("style, img, iframe, object, embed, video, audio, source, picture, svg, form, base, [src], [srcset], [style]");
    if (loads.length) r.fail(where + "holds " + loads.map(e => "<" + e.name + ">").join(", ") + ": a redirect holds its script and its links, nothing else");
    if (/bundle\/|assets\/|src\/entries/.test(text)) r.fail(where + "names a file of the course's build");
    const csp = doc.queryAll("meta").filter(m => (m.getAttribute("http-equiv") || "").toLowerCase() === "content-security-policy").map(m => m.getAttribute("content"));
    const body = scriptOf(text);
    if (csp.length !== 1 || body === null || csp[0] !== redirects.policy(body)) r.fail(where + "its Content-Security-Policy is not exactly its own script by hash and the data: icon (" + csp.join(" | ") + ")");
    else if (text.indexOf("Content-Security-Policy") > text.indexOf("<script>")) r.fail(where + "its Content-Security-Policy comes after the script");
    const hosts = doc.queryAll("a").concat(doc.queryAll("link")).map(e => e.getAttribute("href")).filter(h => h !== "data:,");
    hosts.forEach(h => { if (!/^https:/.test(h || "") || new URL(h).origin !== ORIGIN) r.fail(where + "an address off " + ORIGIN + ": " + h); });
  };
  ctx.pages.forEach(page => check(page, ORIGIN + redirects.targetPath(page)));
  check("404.html", ORIGIN + "/");
}

/* (d) each script run as a browser would run it, in a vm, from an old address: a page
   goes to its own address at ORIGIN with the old query and fragment, and with none when
   there are none; it reads nothing else of the browser (no storage, no cookie, no
   referrer: the vm has none to give); 404.html sends any path to the front page, without
   the old query or fragment */
function runScript(text, href) {
  const u = new URL(href);
  let went = null, times = 0;
  const win = { location: { pathname: u.pathname, search: u.search, hash: u.hash, replace: (to) => { times++; went = to; } } };
  vm.createContext(win);
  vm.runInContext(scriptOf(text) || "", win, { timeout: 1000 });
  return times === 1 ? went : times + " navigations";
}
function checkRun(ctx, r) {
  const OLD = "https://sophanasok.github.io/basic-mathematics/";
  ctx.pages.forEach(page => {
    const to = ORIGIN + redirects.targetPath(page);
    r.count++;
    if (!ctx.text[page]) return;
    [["", ""], ["?mode=review", ""], ["", "#e3"], ["?x=1&y=%2F", "#s2-e3"]].forEach(([q, h]) => {
      [page, page.replace(/\.html$/, "")].forEach(asked => {
        const went = runScript(ctx.text[page], OLD + asked + q + h);
        if (went !== to + q + h) r.fail(page + ": opened as …/" + asked + q + h + " it went to " + went + ", not " + to + q + h);
      });
    });
  });
  r.count++;
  ["parts/1-algebra/", "nope?x=1#y", "parts/1-algebra/99-gone.html"].forEach(asked => {
    const went = runScript(ctx.text["404.html"] || "", OLD + asked);
    if (went !== ORIGIN + "/") r.fail("404.html sent …/" + asked + " to " + went + ", not the front page " + ORIGIN + "/");
  });
}

const CHECKS = [
  { name: "files", run: checkFiles, what: "a redirect at every page path of the site, 404.html, .nojekyll, and nothing else" },
  { name: "same", run: checkSame, what: "every file is what tools/build-redirects.js writes now" },
  { name: "pages", run: checkPages, what: "canonical, <noscript> refresh and visible link to the page's address at " + ORIGIN + ", robots noindex; one inline script, the only thing its policy lets load" },
  { name: "run", run: checkRun, what: "each script sends its old address, with or without .html, to the same page at " + ORIGIN + " with the query and fragment; 404.html to the front page" }
];

(function main() {
  const t0 = Date.now();
  if (!fs.existsSync(DIR)) { console.error("FAIL  setup: no " + site.rel(DIR) + "/ — run `npm run build:redirects` first"); process.exit(1); }
  const ctx = context();
  let anyFail = false;
  for (const c of CHECKS) {
    const r = result();
    try { c.run(ctx, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    if (r.fails.length) anyFail = true;
    console.log((r.fails.length ? "FAIL" : "PASS").padEnd(5) + " " + c.name.padEnd(8) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
  }
  console.log((anyFail ? "FAILED" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + site.rel(DIR) + "/, " + ctx.files.length + " files, to " + ORIGIN + ")");
  process.exit(anyFail ? 1 : 0);
})();
