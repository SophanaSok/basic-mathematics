#!/usr/bin/env node
"use strict";
/* The legacy site: what GitHub Pages serves at the old address once the site has moved
   to Cloudflare Pages (OPERATIONS.md, "Moving to Cloudflare Pages"). It does one job:
   it takes each reader to the same page at the new address, and brings the progress
   their browser saved at the old address with them (localStorage belongs to an
   origin, so the new address starts empty).

   Usage: node tools/build-legacy.js [--out=dist-legacy] [--origin=<new address>] [--base=<path>]
     --out     where to write it (default dist-legacy/)
     --origin  the new address (default ORIGIN in src/carry/origins.ts); the browser test
               points it at a local server
     --base    the path the legacy site is served under (default the path of LEGACY in
               src/carry/origins.ts, /basic-mathematics/), for 404.html and the carry page

   What it writes, every file standalone (no shell, no bundle, nothing of the course):
     <page>          one stub at the path of every page of the site (lib/site.js
                     htmlPages, the pages `npm run build` writes): its first and only
                     script is src/carry/send.js, inlined, which reads this browser's bm.*
                     keys and goes to the page's new address with them in the fragment,
                     or without when there is nothing to bring, or to the carry page when
                     they are too long for an address; a meta refresh to the new address,
                     inside <noscript> so it cannot fire before the script has finished,
                     and a visible link, for a browser without scripts; a canonical link
                     to the new address. The new address of a page is its path without
                     .html, and the root for index.html, which is where Cloudflare Pages
                     serves it (it redirects the .html form there), so the hand-over costs
                     no second redirect
     carry/          the carry page (src/carry/page.js after send.js): the same hand-over,
                     for the new address's "Bring progress from the old address", or the
                     progress as a file to import there
     404.html        what GitHub Pages answers any other path with (a folder such as
                     parts/1-algebra/, a mistyped or retired address): the same as a
                     stub, but to the front page of the new address, without the old
                     address's query or fragment. The path is no page there either, and
                     the new address's own 404 page does not read carried progress
     .nojekyll
   Each page holds a Content-Security-Policy in a <meta> (GitHub Pages sends no headers
   of a site's choosing): nothing but its own inline script and style, by hash.
   tools/check-legacy.js holds dist-legacy/ to all of it. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const site = require("./lib/site");
const origins = require("./lib/origins");

const ROOT = site.ROOT;
const SEND = "src/carry/send.js";
const PAGE = "src/carry/page.js";
const FORMAT = "src/carry/format.ts";


/* the longest bm-carry value an address may carry: format.ts MAX_FRAGMENT, read there */
function limit() {
  const m = /^export const MAX_FRAGMENT = (\d+);$/m.exec(fs.readFileSync(path.join(ROOT, FORMAT), "utf8"));
  if (!m) throw new Error(FORMAT + ": no `export const MAX_FRAGMENT = <n>;` line");
  return +m[1];
}

/* a script as it is inlined: its block comments taken out (most of its bytes; neither
   file puts a comment marker inside a string), and refused if it would end the tag or
   does not parse */
function source(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\n/g, "\n").trim();
  if (/<\/script/i.test(text)) throw new Error(rel + ' holds "</script", which would end the inline tag');
  try { new vm.Script(text); } catch (e) { throw new Error(rel + " does not parse once its comments are out: " + e.message); }
  return text;
}

/* a page's path at the new address: its path without .html, "/" for index.html */
function targetPath(page) {
  return "/" + page.replace(/(^|\/)index\.html$/i, "$1").replace(/\.html$/i, "");
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function hash(text) { return "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'"; }

const STYLE = ":root { color-scheme: light dark; } body { font: 1.1rem/1.55 system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 16px; } button { font: inherit; padding: .5rem 1rem; }";

/* one standalone page: `script` its one inline script, `refresh` the address a browser
   without scripts is sent to (none for the carry page), `body` its content */
function standalone(o) {
  const script = "\n" + o.script + "\n";
  const csp = "default-src 'none'; script-src " + hash(script) + "; style-src " + hash(STYLE) + "; img-src data:; base-uri 'none'; form-action 'none'";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="' + esc(csp) + '">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + esc(o.title) + "</title>",
    o.canonical ? '<link rel="canonical" href="' + esc(o.canonical) + '">' : null,
    '<link rel="icon" href="data:,">',
    "<script>" + script + "</script>",
    o.refresh ? '<noscript><meta http-equiv="refresh" content="0; url=' + esc(o.refresh) + '"></noscript>' : null,
    "<style>" + STYLE + "</style>",
    "</head>",
    "<body>",
    "<main>"
  ].filter(l => l !== null).concat(o.body, ["</main>", "</body>", "</html>", ""]).join("\n");
}

