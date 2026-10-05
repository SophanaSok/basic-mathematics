"use strict";
/* The response headers of the site on Cloudflare Pages: dist/_headers, which Pages reads
   and does not serve (developers.cloudflare.com/pages/configuration/headers, read
   2026-10-05), and dist/404.html, the page Pages answers an unknown path with. The build
   writes both (vite.config.ts cloudflare()), because the policy names things only the
   build knows: the hashes of the two scripts every page carries inline, and the
   Supabase project in assets/config.js. GitHub Pages ignores neither file but uses
   neither; its deploy leaves them out (.github/workflows/ci.yml).

   The rules, in the file's own syntax (a path pattern, then indented `Name: value`
   lines; a splat `*` matches anything, `:name` anything but "/"; a request takes the
   headers of every rule it matches, and a header two rules set is joined with a comma,
   so each path must meet exactly one Cache-Control; at most 100 rules, 2,000 characters a
   line):

   /*   the security headers, on every response:
        Content-Security-Policy  exactly what the pages load: scripts from the site
            itself and the two inline ones by hash (the boot script and the HUD script,
            tools/lib/shell.js), never 'unsafe-inline' or 'unsafe-eval' for scripts;
            styles from the site and inline, because KaTeX writes its layout into style
            attributes (and the view-transition opt-in is an inline <style>); images from
            the site and data: (the tick and cross marks in src/styles/tokens.css are
            data: SVGs); fonts from the site; fetch and WebSocket to the site and the
            Supabase project only; no plugins, frames, or <base> elsewhere; forms post
            nowhere but here (none posts at all); and no other site may frame a page.
            Navigation is not a fetch: a sign-in leaves for Supabase and the sign-in
            service as a top-level navigation, which no directive governs
        Permissions-Policy  every powerful feature the site does not use, denied
        Referrer-Policy, X-Content-Type-Options  as Pages sends them by default, stated
        X-Frame-Options  DENY, for browsers that do not read frame-ancestors
   Cache-Control, one rule per kind of file:
        the pages (/, /:page, /parts/*: Pages serves about.html as /about and
            redirects the one to the other)            revalidated on every request
        bundle/*.js, *.css, *.map, *.svg, *.txt        revalidated on every request: their
            names carry no hash (vite.config.ts says why), so a deploy changes a file
            under the same name, and a browser must ask
        KaTeX's fonts (bundle/KaTeX_*)                 a year, immutable: the package is
            pinned to one exact version (package.json), so a file of that name never
            changes; a new version of KaTeX would have to rename them
        the typefaces (bundle/inter-*, newsreader-*, bricolage-*)  a week: named by the
            fontsource file and not by a hash, and their packages may move within their
            range, so a changed file would reach every browser within a week
   check-dist.js `headers` holds dist/_headers to what render() writes from dist, and every
   file of dist to exactly one Cache-Control rule; lib/serve.js applies the file to what it
   serves, so the browser checks run under the same policy. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = "_headers";
const NOT_FOUND = "404.html";
const REVALIDATE = "public, max-age=0, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";
const WEEK = "public, max-age=604800";
const MAX_RULES = 100;
const MAX_LINE = 2000;

/* every powerful feature the site does not use; each name is one Chromium knows, since an
   unknown one is reported on every page as an error */
const DENIED = ["accelerometer", "camera", "display-capture", "fullscreen", "geolocation", "gyroscope", "hid",
  "idle-detection", "magnetometer", "microphone", "midi", "payment", "publickey-credentials-get", "screen-wake-lock",
  "serial", "usb", "xr-spatial-tracking"];

function sha256(text) { return "'sha256-" + crypto.createHash("sha256").update(text, "utf8").digest("base64") + "'"; }

/* the text of every inline <script> of a page, as the browser hashes it: everything
   between the tag's ">" and "</script>" */
function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\bsrc\s*=/i.test(m[1])) out.push(m[2]);
  }
  return out;
}

/* the Supabase project's origin from assets/config.js, or null with accounts off */
function supabaseOrigin(configText) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(configText, sandbox, { filename: "assets/config.js" });
  const url = sandbox.window.BM_CONFIG && sandbox.window.BM_CONFIG.supabaseUrl;
  if (!url) return null;
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("assets/config.js: supabaseUrl must be https, is " + JSON.stringify(url));
  return u.origin;
}

