#!/usr/bin/env node
"use strict";
/* Checks on the built site: dist/ must be the source tree's site, page for page.
   Node built-ins only, no browser. Run after `npm run build`.

   Usage: node tools/check-dist.js [--dist=<dir>] [--only=<check,check>]

   --dist   the build to check (default: dist/ in this repo)
   --only   run just the named checks (the names printed in the first column)

   Same shape as check-static.js: each check is a function (ctx, r) in CHECKS below, one
   line of output per check, exit code 1 on any failure. */

const fs = require("fs");
const path = require("path");

const site = require("./lib/site");
const { parse, normText, hash } = require("./lib/html");
const links = require("./lib/links");

const ROOT = site.ROOT;
const opts = site.parseArgs(process.argv.slice(2));
const DIST = path.resolve(ROOT, typeof opts.dist === "string" ? opts.dist : "dist");

function result() {
  const r = { fails: [], warns: [], notes: [], count: 0 };
  r.fail = (m) => { r.fails.push(m); };
  r.warn = (m) => { r.warns.push(m); };
  r.note = (m) => { r.notes.push(m); };
  return r;
}

/* every file under a directory, as paths relative to it */
function filesUnder(dir) {
  return site.walk(dir, () => true).map(p => path.relative(dir, p).split(path.sep).join("/"));
}

function buildContext() {
  const ctx = { src: { pages: site.htmlPages(ROOT), docs: {}, text: {} }, dist: { pages: [], docs: {}, text: {} }, chapters: [] };
  ctx.src.pages.forEach(p => {
    ctx.src.text[p] = fs.readFileSync(path.join(ROOT, p), "utf8");
    ctx.src.docs[p] = parse(ctx.src.text[p]);
    if (site.chapterIdOf(ctx.src.docs[p])) ctx.chapters.push(p);
  });
  ctx.dist.pages = site.htmlPages(DIST);
  ctx.dist.pages.forEach(p => {
    ctx.dist.text[p] = fs.readFileSync(path.join(DIST, p), "utf8");
    ctx.dist.docs[p] = parse(ctx.dist.text[p]);
  });
  ctx.files = filesUnder(DIST);
  return ctx;
}

/* the local stylesheets a page links, as tree-relative paths, in order */
function stylesheetsOf(page, doc) {
  return doc.queryAll("link").filter(l => /(^|\s)stylesheet(\s|$)/i.test(l.getAttribute("rel") || ""))
    .map(l => links.targetOf(page, l.getAttribute("href"))).filter(Boolean);
}
/* the local scripts a page names, as tree-relative paths, in order */
function scriptsOf(page, doc) {
  return doc.queryAll("script").map(s => links.targetOf(page, s.getAttribute("src"))).filter(Boolean);
}

/* ------------------------------------------------------------- checks ---- */

/* (a) the same pages at the same paths; nothing extra; .nojekyll for a branch deploy */
function checkPages(ctx, r) {
  const built = new Set(ctx.dist.pages);
  ctx.src.pages.forEach(p => {
    r.count++;
    if (!built.has(p)) r.fail(p + " is in the source tree but not in dist");
  });
  ctx.files.filter(f => /\.html$/i.test(f)).forEach(f => {
    if (!ctx.src.pages.includes(f)) r.fail("dist has " + f + ", which is not a page of the source tree");
  });
  if (!ctx.files.includes(".nojekyll")) r.fail("dist/.nojekyll is missing (public/.nojekyll should have been copied)");
}

/* (b) every relative href/src resolves to a file inside dist, and its anchor to an id */
function checkLinks(ctx, r) {
  const files = new Set(ctx.files);
  links.checkLinks({ pages: ctx.dist.pages, docs: ctx.dist.docs, exists: (rel) => files.has(rel) }, r);
}

/* (c) nothing points at the server's root: the site is deployed under a sub-path.
   On the attributes that hold URLs any value starting with one "/" fails; on any other
   attribute, a value that names something in dist's top level ("/assets/…") does. */
