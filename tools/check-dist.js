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
/* every <script> of a page, in order, as written: its attributes and, for an inline
   one, its text */
function scriptTagsOf(doc) {
  return doc.queryAll("script").map(s => "<script" + Object.keys(s.attrs).map(k => " " + k + (s.attrs[k] === "" ? "" : "=" + JSON.stringify(s.attrs[k]))).join("") + ">" + normText(s.textContent));
}
const NO_COMMENTS = /\/\*[\s\S]*?\*\//g;
/* url(/…) or @import "/…" in a piece of CSS: a root-absolute reference (not //host/…) */
const CSS_ROOT_ABSOLUTE = /(?:url\(\s*|@import\s+)["']?\/(?!\/)[^"')\s;]*/;
/* where two texts first part, for a message */
function firstDifference(s, d) {
  let i = 0;
  while (i < s.length && s[i] === d[i]) i++;
  return "first difference at character " + i + ": source " + JSON.stringify(s.slice(Math.max(0, i - 30), i + 50)) + ", dist " + JSON.stringify(d.slice(Math.max(0, i - 30), i + 50));
}

/* ------------------------------------------------------------- checks ---- */

/* (a) the same pages at the same paths; .nojekyll for a branch deploy; and nothing else
   in dist but what the site is made of: a page, a script of assets/ or data/, a file of
   public/, a file a built page links (its stylesheets, the icon) or a built stylesheet
   names, and the source map beside any of those. Anything more was put there by
   mistake, and everything in dist is published. */
function checkPages(ctx, r) {
  const built = new Set(ctx.dist.pages);
  ctx.src.pages.forEach(p => {
    r.count++;
    if (!built.has(p)) r.fail(p + " is in the source tree but not in dist");
  });
  if (!ctx.files.includes(".nojekyll")) r.fail("dist/.nojekyll is missing (public/.nojekyll should have been copied)");

  const known = new Set(ctx.src.pages);
  ["assets", "data"].forEach(d => site.walk(path.join(ROOT, d), p => /\.js$/.test(p)).forEach(p => known.add(site.rel(p))));
  const pub = path.join(ROOT, "public");
  site.walk(pub, () => true).forEach(p => known.add(path.relative(pub, p).split(path.sep).join("/")));
  ctx.dist.pages.forEach(page => links.refsOf(ctx.dist.docs[page]).forEach(ref => {
    const f = links.targetOf(page, ref.v);
    if (f) known.add(f);
  }));
  ctx.files.filter(f => /\.css$/.test(f) && known.has(f)).forEach(f => {
    const css = fs.readFileSync(path.join(DIST, f), "utf8").replace(NO_COMMENTS, "");
    for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) {
      const t = links.targetOf(f, m[1]);
      if (t) known.add(t);
    }
  });
  ctx.files.forEach(f => {
    r.count++;
    if (known.has(f) || (/\.map$/.test(f) && known.has(f.slice(0, -4)))) return;
    r.fail("dist has " + f + (/\.html$/i.test(f) ? ", which is not a page of the source tree" : ", which no page of the site is made of"));
  });
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
  const inCss = (css, where) => {
    r.count++;
    const m = CSS_ROOT_ABSOLUTE.exec(css.replace(NO_COMMENTS, ""));
    if (m) r.fail(where + ": " + JSON.stringify(m[0]) + " is a root-absolute path");
  };
  ctx.files.filter(f => /\.css$/.test(f)).forEach(f => inCss(fs.readFileSync(path.join(DIST, f), "utf8"), f));
  ctx.dist.pages.forEach(page => {
    for (const el of ctx.dist.docs[page].elements()) {
      if (el.name === "style") inCss(el.textContent, page + ":" + el.line + ": <style>");
      if (el.hasAttribute("style")) inCss(el.getAttribute("style"), page + ":" + el.line + ": <" + el.name + " style>");
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
      r.fail(p + ": <main> differs from the source (fingerprint " + hash(d) + " vs " + hash(s) + "); " + firstDifference(s, d));
    }
  });
}

/* and so must everything around <main>, for as long as the build is a pass-through: the
   head (viewport, title, the CDN tags, the inline scripts), the attributes of <body>,
   the top bar, the footer. The one thing the build does rewrite is the links to the
   site's own stylesheets and icon, which `links` and `stylesheets` hold to account, so
   those links are taken out of both sides and the rest is compared like <main>. The
   item that moves the shell into the build changes this check on purpose. */
function shellOf(text) {
  const a = text.indexOf("<main"), b = text.lastIndexOf("</main>");
  if (a === -1 || b === -1) return null;
  const own = (tag) => {
    const el = parse(tag).query("link");
    return el && /(^|\s)(stylesheet|icon)(\s|$)/i.test(el.getAttribute("rel") || "") && !links.EXTERNAL.test(el.getAttribute("href") || "");
  };
  return normText((text.slice(0, a) + "<main></main>" + text.slice(b + "</main>".length)).replace(/<link\b[^>]*>/gi, tag => own(tag) ? "" : tag));
}
function checkShell(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.text[p]) return;
    const s = shellOf(ctx.src.text[p]), d = shellOf(ctx.dist.text[p]);
    if (s === null || d === null) return;     /* reported by `main` */
    r.count++;
    if (s !== d) r.fail(p + ": the page around <main> differs from the source (fingerprint " + hash(d) + " vs " + hash(s) + "); " + firstDifference(s, d));
  });
}

/* the pages still carry the same script tags, in the same order: the same src, and the
   same attributes too (a `defer` dropped or a type="module" added changes when and how
   a script runs), inline scripts and the CDN ones included. And every .js under assets/
   and data/ is in dist byte for byte (some are loaded at run time, not by a tag) */
