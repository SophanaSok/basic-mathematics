"use strict";
/* The site the browser scripts load, and a server for it: the build in dist/.

   The source tree is not a site: its pages hold markers where the shell goes, and its
   scripts are the imports of a module entry Vite bundles. So the build is what is
   served, always, and a build that is missing or older than what it is built from is
   refused with "run `npm run build` first" rather than tested as if it were current:
   a script run after an edit never quietly tests yesterday's build. `--root=<dir>`
   (or BM_ROOT) names a build somewhere else (CI downloads dist/ as an artifact), and
   the same test holds it to the source tree.

   The pages are loaded over http from lib/serve.js, the test fixtures come from the
   source tree (tools/fixtures/ is never copied into dist/), and /__base/ reads the base
   ref from this checkout. */
const fs = require("fs");
const path = require("path");
const site = require("./site");
const serve = require("./serve");

const DIST = path.join(site.ROOT, "dist");
const FIXTURES = "tools/fixtures/";

/* the newest file a build reads: the pages, the shell it writes into each of them and
   the boot script it inlines, the entries, everything under assets/ and data/, and the
   build's own configuration */
function newestSource() {
  const files = site.htmlPages(site.ROOT).map(p => path.join(site.ROOT, p))
    .concat([path.join(__dirname, "shell.js"), path.join(site.ROOT, "vite.config.ts"), path.join(site.ROOT, "package-lock.json")]);
  ["src", "assets", "data"].forEach(d => site.walk(path.join(site.ROOT, d), () => true, files));
  let newest = { file: "", at: 0 };
  files.forEach(f => { const at = fs.statSync(f).mtimeMs; if (at > newest.at) newest = { file: site.rel(f), at }; });
  return newest;
}

/* How a build stands to the working tree: null when there is none at `root`, "" when
   no source file is newer than it, and otherwise which file is. */
function stale(root) {
  const built = path.join(root || DIST, "index.html");
  if (!fs.existsSync(built)) return null;
  const newest = newestSource();
  return newest.at > fs.statSync(built).mtimeMs ? site.rel(root || DIST) + "/ is older than " + newest.file : "";
}

/* -> { root, label } ; throws, saying what to run, when there is no current build */
function pick(opts) {
  opts = opts || {};
  const asked = (typeof opts.root === "string" && opts.root) || process.env.BM_ROOT || "";
  const root = path.resolve(site.ROOT, asked || DIST);
  if (root === site.ROOT) throw new Error("the source tree is not a site (its pages have no head and its scripts are bundled): run `npm run build` and load dist/");
  const old = stale(root);
  if (old === null) throw new Error("no build in " + root + " — run `npm run build` first");
  if (old) throw new Error(old + " — run `npm run build` first");
  return { root, label: (site.rel(root) || root) + "/" };
}

/* start the server on the build. The result is what serve.start gives, plus
     root, label         from pick()
     where               one line saying what is served and where, for the script to print
     owns(url)           true for a URL on this server, for scripts that abort every other request */
async function start(opts) {
  opts = opts || {};
  const t = pick(opts);
  const extraRoots = {};
  extraRoots["/" + FIXTURES] = path.join(site.ROOT, FIXTURES);
  const server = await serve.start(t.root, opts.base || site.DEFAULT_BASE, { gitRoot: site.ROOT, extraRoots, port: opts.port, log: opts.log });
  server.owns = (url) => url.startsWith(server.url);
  server.where = t.label + " at " + server.url;
  return Object.assign(server, t);
}

module.exports = { pick, start, stale, DIST };