/* The files of the legacy site, { path: text }.
   opts: { origin, base } as the flags above, defaults from src/carry/origins.ts */
function render(opts) {
  opts = opts || {};
  const o = origins.read(ROOT);
  const origin = (opts.origin || o.origin).replace(/\/+$/, "");
  const base = opts.base || o.legacyPath;
  if (!/^\//.test(base) || !/\/$/.test(base)) throw new Error("--base must start and end with /, is " + JSON.stringify(base));
  const send = source(SEND), max = limit(), host = origin.replace(/^https?:\/\//, "");
  const files = {};
  const moved = (href) => [
    "<h1>Basic Mathematics has moved</h1>",
    '<p>The course is now at <a href="' + esc(href) + '">' + esc(host) + "</a>. The progress you saved in this browser comes with you: the new address asks you before it keeps any of it.</p>",
    '<p>If you are not taken there, <a href="' + esc(href) + '">open this page at the new address</a>.</p>'
  ];
  site.htmlPages(ROOT).forEach(page => {
    const to = origin + targetPath(page);
    files[page] = standalone({
      title: "Basic Mathematics has moved",
      canonical: to,
      refresh: to,
      script: send + "\nBMCarrySend.go(" + JSON.stringify({ to, path: targetPath(page), carry: base + "carry/", limit: max }) + ");",
      body: moved(to)
    });
  });
  files["404.html"] = standalone({
    title: "Basic Mathematics has moved",
    refresh: origin + "/",
    script: send + "\nBMCarrySend.go(" + JSON.stringify({ to: origin + "/", path: "/", carry: base + "carry/", limit: max, bare: true }) + ");",
    body: moved(origin + "/")
  });
  files["carry/index.html"] = standalone({
    title: "Bring your progress to the new address",
    script: send + "\n" + source(PAGE) + "\ndocument.addEventListener(\"DOMContentLoaded\", function () { BMCarryPage.run(" + JSON.stringify({ origin, limit: max }) + "); });",
    body: [
      "<h1>Bring your progress to the new address</h1>",
      '<p id="carry-wait">Reading the progress this browser saved at the old address…</p>',
      '<div id="carry-none" hidden>',
      "<p>This browser has no progress saved at the old address, so there is nothing to bring. Everything you do from now on is saved at the new one.</p>",
      '<p><a data-carry-target href="' + esc(origin + "/") + '">' + esc(host) + "</a></p>",
      "</div>",
      '<div id="carry-file" hidden>',
      "<p>Your progress here is too large to bring over in a link, so take it as a file instead:</p>",
      '<p><button type="button" id="carry-download">Download your progress</button></p>',
      '<p>Then open <a data-carry-target href="' + esc(origin + "/progress") + '">' + esc(host) + "/progress</a>, and under <b>Bring your progress here</b> choose <b>Import a file of your progress</b> and pick the file you downloaded. The new address asks you before it keeps anything, and adds it to what is already there.</p>",
      "</div>",
      "<noscript><p>Bringing your progress over needs JavaScript. Without it, open <a href=\"" + esc(origin + "/") + "\">" + esc(host) + "</a>: the course is there, and your progress here stays in this browser.</p></noscript>"
    ]
  });
  files[".nojekyll"] = "";
  return { files, origin, base, limit: max };
}

function build(opts) {
  opts = opts || {};
  const out = path.resolve(ROOT, opts.out || "dist-legacy");
  const r = render(opts);
  fs.rmSync(out, { recursive: true, force: true });
  Object.keys(r.files).forEach(rel => {
    const abs = path.join(out, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, r.files[rel]);
  });
  return Object.assign({ out }, r);
}

module.exports = { render, build, targetPath };

if (require.main === module) {
  const opts = site.parseArgs(process.argv.slice(2));
  try {
    const r = build({ out: typeof opts.out === "string" ? opts.out : undefined, origin: typeof opts.origin === "string" ? opts.origin : undefined, base: typeof opts.base === "string" ? opts.base : undefined });
    console.log("legacy site: " + Object.keys(r.files).length + " files in " + (site.rel(r.out) || r.out) + "/, every page to " + r.origin + ", served under " + r.base);
  } catch (e) { console.error(e.message); process.exit(1); }
}