const URL_ATTRS = new Set(["href", "src", "srcset", "poster", "action", "formaction", "data", "xlink:href"]);
function checkRootAbsolute(ctx, r) {
  const top = new Set(ctx.files.map(f => f.split("/")[0]));
  ctx.dist.pages.forEach(page => {
    for (const el of ctx.dist.docs[page].elements()) {
      Object.keys(el.attrs).forEach(name => {
        const values = name === "srcset" ? el.attrs[name].split(",").map(s => s.trim()) : [el.attrs[name]];
        values.forEach(v => {
          r.count++;
          if (!/^\/(?!\/)/.test(v)) return;
          const first = /^\/([^\/?#\s]*)/.exec(v)[1];
          if (URL_ATTRS.has(name) || top.has(first)) {
            r.fail(page + ":" + el.line + ": <" + el.name + " " + name + "=" + JSON.stringify(v) + "> is a root-absolute path");
          }
        });
      });
    }
  });
}

/* (d) the build may rewrite a page's <head>; what is inside <main> must come through
   untouched (lesson.js and the exercise keys depend on it). Compared as the text from
   "<main" to "</main>", whitespace-normalised and hashed. */
function mainOf(text) {
  const a = text.indexOf("<main"), b = text.lastIndexOf("</main>");
  return a === -1 || b === -1 ? null : normText(text.slice(a, b));
}
function checkMain(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.text[p]) return;       /* reported by `pages` */
    r.count++;
    const s = mainOf(ctx.src.text[p]), d = mainOf(ctx.dist.text[p]);
    if (s === null) { r.fail(p + ": no <main> in the source page"); return; }
    if (d === null) { r.fail(p + ": no <main> in the built page"); return; }
    if (hash(s) !== hash(d) || s.length !== d.length) {
      let i = 0;
      while (i < s.length && s[i] === d[i]) i++;
      r.fail(p + ": <main> differs from the source (fingerprint " + hash(d) + " vs " + hash(s) + "); first difference at character " + i +
        ": source " + JSON.stringify(s.slice(Math.max(0, i - 30), i + 50)) + ", dist " + JSON.stringify(d.slice(Math.max(0, i - 30), i + 50)));
    }
  });
}

/* the pages still load the same classic scripts, in the same order, and every .js under
   assets/ and data/ is in dist byte for byte (some are loaded at run time, not by a tag) */
function checkScripts(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.docs[p]) return;
    const s = scriptsOf(p, ctx.src.docs[p]), d = scriptsOf(p, ctx.dist.docs[p]);
    if (s.join("\n") !== d.join("\n")) r.fail(p + ": script tags differ from the source — source [" + s.join(", ") + "], dist [" + d.join(", ") + "]");
  });
  const scripts = [];
  ["assets", "data"].forEach(d => site.walk(path.join(ROOT, d), p => /\.js$/.test(p), scripts));
  scripts.forEach(abs => {
    r.count++;
    const rel = site.rel(abs), built = path.join(DIST, rel);
    if (!fs.existsSync(built)) { r.fail(rel + " is not in dist"); return; }
    if (!fs.readFileSync(abs).equals(fs.readFileSync(built))) r.fail(rel + " in dist is not the source file byte for byte");
  });
}

/* (e) nothing that looks like a server-side secret is in any built file. The Supabase
   anon key in assets/config.js is public by design and matches none of these. */
