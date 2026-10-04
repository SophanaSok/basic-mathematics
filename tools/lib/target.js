"use strict";
/* Which copy of the site the browser scripts load, and a server for it.

   --root=<dir> (or BM_ROOT) names it: `--root=dist` for the built site, `--root=.` for
   the source tree. With neither, it is dist/ when a build is there and no source file is
   newer than it, and the source tree otherwise, so a script run after an edit never
   quietly tests yesterday's build. CI names dist explicitly.

   Either way the pages are loaded over http from lib/serve.js, the test fixtures come
   from the source tree (tools/fixtures/ is never copied into dist/), and /__base/ reads
   the base ref from this checkout. */
const fs = require("fs");
const path = require("path");
const site = require("./site");
const serve = require("./serve");

const DIST = path.join(site.ROOT, "dist");
const FIXTURES = "tools/fixtures/";

/* the newest source file a build reads: pages, and everything under assets/ and data/ */
function newestSource() {
  const files = site.htmlPages(site.ROOT).map(p => path.join(site.ROOT, p));
  ["assets", "data"].forEach(d => site.walk(path.join(site.ROOT, d), () => true, files));
  let newest = { file: "", at: 0 };
  files.forEach(f => { const at = fs.statSync(f).mtimeMs; if (at > newest.at) newest = { file: site.rel(f), at }; });
  return newest;
}

/* -> { root, label, note } ; throws when the directory asked for holds no site */
function pick(opts) {
  opts = opts || {};
  const asked = (typeof opts.root === "string" && opts.root) || process.env.BM_ROOT || "";
  if (asked) {
    const root = path.resolve(site.ROOT, asked);
    if (!fs.existsSync(path.join(root, "index.html"))) {
      throw new Error("no index.html in " + root + (root === DIST ? " — run `npm run build` first" : ""));
    }
    return { root, label: root === site.ROOT ? "the source tree" : (site.rel(root) || root) + "/", note: "" };
  }
  const built = path.join(DIST, "index.html");
  if (!fs.existsSync(built)) return { root: site.ROOT, label: "the source tree", note: "" };
  const newest = newestSource();
  if (newest.at > fs.statSync(built).mtimeMs) {
    return { root: site.ROOT, label: "the source tree", note: "dist/ is older than " + newest.file + " (npm run build, or --root=dist to load it anyway)" };
  }
  return { root: DIST, label: "dist/", note: "" };
}

/* start the server on the picked tree. The result is what serve.start gives, plus
     root, label, note   from pick()
     where               one line saying what is served and where, for the script to print
     owns(url)           true for a URL on this server, for scripts that abort every other request */
async function start(opts) {
  opts = opts || {};
  const t = pick(opts);
  const extraRoots = {};
  extraRoots["/" + FIXTURES] = path.join(site.ROOT, FIXTURES);
  const server = await serve.start(t.root, opts.base || site.DEFAULT_BASE, { gitRoot: site.ROOT, extraRoots, port: opts.port, log: opts.log });
  server.owns = (url) => url.startsWith(server.url);
  server.where = t.label + " at " + server.url + (t.note ? " — " + t.note : "");
  return Object.assign(server, t);
}

module.exports = { pick, start, DIST };