function policy(hashes, supabase) {
  const connect = ["'self'"].concat(supabase ? [supabase, supabase.replace(/^https:/, "wss:")] : []);
  return [
    "default-src 'self'",
    "script-src 'self' " + hashes.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src " + connect.join(" "),
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}

/* the family a font file belongs to, as a pattern: KaTeX_<face>.<ext>, else the name up
   to its first "-" (inter-latin-wght-normal.woff2 is inter's) */
const FONT = /\.(woff2?|ttf|otf)$/i;
function fontRule(file) {
  const name = path.posix.basename(file);
  if (/^KaTeX_/.test(name)) return { pattern: "/" + path.posix.dirname(file) + "/KaTeX_*", value: IMMUTABLE };
  const family = /^([A-Za-z0-9]+)-/.exec(name);
  if (!family) throw new Error("tools/lib/headers.js: no family in the font file name " + file);
  return { pattern: "/" + path.posix.dirname(file) + "/" + family[1] + "-*", value: WEEK };
}

/* The file. `pages` maps each page's path in dist to its HTML; `files` lists every
   file of dist (paths relative to it); `config` is assets/config.js's text. */
function render(opts) {
  const hashes = [];
  Object.keys(opts.pages).sort().forEach(p => inlineScripts(opts.pages[p]).forEach(t => {
    const h = sha256(t);
    if (!hashes.includes(h)) hashes.push(h);
  }));
  const supabase = supabaseOrigin(opts.config);
  const cache = [["/", REVALIDATE], ["/:page", REVALIDATE], ["/parts/*", REVALIDATE]];
  const seen = new Set(cache.map(c => c[0]));
  const add = (pattern, value) => { if (!seen.has(pattern)) { seen.add(pattern); cache.push([pattern, value]); } };
  opts.files.slice().sort().forEach(f => {
    if (!/^bundle\//.test(f)) return;
    if (FONT.test(f)) { const r = fontRule(f); add(r.pattern, r.value); }
    else add("/bundle/*" + path.posix.extname(f), REVALIDATE);
  });
  const lines = [
    "# The headers of every response of the site on Cloudflare Pages. Written by the build",
    "# (vite.config.ts cloudflare(), tools/lib/headers.js says what each rule is for); never edit it here.",
    "/*",
    "  Content-Security-Policy: " + policy(hashes, supabase),
    "  Permissions-Policy: " + DENIED.map(f => f + "=()").join(", "),
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY"
  ];
  cache.forEach(([pattern, value]) => lines.push(pattern, "  Cache-Control: " + value));
  return lines.join("\n") + "\n";
}

/* The page Pages answers an unknown path with (status 404). It stands alone: it may be
   served at any depth, where the site's relative links would miss, so it has no script,
   no stylesheet of the site's and one link, to the contents at the root. Cloudflare
   only: without a top-level 404.html, Pages takes a project for a single-page app and
   answers every unknown path with index.html and a 200 (Serving Pages, "Single-page
   application (SPA) rendering"). */
function notFoundPage() {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    "<title>Page not found — Basic Mathematics</title>",
    "<style>:root { color-scheme: light dark; } body { font: 1.1rem/1.55 system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 16px; }</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>There is no page here</h1>",
    '<p>The address may be mistyped, or the page may have moved. <a href="/">Go to the contents of Basic Mathematics</a>.</p>',
    "</main>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

/* ------------------------------------------------------------- reading -- */

/* -> [{ pattern, set: [[name, value]], detach: [name] }]; throws on a line it cannot read */
function parse(text) {
  const rules = [];
  let rule = null;
  text.split("\n").forEach((line, i) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    if (line.length > MAX_LINE) throw new Error(FILE + ":" + (i + 1) + ": longer than " + MAX_LINE + " characters");
    if (!/^\s/.test(line)) { rule = { pattern: line.trim(), set: [], detach: [] }; rules.push(rule); return; }
    if (!rule) throw new Error(FILE + ":" + (i + 1) + ": a header before any path");
    const d = /^\s+!\s+([^:\s]+)\s*$/.exec(line);
    if (d) { rule.detach.push(d[1]); return; }
    const m = /^\s+([^:\s]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(FILE + ":" + (i + 1) + ": not `Name: value`: " + JSON.stringify(line.trim()));
    rule.set.push([m[1], m[2]]);
  });
  if (rules.length > MAX_RULES) throw new Error(FILE + ": " + rules.length + " rules, more than the " + MAX_RULES + " Pages reads");
  return rules;
}

/* a path pattern as Pages matches it: one splat, greedy; placeholders up to the next "/" */
function matcher(pattern) {
  if ((pattern.match(/\*/g) || []).length > 1) throw new Error(FILE + ": " + pattern + " has more than one splat");
  const re = pattern.split(/(\*|:[A-Za-z]\w*)/).map(part =>
    part === "*" ? ".*" : /^:[A-Za-z]/.test(part) ? "[^/]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("");
  return new RegExp("^" + re + "$");
}

/* the headers a request for `urlPath` gets: [[name, value]], a header two rules set
   joined with ", ", one a later rule detaches taken off */
function headersFor(rules, urlPath) {
  const out = new Map();
  rules.forEach(r => {
    if (!matcher(r.pattern).test(urlPath)) return;
    r.set.forEach(([name, value]) => {
      const k = name.toLowerCase();
      out.set(k, out.has(k) ? [out.get(k)[0], out.get(k)[1] + ", " + value] : [name, value]);
    });
    r.detach.forEach(name => out.delete(name.toLowerCase()));
  });
  return Array.from(out.values());
}

/* the rules a path meets that set `name`, for the one-rule-per-path check */
function rulesSetting(rules, urlPath, name) {
  return rules.filter(r => matcher(r.pattern).test(urlPath) && r.set.some(([n]) => n.toLowerCase() === name.toLowerCase())).map(r => r.pattern);
}

/* the paths Pages answers a file of dist on: the file's own, and for a page the path
   without .html (and "/" for an index), which is where Pages serves it */
function servedPaths(file) {
  const out = ["/" + file];
  if (/\.html$/i.test(file) && file !== NOT_FOUND) {
    const bare = "/" + file.replace(/\.html$/i, "");
    out.push(/(^|\/)index$/.test(bare) ? bare.replace(/index$/, "") : bare);
  }
  return out;
}

/* what the build reads to write the file: dist's pages and files, and assets/config.js */
function fromDist(dist, root) {
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir).sort().forEach(f => {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else files.push(path.relative(dist, p).split(path.sep).join("/"));
    });
  })(dist);
  const pages = {};
  files.filter(f => /\.html$/i.test(f) && f !== NOT_FOUND).forEach(f => { pages[f] = fs.readFileSync(path.join(dist, f), "utf8"); });
  return { pages, files: files.filter(f => f !== FILE), config: fs.readFileSync(path.join(root, "assets", "config.js"), "utf8") };
}

module.exports = { FILE, NOT_FOUND, REVALIDATE, IMMUTABLE, WEEK, MAX_RULES, MAX_LINE, DENIED, render, notFoundPage, parse, matcher, headersFor, rulesSetting, servedPaths, inlineScripts, sha256, supabaseOrigin, fromDist, policy };