function checkScripts(ctx, r) {
  ctx.src.pages.forEach(p => {
    if (!ctx.dist.docs[p]) return;
    const s = scriptTagsOf(ctx.src.docs[p]), d = scriptTagsOf(ctx.dist.docs[p]);
    r.count += s.length;
    for (let i = 0; i < Math.max(s.length, d.length); i++) {
      if (s[i] === d[i]) continue;
      r.fail(p + ": script tag " + (i + 1) + " differs from the source — source " + (s[i] === undefined ? "has none" : s[i].slice(0, 200)) + ", dist " + (d[i] === undefined ? "has none" : d[i].slice(0, 200)));
      break;
    }
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
   anon key in assets/config.js is public by design and matches none of these.
   service_role in any case, because the usual name of that key is upper-case
   (SUPABASE_SERVICE_ROLE_KEY). And a legacy Supabase key is a JWT, which carries its
   role base64-encoded where no pattern sees it: every JWT-shaped token is decoded, and
   it fails unless its role is the public one, "anon" (or it claims no role at all). */
const SECRETS = [/service_role/i, /sb_secret_/, /whsec_/, /sk-ant-/, /(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/];
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;
/* why the payload of a JWT must not be published, or null */
function jwtProblem(payload) {
  const text = Buffer.from(payload, "base64url").toString("utf8");
  let role;
  try { role = JSON.parse(text).role; } catch (e) { /* not JSON: judged as text */ }
  if (typeof role === "string" && role !== "anon") return "a JWT with the role " + JSON.stringify(role);
  return /service_role/i.test(text) ? "a JWT that names service_role" : null;
}
function checkSecrets(ctx, r) {
  ctx.files.forEach(f => {
    r.count++;
    const text = fs.readFileSync(path.join(DIST, f), "latin1");
    SECRETS.forEach(re => {
      const m = re.exec(text);
      if (m) r.fail(f + ": contains " + JSON.stringify(m[0].slice(0, 12) + (m[0].length > 12 ? "…" : "")) + " (matches " + re + ") at byte " + m.index);
    });
    for (const m of text.matchAll(JWT)) {
      const why = jwtProblem(m[1]);
      if (why) r.fail(f + ": contains " + why + " (" + JSON.stringify(m[0].slice(0, 12) + "…") + ") at byte " + m.index);
    }
  });
}

/* (f) how the build split the CSS: the number of distinct stylesheets the pages link,
   and every chapter page linking the same ones (a chapter with its own file would be
   fetched again on every chapter, and is a sign the split went wrong).
   Also the cascade: a page's built stylesheets must carry the rules of its source
   stylesheets in the order the source page links them. Read off the class names only
   one source file uses: in the built CSS, all of one file's must come before all of
   the next file's.
   And the text: each stylesheet a source page links must be, unchanged, inside one of
   the built stylesheets the built page links. The build does not minify CSS for now
   (vite.config.ts says why), and this is what notices if it starts to. */
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
  const classesOf = {}, users = {}, srcText = {};
  srcFiles.forEach(f => {
    srcText[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
    const css = srcText[f].replace(NO_COMMENTS, "");
    classesOf[f] = new Set(css.match(/\.[A-Za-z_][\w-]*/g) || []);
    classesOf[f].forEach(c => { users[c] = (users[c] || 0) + 1; });
  });
  const own = {}, rewritten = {};
  srcFiles.forEach(f => { own[f] = new Set(Array.from(classesOf[f]).filter(c => users[c] === 1)); });
  ctx.src.pages.forEach(p => {
    if (!per[p]) return;
    r.count++;
    const builtText = per[p].map(f => { try { return fs.readFileSync(path.join(DIST, f), "utf8"); } catch (e) { return ""; } });
    /* comments out of both sides: a class name in a comment is not a rule */
    const css = builtText.join("\n").replace(NO_COMMENTS, "");
    let last = { file: null, end: -1 };
    for (const f of stylesheetsOf(p, ctx.src.docs[p])) {
      r.count++;
      if (!builtText.some(t => t.includes(srcText[f]))) (rewritten[f] = rewritten[f] || []).push(p);
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
  Object.keys(rewritten).sort().forEach(f => {
    const pages = rewritten[f];
    r.fail(f + " is not in the built stylesheets as it is in the source (minified or rewritten by the build?): " + pages.length + " page(s), the first " + pages[0] + " [" + per[pages[0]].join(", ") + "]");
  });
}

/* ------------------------------------------------------------- runner ---- */

const CHECKS = [
  { name: "pages", run: checkPages, what: "every source page is in dist at the same path, and no file the site is not made of" },
  { name: "links", run: checkLinks, what: "relative hrefs/srcs in dist resolve inside dist, anchors to ids" },
  { name: "root-absolute", run: checkRootAbsolute, what: "no attribute value, and no url() in the CSS, is a root-absolute path" },
  { name: "main", run: checkMain, what: "<main> of every page is the source's, by fingerprint" },
  { name: "shell", run: checkShell, what: "and so is the page around it, but for the links to its own stylesheets and icon" },
  { name: "scripts", run: checkScripts, what: "same script tags per page, attributes and all; assets/ and data/ scripts copied byte for byte" },
  { name: "secrets", run: checkSecrets, what: "no server-side key in any built file, as text or inside a JWT" },
  { name: "stylesheets", run: checkStylesheets, what: "chapter pages share their stylesheets; source CSS unchanged, cascade in source order" }
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