const SECRETS = [/service_role/, /sb_secret_/, /whsec_/, /sk-ant-/, /(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/];
function checkSecrets(ctx, r) {
  ctx.files.forEach(f => {
    r.count++;
    const text = fs.readFileSync(path.join(DIST, f), "latin1");
    SECRETS.forEach(re => {
      const m = re.exec(text);
      if (m) r.fail(f + ": contains " + JSON.stringify(m[0].slice(0, 12) + (m[0].length > 12 ? "…" : "")) + " (matches " + re + ") at byte " + m.index);
    });
  });
}

/* (f) how the build split the CSS: the number of distinct stylesheets the pages link,
   and every chapter page linking the same ones (a chapter with its own file would be
   fetched again on every chapter, and is a sign the split went wrong).
   Also the cascade: a page's built stylesheets must carry the rules of its source
   stylesheets in the order the source page links them. Read off the class names only
   one source file uses: in the built CSS, all of one file's must come before all of
   the next file's. */
function checkStylesheets(ctx, r) {
  const all = new Set();
  const per = {};
  ctx.dist.pages.forEach(p => { per[p] = stylesheetsOf(p, ctx.dist.docs[p]); per[p].forEach(f => all.add(f)); });
  r.note(all.size + " distinct stylesheet(s) linked across " + ctx.dist.pages.length + " pages: " + Array.from(all).sort().join(", "));
  const chapters = ctx.chapters.filter(p => per[p]);
  chapters.forEach(p => {
    r.count++;
    if (per[p].join("\n") !== per[chapters[0]].join("\n")) {
      r.fail(p + " links [" + per[p].join(", ") + "] but " + chapters[0] + " links [" + per[chapters[0]].join(", ") + "]");
    }
  });

  const srcFiles = new Set();
  ctx.src.pages.forEach(p => stylesheetsOf(p, ctx.src.docs[p]).forEach(f => srcFiles.add(f)));
  const classesOf = {}, users = {};
  srcFiles.forEach(f => {
    const css = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    classesOf[f] = new Set(css.match(/\.[A-Za-z_][\w-]*/g) || []);
    classesOf[f].forEach(c => { users[c] = (users[c] || 0) + 1; });
  });
  const own = {};
  srcFiles.forEach(f => { own[f] = new Set(Array.from(classesOf[f]).filter(c => users[c] === 1)); });
  ctx.src.pages.forEach(p => {
    if (!per[p]) return;
    r.count++;
    const css = per[p].map(f => { try { return fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return ""; } }).join("\n");
    let last = { file: null, end: -1 };
    for (const f of stylesheetsOf(p, ctx.src.docs[p])) {
      let first = Infinity, end = -1, seen = 0;
      own[f].forEach(c => {
        const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])", "g");
        let m;
        while ((m = re.exec(css))) { seen++; if (m.index < first) first = m.index; if (m.index > end) end = m.index; }
      });
      if (!own[f].size) { r.note(p + ": " + f + " has no class name of its own, so its place in the cascade is not checked"); continue; }
      if (!seen) { r.fail(p + ": none of the rules of " + f + " are in the built stylesheets [" + per[p].join(", ") + "]"); continue; }
      if (first < last.end) r.fail(p + ": rules of " + f + " come before rules of " + last.file + " in the built stylesheets [" + per[p].join(", ") + "], after them in the source");
      last = { file: f, end };
    }
  });
}

/* ------------------------------------------------------------- runner ---- */

const CHECKS = [
  { name: "pages", run: checkPages, what: "every source page is in dist at the same path, and nothing else is" },
  { name: "links", run: checkLinks, what: "relative hrefs/srcs in dist resolve inside dist, anchors to ids" },
  { name: "root-absolute", run: checkRootAbsolute, what: "no attribute value is a root-absolute path" },
  { name: "main", run: checkMain, what: "<main> of every page is the source's, by fingerprint" },
  { name: "scripts", run: checkScripts, what: "same script tags per page; assets/ and data/ scripts copied byte for byte" },
  { name: "secrets", run: checkSecrets, what: "no server-side key in any built file" },
  { name: "stylesheets", run: checkStylesheets, what: "chapter pages share their stylesheets; the cascade keeps the source order" }
];

function main() {
  const t0 = Date.now();
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("FAIL  setup: no build in " + DIST + " — run `npm run build` first"); process.exit(1); }
  let ctx;
  try { ctx = buildContext(); }
  catch (e) { console.error("FAIL  setup: " + e.message); process.exit(1); }
  const only = opts.only ? String(opts.only).split(",") : null;
  const list = CHECKS.filter(c => !only || only.includes(c.name));
  if (!list.length) { console.error("no such check; available: " + CHECKS.map(c => c.name).join(", ")); process.exit(2); }
  let anyFail = false, anyWarn = false;
  list.forEach(c => {
    const r = result();
    try { c.run(ctx, r); } catch (e) { r.fail("check crashed: " + (e.stack || e.message)); }
    const status = r.fails.length ? "FAIL" : r.warns.length ? "WARN" : "PASS";
    if (status === "FAIL") anyFail = true;
    if (r.warns.length) anyWarn = true;
    console.log(status.padEnd(5) + " " + c.name.padEnd(14) + " " + String(r.count).padStart(5) + "  " + c.what);
    r.notes.forEach(n => console.log("        · " + n));
    r.fails.forEach(m => console.log("        ✗ " + m));
    r.warns.forEach(m => console.log("        ! " + m));
  });
  console.log((anyFail ? "FAILED" : anyWarn ? "passed with warnings" : "all passed") + " in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + (site.rel(DIST) || DIST) + "/, " + ctx.files.length + " files)");
  process.exit(anyFail ? 1 : 0);
}

if (require.main === module) main();
module.exports = { CHECKS };
