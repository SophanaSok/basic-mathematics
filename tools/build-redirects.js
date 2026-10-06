#!/usr/bin/env node
"use strict";
/* The redirect site: what GitHub Pages serves at the old address,
   https://sophanasok.github.io/basic-mathematics/, now that the course is served only by
   Cloudflare Pages at ORIGIN (OPERATIONS.md section 8). It does one job: it sends each old
   address to the same page at ORIGIN. It holds no code of the course and moves nothing of
   a reader's: localStorage belongs to an origin, and whatever a browser saved at the old
   address stays there.

   Usage: node tools/build-redirects.js [--out=dist-redirects]
     --out     where to write it (default dist-redirects/)

   What it writes, every file standalone (no shell, no bundle, nothing of the course):
     <page>          one page at the path of every page of the site (lib/site.js
                     htmlPages, the pages `npm run build` writes). Its one script, inline,
                     is location.replace() to the page's address at ORIGIN, with the old
                     address's query and fragment (a link to an exercise, ?mode=review);
                     a meta refresh to the same address inside <noscript>, for a browser
                     without scripts; a visible link to it; a canonical link to it; and
                     robots noindex. The address of a page at ORIGIN is its path without
                     .html, and the root for index.html, which is where Cloudflare Pages
                     serves it (it redirects the .html form there), so it costs no second
                     redirect. GitHub Pages serves a page's file at its path without .html
                     too, so both forms of an old address arrive here.
     404.html        what GitHub Pages answers any other path with (a folder such as
                     parts/1-algebra/, a mistyped or retired address): the same, to the
                     front page at ORIGIN, without the old query or fragment
     .nojekyll
   Each page holds a Content-Security-Policy in a <meta> (GitHub Pages sends no headers of
   a site's choosing): its own inline script by hash, the empty data: icon (without it a
   browser asks the server for /favicon.ico, which the policy would refuse), and nothing
   else, no style, no font, no connection, no frame. tools/check-redirects.js holds
   dist-redirects/ to all of it. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const site = require("./lib/site");

const ROOT = site.ROOT;
/* The one address the course is served from (Cloudflare Pages, OPERATIONS.md section 8):
   an https origin, no path, no trailing slash */
const ORIGIN = "https://learn.groundupmath.org";

/* a page's path at ORIGIN: its path without .html, "/" for index.html */
function targetPath(page) {
  return "/" + page.replace(/(^|\/)index\.html$/i, "$1").replace(/\.html$/i, "");
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function hash(text) { return "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'"; }
function policy(script) { return "default-src 'none'; script-src " + hash(script) + "; img-src data:; base-uri 'none'; form-action 'none'"; }

/* one page that sends its reader to `to`: `keep` adds the old query and fragment */
function redirect(to, keep) {
  const script = "location.replace(" + JSON.stringify(to) + (keep ? " + location.search + location.hash" : "") + ");";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="' + esc(policy(script)) + '">',
    '<meta name="robots" content="noindex">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Basic Mathematics has moved</title>",
    '<link rel="canonical" href="' + esc(to) + '">',
    '<link rel="icon" href="data:,">',
    "<script>" + script + "</script>",
    '<noscript><meta http-equiv="refresh" content="0; url=' + esc(to) + '"></noscript>',
    "</head>",
    "<body>",
    "<main>",
    "<h1>Basic Mathematics has moved</h1>",
    '<p>The course is now at <a href="' + esc(to) + '">' + esc(to.replace(/^https:\/\//, "").replace(/\/$/, "")) + "</a>.</p>",
    "</main>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

/* The files of the redirect site, { path: text } */
function render() {
  const files = {};
  site.htmlPages(ROOT).forEach(page => { files[page] = redirect(ORIGIN + targetPath(page), true); });
  files["404.html"] = redirect(ORIGIN + "/", false);
  files[".nojekyll"] = "";
  return { files };
}

function build(opts) {
  opts = opts || {};
  const out = path.resolve(ROOT, opts.out || "dist-redirects");
  const r = render();
  fs.rmSync(out, { recursive: true, force: true });
  Object.keys(r.files).forEach(rel => {
    const abs = path.join(out, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, r.files[rel]);
  });
  return Object.assign({ out }, r);
}

module.exports = { ORIGIN, render, build, targetPath, policy };

if (require.main === module) {
  const opts = site.parseArgs(process.argv.slice(2));
  try {
    const r = build({ out: typeof opts.out === "string" ? opts.out : undefined });
    console.log("redirect site: " + Object.keys(r.files).length + " files in " + (site.rel(r.out) || r.out) + "/, every page to " + ORIGIN);
  } catch (e) { console.error(e.message); process.exit(1); }
}
